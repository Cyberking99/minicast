// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {OracleVerifier} from "./OracleVerifier.sol";
import {FeeCollector} from "./FeeCollector.sol";

/// @title PredictionPool
/// @notice Parimutuel prediction pools with Venice AI oracle resolution.
/// State machine: OPEN → LOCKED → RESOLVED → SETTLED
contract PredictionPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint8 public constant STATUS_OPEN = 0;
    uint8 public constant STATUS_LOCKED = 1;
    uint8 public constant STATUS_RESOLVED = 2;
    uint8 public constant STATUS_SETTLED = 3;

    uint256 public constant MAX_FEE_BPS = 500;
    uint256 public constant MIN_OPTIONS = 2;
    uint256 public constant MAX_OPTIONS = 10;
    uint256 public constant MIN_STAKE_LEAD = 10 seconds;
    uint256 public constant MIN_RESOLUTION_GAP = 10 seconds;

    struct Pool {
        bytes32 id;
        string question;
        string[] options;
        uint256 stakeDeadline;
        uint256 resolutionDeadline;
        uint256 disputeWindow;
        uint256 resolvedAt;
        uint8 winningOption;
        uint8 status;
        uint256 totalPool;
        uint256 protocolFeeBps;
        address creator;
        bytes32 verdictHash;
        uint8 verdictCount;
    }

    struct Stake {
        address staker;
        uint8 optionId;
        uint256 amount;
        uint256 timestamp;
    }

    IERC20 public immutable usdc;
    OracleVerifier public immutable oracleVerifier;
    FeeCollector public immutable feeCollector;
    address public trustedRelayer;

    mapping(bytes32 => Pool) public pools;
    mapping(bytes32 => Stake[]) internal poolStakes;
    mapping(bytes32 => mapping(uint8 => uint256)) public optionTotals;
    mapping(bytes32 => mapping(address => Stake[])) public stakerPositions;
    mapping(bytes32 => bool) public disputeRaised;

    event PoolCreated(
        bytes32 indexed poolId,
        string question,
        string[] options,
        uint256 stakeDeadline
    );
    event Staked(bytes32 indexed poolId, address indexed staker, uint8 optionId, uint256 amount);
    event PoolLocked(bytes32 indexed poolId);
    event VerdictSubmitted(bytes32 indexed poolId, uint8 winningOption, bytes32 verdictHash);
    event DisputeRaised(bytes32 indexed poolId, address indexed disputer);
    event Settled(bytes32 indexed poolId, uint8 winningOption, uint256 distributable);
    event PayoutSent(bytes32 indexed poolId, address indexed winner, uint256 amount);
    event Refunded(bytes32 indexed poolId, address indexed staker, uint256 amount);
    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);

    constructor(
        address usdcToken,
        address oracleVerifier_,
        address feeCollector_,
        address initialRelayer
    ) Ownable(msg.sender) {
        require(usdcToken != address(0), "PredictionPool: zero usdc");
        require(oracleVerifier_ != address(0), "PredictionPool: zero verifier");
        require(feeCollector_ != address(0), "PredictionPool: zero fee collector");

        usdc = IERC20(usdcToken);
        oracleVerifier = OracleVerifier(oracleVerifier_);
        feeCollector = FeeCollector(feeCollector_);
        trustedRelayer = initialRelayer;
    }

    function setTrustedRelayer(address newRelayer) external onlyOwner {
        address previous = trustedRelayer;
        trustedRelayer = newRelayer;
        emit RelayerUpdated(previous, newRelayer);
    }

    function createPool(
        string calldata question,
        string[] calldata options,
        uint256 stakeDeadline,
        uint256 resolutionDeadline,
        uint256 disputeWindowSecs,
        uint256 feeBps
    ) external returns (bytes32 poolId) {
        require(bytes(question).length > 0, "PredictionPool: empty question");
        require(options.length >= MIN_OPTIONS && options.length <= MAX_OPTIONS, "PredictionPool: bad options");
        require(stakeDeadline > block.timestamp + MIN_STAKE_LEAD, "PredictionPool: stake deadline too soon");
        require(resolutionDeadline > stakeDeadline + MIN_RESOLUTION_GAP, "PredictionPool: resolution gap");
        require(disputeWindowSecs > 0, "PredictionPool: zero dispute window");
        require(feeBps <= MAX_FEE_BPS, "PredictionPool: fee too high");

        for (uint256 i = 0; i < options.length; i++) {
            require(bytes(options[i]).length > 0, "PredictionPool: empty option");
        }

        poolId = keccak256(abi.encodePacked(question, msg.sender, block.timestamp));

        Pool storage pool = pools[poolId];
        require(pool.status == 0 && pool.totalPool == 0 && pool.creator == address(0), "PredictionPool: exists");

        pool.id = poolId;
        pool.question = question;
        pool.options = options;
        pool.stakeDeadline = stakeDeadline;
        pool.resolutionDeadline = resolutionDeadline;
        pool.disputeWindow = disputeWindowSecs;
        pool.protocolFeeBps = feeBps;
        pool.creator = msg.sender;
        pool.status = STATUS_OPEN;

        emit PoolCreated(poolId, question, options, stakeDeadline);
    }

    function stake(bytes32 poolId, uint8 optionId, uint256 amount) external nonReentrant {
        Pool storage pool = pools[poolId];
        require(pool.status == STATUS_OPEN, "PredictionPool: not open");
        require(block.timestamp < pool.stakeDeadline, "PredictionPool: stake closed");
        require(optionId < pool.options.length, "PredictionPool: bad option");
        require(amount > 0, "PredictionPool: zero amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        poolStakes[poolId].push(
            Stake({staker: msg.sender, optionId: optionId, amount: amount, timestamp: block.timestamp})
        );
        optionTotals[poolId][optionId] += amount;
        pool.totalPool += amount;
        stakerPositions[poolId][msg.sender].push(
            Stake({staker: msg.sender, optionId: optionId, amount: amount, timestamp: block.timestamp})
        );

        emit Staked(poolId, msg.sender, optionId, amount);
    }

    function lockPool(bytes32 poolId) external {
        Pool storage pool = pools[poolId];
        require(pool.creator != address(0), "PredictionPool: unknown pool");
        require(block.timestamp >= pool.stakeDeadline, "PredictionPool: too early");
        require(pool.status == STATUS_OPEN, "PredictionPool: not open");

        pool.status = STATUS_LOCKED;
        emit PoolLocked(poolId);
    }

    function submitVerdict(
        bytes32 poolId,
        uint8 winningOption,
        bytes32 verdictHash,
        bytes calldata oracleSignature
    ) external {
        Pool storage pool = pools[poolId];
        require(pool.status == STATUS_LOCKED || pool.status == STATUS_RESOLVED, "PredictionPool: bad status");
        require(block.timestamp < pool.resolutionDeadline, "PredictionPool: resolution expired");
        require(winningOption < pool.options.length, "PredictionPool: bad winner");
        require(
            oracleVerifier.verifyVerdict(verdictHash, oracleSignature),
            "PredictionPool: invalid oracle sig"
        );

        if (pool.status == STATUS_LOCKED) {
            pool.status = STATUS_RESOLVED;
            pool.resolvedAt = block.timestamp;
            pool.winningOption = winningOption;
            pool.verdictHash = verdictHash;
            pool.verdictCount = 1;
            disputeRaised[poolId] = false;
            emit VerdictSubmitted(poolId, winningOption, verdictHash);
            return;
        }

        // Dispute resolution: second matching verdict finalizes
        require(disputeRaised[poolId], "PredictionPool: no dispute");
        require(pool.verdictCount < 2, "PredictionPool: dispute cap");
        require(winningOption == pool.winningOption, "PredictionPool: verdict mismatch");
        require(verdictHash == pool.verdictHash, "PredictionPool: hash mismatch");

        pool.verdictCount = 2;
        disputeRaised[poolId] = false;
        emit VerdictSubmitted(poolId, winningOption, verdictHash);
    }

    function raiseDispute(bytes32 poolId) external {
        Pool storage pool = pools[poolId];
        require(pool.status == STATUS_RESOLVED, "PredictionPool: not resolved");
        require(block.timestamp < pool.resolvedAt + pool.disputeWindow, "PredictionPool: dispute closed");
        require(stakerPositions[poolId][msg.sender].length > 0, "PredictionPool: not staker");
        require(pool.verdictCount < 2, "PredictionPool: dispute cap");

        disputeRaised[poolId] = true;
        emit DisputeRaised(poolId, msg.sender);
    }

    function settle(bytes32 poolId) external nonReentrant {
        Pool storage pool = pools[poolId];
        require(pool.status == STATUS_RESOLVED, "PredictionPool: not resolved");
        require(!disputeRaised[poolId], "PredictionPool: dispute open");
        require(
            block.timestamp >= pool.resolvedAt + pool.disputeWindow || pool.verdictCount >= 2,
            "PredictionPool: dispute window"
        );

        _executeSettlement(poolId, pool);
    }

    /// @notice 1Shot relay entry — validates payouts then transfers USDC.
    function batchPayout(bytes32 poolId, address[] calldata winners, uint256[] calldata amounts)
        external
        nonReentrant
    {
        require(msg.sender == trustedRelayer, "PredictionPool: not relayer");
        Pool storage pool = pools[poolId];
        require(pool.status == STATUS_RESOLVED, "PredictionPool: not resolved");
        require(!disputeRaised[poolId], "PredictionPool: dispute open");
        require(
            block.timestamp >= pool.resolvedAt + pool.disputeWindow || pool.verdictCount >= 2,
            "PredictionPool: dispute window"
        );
        require(winners.length == amounts.length, "PredictionPool: length mismatch");

        (uint256 distributable, uint256 winningTotal, bool unresolvable) =
            _settlementTotals(poolId, pool);

        if (unresolvable) {
            _refundAll(poolId, pool);
            return;
        }

        uint256 computed;
        for (uint256 i = 0; i < winners.length; i++) {
            require(winners[i] != address(0), "PredictionPool: zero winner");
            computed += amounts[i];
            usdc.safeTransfer(winners[i], amounts[i]);
            emit PayoutSent(poolId, winners[i], amounts[i]);
        }

        uint256 fee = (pool.totalPool * pool.protocolFeeBps) / 10_000;
        require(computed <= distributable, "PredictionPool: overpay");

        uint256 feeAmount = pool.totalPool - computed;
        if (feeAmount > fee) {
            feeAmount = fee;
        }
        if (feeAmount > 0) {
            usdc.safeTransfer(address(feeCollector), feeAmount);
        }

        pool.status = STATUS_SETTLED;
        emit Settled(poolId, pool.winningOption, distributable);
    }

    function getPoolStakes(bytes32 poolId) external view returns (Stake[] memory) {
        return poolStakes[poolId];
    }

    function getPoolOptions(bytes32 poolId) external view returns (string[] memory) {
        return pools[poolId].options;
    }

    function computePayouts(bytes32 poolId)
        external
        view
        returns (address[] memory winners, uint256[] memory amounts, uint256 fee, bool unresolvable)
    {
        Pool storage pool = pools[poolId];
        (uint256 distributable, uint256 winningTotal, bool isUnresolvable) = _settlementTotals(poolId, pool);
        fee = (pool.totalPool * pool.protocolFeeBps) / 10_000;
        unresolvable = isUnresolvable;

        if (isUnresolvable) {
            return (new address[](0), new uint256[](0), fee, true);
        }

        Stake[] storage stakes = poolStakes[poolId];
        uint256 count;
        for (uint256 i = 0; i < stakes.length; i++) {
            if (stakes[i].optionId == pool.winningOption) {
                count++;
            }
        }

        winners = new address[](count);
        amounts = new uint256[](count);
        uint256 idx;
        for (uint256 i = 0; i < stakes.length; i++) {
            if (stakes[i].optionId == pool.winningOption) {
                winners[idx] = stakes[i].staker;
                amounts[idx] = (stakes[i].amount * distributable) / winningTotal;
                idx++;
            }
        }
    }

    function _executeSettlement(bytes32 poolId, Pool storage pool) internal {
        (uint256 distributable, uint256 winningTotal, bool unresolvable) = _settlementTotals(poolId, pool);

        if (unresolvable) {
            _refundAll(poolId, pool);
            return;
        }

        uint256 fee = (pool.totalPool * pool.protocolFeeBps) / 10_000;
        uint256 paid;
        Stake[] storage stakes = poolStakes[poolId];

        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage s = stakes[i];
            if (s.optionId != pool.winningOption) continue;

            uint256 payout = (s.amount * distributable) / winningTotal;
            paid += payout;
            usdc.safeTransfer(s.staker, payout);
            emit PayoutSent(poolId, s.staker, payout);
        }

        uint256 remainder = pool.totalPool - paid;
        if (remainder > fee) {
            remainder = fee;
        }
        if (remainder > 0) {
            usdc.safeTransfer(address(feeCollector), remainder);
        }

        pool.status = STATUS_SETTLED;
        emit Settled(poolId, pool.winningOption, distributable);
    }

    function _settlementTotals(bytes32 poolId, Pool storage pool)
        internal
        view
        returns (uint256 distributable, uint256 winningTotal, bool unresolvable)
    {
        uint256 fee = (pool.totalPool * pool.protocolFeeBps) / 10_000;
        distributable = pool.totalPool - fee;
        winningTotal = optionTotals[poolId][pool.winningOption];

        uint256 losingPool;
        for (uint8 i = 0; i < pool.options.length; i++) {
            if (i != pool.winningOption) {
                losingPool += optionTotals[poolId][i];
            }
        }

        unresolvable = winningTotal == 0 || losingPool == 0;
    }

    function _refundAll(bytes32 poolId, Pool storage pool) internal {
        Stake[] storage stakes = poolStakes[poolId];
        for (uint256 i = 0; i < stakes.length; i++) {
            uint256 amount = stakes[i].amount;
            usdc.safeTransfer(stakes[i].staker, amount);
            emit Refunded(poolId, stakes[i].staker, amount);
        }
        pool.status = STATUS_SETTLED;
        emit Settled(poolId, type(uint8).max, pool.totalPool);
    }
}
