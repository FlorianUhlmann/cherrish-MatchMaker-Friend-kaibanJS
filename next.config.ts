import process from "node:process";
import type { NextConfig } from "next";

// Load shared secrets (e.g., symlinked ~/env.shared) so they are present
// before Next.js reads its own .env.local/.env.production files.
if (
  process.env.NODE_ENV === "development" &&
  typeof process.loadEnvFile === "function"
) {
  process.loadEnvFile(".env.shared");
}

const nextConfig: NextConfig = {
  // Silence workspace root inference warning during build
  // by explicitly setting the Turbopack root
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
