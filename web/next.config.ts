import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure client-side app (no API routes, no server-side data fetching) —
  // static export lets it run as a plain static site (Render Static Site),
  // no Node server / cold starts needed.
  output: "export",
  // Without this, /cabinet builds to a file cabinet.html rather than
  // cabinet/index.html — and a plain static file server only serves
  // index.html for a request to a directory, not by guessing extensions.
  // Didn't matter with a single-page site ("/" only); with more than one
  // route (the master cabinet), a direct visit or refresh on /cabinet would
  // 404 without this.
  trailingSlash: true,
  // Static export has no server to run the Image Optimization API — next/image
  // (used by components/Hero.tsx) needs the built-in optimizer disabled to
  // just serve the source file as-is.
  images: { unoptimized: true },
};

export default nextConfig;
