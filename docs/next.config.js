import { createMDX } from 'fumadocs-mdx/next'

export default createMDX()({
  output: 'export',
  reactStrictMode: true,
  turbopack: {
    root: import.meta.dirname
  },
  images: {
    unoptimized: true
  }
})
