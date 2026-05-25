import { Stack } from '@phosphor-icons/react/dist/ssr'
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <Stack weight="duotone" className="size-5 text-fd-primary" />
          <span>exjs-controllers</span>
        </span>
      )
    },
    githubUrl: 'https://github.com/thebylito/exjs-controllers'
  }
}
