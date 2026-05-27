import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 90],
    localPatterns: [
      {
        pathname: "/api/catalog-image",
      },
      {
        pathname: "/brands/**",
      },
      {
        pathname: "/uploads/products/**",
      },
      {
        pathname: "/rhino-logo.png",
      },
      {
        pathname: "/parabrisas-medallones-van-camioneta-autobuses.webp",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
