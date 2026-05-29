import { EventEmitter } from 'node:events'

import pino from 'pino'
import { describe, expect, it } from 'vitest'

import { createHttpLoggerMiddleware } from '#exjs-controllers/logging/httpLogger'
import { captureRequestTraceContext } from '#exjs-controllers/logging/logger'

class FakeResponse extends EventEmitter {
  statusCode = 200
  writableFinished = false
  socket = { localAddress: '192.168.0.1' }
  locals: Record<string, unknown> = {}

  private readonly headers = new Map<string, string>()

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value)
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase())
  }
}

function buildRequest(
  overrides: { ip?: string; headers?: Record<string, string> } = {},
) {
  const headers = overrides.headers ?? {}
  return {
    method: 'GET',
    path: '/some-path',
    url: '/some-path',
    ip: 'ip' in overrides ? overrides.ip : '10.0.0.5',
    socket: { remoteAddress: '172.16.0.9' },
    get(header: string) {
      return headers[header.toLowerCase()]
    },
  }
}

async function captureLog(
  request: ReturnType<typeof buildRequest> = buildRequest(),
): Promise<string> {
  const chunks: string[] = []
  const logger = pino(
    { base: undefined, timestamp: false },
    {
      write(chunk: string) {
        chunks.push(chunk)
        return true
      },
    },
  )
  const middleware = createHttpLoggerMiddleware({
    logger,
    genCorrelationId: () => 'some_uuid',
  })

  const response = new FakeResponse()
  await middleware(request as never, response as never, () => {
    response.statusCode = 200
    response.writableFinished = true
    response.emit('close')
  })

  expect(chunks).toHaveLength(1)
  return chunks[0]
}

describe('createHttpLoggerMiddleware', () => {
  it('emite correlationId exatamente uma vez (sem chave duplicada no JSON)', async () => {
    const chunk = await captureLog()

    const occurrences = chunk.match(/"correlationId"/g) ?? []
    expect(occurrences).toHaveLength(1)

    const payload = JSON.parse(chunk) as { correlationId: string }
    expect(payload.correlationId).toBe('some_uuid')
  })

  it('inclui traceId/spanId capturados no log de acesso (emitido no close)', async () => {
    const chunks: string[] = []
    const logger = pino(
      { base: undefined, timestamp: false },
      {
        write(chunk: string) {
          chunks.push(chunk)
          return true
        },
      },
    )
    const middleware = createHttpLoggerMiddleware({
      logger,
      genCorrelationId: () => 'some_uuid',
    })

    const response = new FakeResponse()
    await middleware(buildRequest() as never, response as never, () => {
      // Simula o que tracing.ts faz quando o span do controller inicia,
      // dentro do escopo de log da request.
      captureRequestTraceContext(
        'abcdef0123456789abcdef0123456789',
        '0123456789abcdef',
      )
      response.statusCode = 200
      response.writableFinished = true
      response.emit('close')
    })

    const payload = JSON.parse(chunks[0]) as {
      traceId?: string
      spanId?: string
    }
    expect(payload.traceId).toBe('abcdef0123456789abcdef0123456789')
    expect(payload.spanId).toBe('0123456789abcdef')
  })

  it('usa request.ip como remoteIp do cliente', async () => {
    const chunk = await captureLog(buildRequest({ ip: '203.0.113.10' }))

    const payload = JSON.parse(chunk) as {
      httpRequest: { remoteIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('203.0.113.10')
  })

  it('prioriza CF-Connecting-IP sobre request.ip (cliente real atrás do Cloudflare)', async () => {
    const chunk = await captureLog(
      buildRequest({
        ip: '10.0.1.14',
        headers: { 'cf-connecting-ip': '198.51.100.7' },
      }),
    )

    const payload = JSON.parse(chunk) as {
      httpRequest: { remoteIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('198.51.100.7')
  })

  it('cai para o primeiro hop do X-Forwarded-For quando request.ip está ausente', async () => {
    const chunk = await captureLog(
      buildRequest({
        ip: undefined,
        headers: { 'x-forwarded-for': '203.0.113.10, 70.41.3.18' },
      }),
    )

    const payload = JSON.parse(chunk) as {
      httpRequest: { remoteIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('203.0.113.10')
  })

  it('cai para socket.remoteAddress sem request.ip nem X-Forwarded-For', async () => {
    const chunk = await captureLog(buildRequest({ ip: undefined }))

    const payload = JSON.parse(chunk) as {
      httpRequest: { remoteIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('172.16.0.9')
  })
})
