/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer, webpack }) => {
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@coinbase\/wallet-sdk|@metamask\/connect-evm|@metamask\/connect-multichain|@safe-global\/safe-apps-sdk|@safe-global\/safe-apps-provider|@base-org\/account|@walletconnect\/ethereum-provider|accounts)$/
      })
    );
    return config;
  }
};

export default nextConfig;

