/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "**",
        },
      ],
    },
  webpack: (config) => {
    // Use the browser build of Transformers.js (avoids onnxruntime-node)
    const path = require('path');
    config.resolve.alias = {
      ...config.resolve.alias,
      '@huggingface/transformers': path.resolve(__dirname, 'node_modules/@huggingface/transformers/dist/transformers.js'),
      'onnxruntime-node': false,
      'sharp': false,
    };
    return config;
  },
}

module.exports = nextConfig
