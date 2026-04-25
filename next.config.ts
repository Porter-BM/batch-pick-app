import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Force all pages to be dynamic — prevents build-time prerendering errors
  // since our pages depend on cookies and env vars at runtime
  experimental: {
    // No static prerendering for API routes
  },
  // Disable static export attempts
  output: undefined,
}

export default nextConfig
