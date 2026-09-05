import Link from 'next/link'

// The docs are statically exported (GitHub Pages), so the home page redirects
// with a meta refresh instead of `redirect()`, which would depend on client JS
// and on the router applying `basePath`.
const basePath = process.env.DOCS_BASE_PATH ?? ''
const docsUrl = `${basePath}/docs/`

export default function HomePage() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${docsUrl}`} />
      <main className="flex min-h-screen items-center justify-center p-8">
        <p>
          Redirecting to the{' '}
          <Link href="/docs" className="underline">
            documentation
          </Link>
          …
        </p>
      </main>
    </>
  )
}
