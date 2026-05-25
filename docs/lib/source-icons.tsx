import type { LoaderPlugin } from 'fumadocs-core/source'
import {
  ArrowsClockwise,
  BookOpen,
  BookOpenText,
  BracketsCurly,
  ClockCountdown,
  CompassTool,
  Cube,
  Database,
  FileCode,
  Files,
  FloppyDiskBack,
  Globe,
  Gauge,
  Lightning,
  Lock,
  Package,
  ShieldCheck,
  SidebarSimple,
  Sparkle,
  Stack,
  TerminalWindow,
  Upload,
  Waveform
} from '@phosphor-icons/react/dist/ssr'
import type { ReactNode } from 'react'

const icons = {
  ArrowsClockwise,
  BookOpen,
  BookOpenText,
  BracketsCurly,
  ClockCountdown,
  CompassTool,
  Cube,
  Database,
  FileCode,
  Files,
  FloppyDiskBack,
  Gauge,
  Globe,
  Lightning,
  Lock,
  Package,
  ShieldCheck,
  SidebarSimple,
  Sparkle,
  Stack,
  TerminalWindow,
  Upload,
  Waveform
} as const

function resolveIcon(icon: string | undefined): ReactNode {
  if (!icon) return undefined

  const Icon = icons[icon as keyof typeof icons]
  if (!Icon) return undefined

  return <Icon className="size-4.5" />
}

function replaceIcon<T extends { icon?: unknown }>(node: T): T {
  if (node.icon === undefined || typeof node.icon === 'string') {
    return {
      ...node,
      icon: resolveIcon(node.icon as string | undefined)
    }
  }

  return node
}

export function phosphorIconsPlugin(): LoaderPlugin {
  return {
    name: 'hyperin:phosphor-icons',
    transformPageTree: {
      file: replaceIcon,
      folder: replaceIcon,
      separator: replaceIcon
    }
  }
}
