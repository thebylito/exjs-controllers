import { docs } from 'collections/server'
import { loader } from 'fumadocs-core/source'

import { phosphorIconsPlugin } from '@/lib/source-icons'

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  plugins: [phosphorIconsPlugin()]
})
