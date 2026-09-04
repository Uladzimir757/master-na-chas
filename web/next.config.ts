import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure client-side app (no API routes, no server-side data fetching) —
  // static export lets it run as a plain static site (Render Static Site),
  // no Node server / cold starts needed.
  output: "export",
};

export default nextConfig;
