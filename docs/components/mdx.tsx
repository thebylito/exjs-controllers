import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger
} from 'fumadocs-ui/components/codeblock'
import type { MDXComponents } from 'mdx/types'

import {
  ExportGrid,
  FeatureGrid,
  OverviewCards,
  SetupSteps
} from '@/components/rich-content'

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    CodeBlockTab,
    CodeBlockTabs,
    CodeBlockTabsList,
    CodeBlockTabsTrigger,
    ExportGrid,
    FeatureGrid,
    OverviewCards,
    SetupSteps,
    ...components
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
