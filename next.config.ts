import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      { protocol: "https", hostname: "**.controller.com", pathname: "/**" },
      { protocol: "https", hostname: "**.trade-a-plane.com", pathname: "/**" },
      { protocol: "https", hostname: "**.barnstormers.com", pathname: "/**" },
      { protocol: "https", hostname: "**.aso.com", pathname: "/**" },
      { protocol: "https", hostname: "**.globalair.com", pathname: "/**" },
      { protocol: "https", hostname: "**.avbuyer.com", pathname: "/**" },
      { protocol: "https", hostname: "**.aerotrader.com", pathname: "/**" },
      { protocol: "https", hostname: "**.aircraftdealer.com", pathname: "/**" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/**" },
      { protocol: "https", hostname: "cdn-media.tilabs.io", pathname: "/**" },
      { protocol: "https", hostname: "media.sandhills.com", pathname: "/**" },
      { protocol: "https", hostname: "dsgiipnwy1jd8.cloudfront.net", pathname: "/**" },
    ],
    deviceSizes: [640, 828, 1080, 1200],
    imageSizes: [64, 128, 256, 384, 512],
  },
}

export default nextConfig
