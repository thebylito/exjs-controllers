import { createMDX } from 'fumadocs-mdx/next'

// Set by .github/workflows/docs.yml when deploying to GitHub Pages
// (https://thebylito.github.io/exjs-controllers/). Unset for local dev.
const basePath = process.env.DOCS_BASE_PATH ?? ''

export default createMDX()({
  output: 'export',
  basePath,
  trailingSlash: true,
  reactStrictMode: true,
  turbopack: {
    root: import.meta.dirname
  },
  images: {
    unoptimized: true
  }
})
