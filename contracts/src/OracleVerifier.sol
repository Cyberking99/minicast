// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title OracleVerifier
/// @notice Validates ECDSA signatures from the trusted Venice AI oracle wallet.
contract OracleVerifier is Ownable {
    address public trustedOracle;

    event OracleUpdated(address indexed previousOracle, address indexed newOracle);

    constructor(address initialOracle) Ownable(msg.sender) {
        require(initialOracle != address(0), "OracleVerifier: zero oracle");
        trustedOracle = initialOracle;
    }

    /// @notice Recover signer from verdict hash and compare to trusted oracle.
    function verifyVerdict(bytes32 verdictHash, bytes calldata signature) external view returns (bool) {
        return recoverSigner(verdictHash, signature) == trustedOracle;
    }

    function setOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "OracleVerifier: zero oracle");
        address previous = trustedOracle;
        trustedOracle = newOracle;
        emit OracleUpdated(previous, newOracle);
    }

    function recoverSigner(bytes32 hash, bytes calldata signature) public pure returns (address) {
        require(signature.length == 65, "OracleVerifier: bad sig length");

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "OracleVerifier: bad v");

        // Ethereum signed message prefix for personal_sign / signMessage
        bytes32 ethSigned = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        return ecrecover(ethSigned, v, r, s);
    }
}
