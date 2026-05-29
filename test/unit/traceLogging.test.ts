import {
  context,
  ROOT_CONTEXT,
  trace,
  type Context,
  type ContextManager,
  type Span,
} from '@opentelemetry/api'
import pino from 'pino'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildPinoOptions } from '#exjs-controllers/logging/logger'

const VALID_SPAN = {
  spanContext: () => ({
    traceId: 'abcdef0123456789abcdef0123456789',
    spanId: '0123456789abcdef',
    traceFlags: 1,
  }),
} as unknown as Span

// O `@opentelemetry/api` sozinho usa um context manager no-op, então
// `getActiveSpan()` nunca enxerga um span. Registramos um manager síncrono
// mínimo para exercitar o mixin sem depender do SDK.
class SyncContextManager implements ContextManager {
  private current: Context = ROOT_CONTEXT

  active(): Context {
    return this.current
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    next: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previous = this.current
    this.current = next
    try {
      return fn.call(thisArg, ...args)
    } finally {
      this.current = previous
    }
  }

  bind<T>(_context: Context, target: T): T {
    return target
  }

  enable(): this {
    return this
  }

  disable(): this {
    return this
  }
}

function buildCapturingLogger() {
  const chunks: string[] = []
  const logger = pino(
    { ...buildPinoOptions(), base: undefined, timestamp: false },
    {
      write(chunk: string) {
        chunks.push(chunk)
        return true
      },
    },
  )

  return { logger, chunks }
}

describe('buildPinoOptions trace mixin', () => {
  beforeAll(() => {
    context.setGlobalContextManager(new SyncContextManager())
  })

  it('carimba traceId/spanId do span ativo nos logs', () => {
    const { logger, chunks } = buildCapturingLogger()

    const ctxWithSpan = trace.setSpan(context.active(), VALID_SPAN)
    context.with(ctxWithSpan, () => {
      logger.info('dentro do span')
    })

    const payload = JSON.parse(chunks[0]) as {
      traceId?: string
      spanId?: string
    }
    expect(payload.traceId).toBe('abcdef0123456789abcdef0123456789')
    expect(payload.spanId).toBe('0123456789abcdef')
  })

  it('não adiciona traceId/spanId quando não há span ativo', () => {
    const { logger, chunks } = buildCapturingLogger()

    logger.info('sem span')

    const payload = JSON.parse(chunks[0]) as {
      traceId?: string
      spanId?: string
    }
    expect(payload.traceId).toBeUndefined()
    expect(payload.spanId).toBeUndefined()
  })
})
