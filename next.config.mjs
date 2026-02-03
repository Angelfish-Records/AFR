/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.plasmic.app" },
      { protocol: "https", hostname: "**.plasmiccdn.com" }
    ],
  },
};

export default nextConfig;
