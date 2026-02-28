/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Required for @solana/wallet-adapter and related packages
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

module.exports = nextConfig;
