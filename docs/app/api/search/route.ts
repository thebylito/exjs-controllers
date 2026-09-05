import { createFromSource } from 'fumadocs-core/search/server'

import { source } from '@/lib/source'

// Static export: the search index is generated at build time and queried in
// the browser (RootProvider search type "static" in app/layout.tsx).
export const revalidate = false
export const { staticGET: GET } = createFromSource(source)
