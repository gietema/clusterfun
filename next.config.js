/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
      remotePatterns: [
        {
          protocol: "https",
          hostname: "**",
        },
      ],
    },
}

module.exports = nextConfig
