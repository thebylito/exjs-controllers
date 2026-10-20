import { EventEmitter } from 'node:events'

import pino from 'pino'
import { describe, expect, it } from 'vitest'

import {
  CORRELATION_ID_PATTERN,
  createHttpLoggerMiddleware,
  type HttpLoggerOptions,
} from '#exjs-controllers/logging/httpLogger'
import {
  captureRequestTraceContext,
  logger,
} from '#exjs-controllers/logging/logger'

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
  overrides: {
    ip?: string
    url?: string
    headers?: Record<string, string>
  } = {},
) {
  const headers = overrides.headers ?? {}
  return {
    method: 'GET',
    path: '/some-path',
    url: overrides.url ?? '/some-path',
    ip: 'ip' in overrides ? overrides.ip : '10.0.0.5',
    socket: { remoteAddress: '172.16.0.9', bytesRead: 0 },
    get(header: string) {
      return headers[header.toLowerCase()]
    },
  }
}

async function captureLog(
  request: ReturnType<typeof buildRequest> = buildRequest(),
  loggerOptions: Pick<
    HttpLoggerOptions,
    'remoteIpHeaders' | 'logQueryString'
  > = {},
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
    ...loggerOptions,
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

  it('ignora CF-Connecting-IP e True-Client-IP por padrão (usa request.ip)', async () => {
    const chunk = await captureLog(
      buildRequest({
        ip: '10.0.1.14',
        headers: {
          'cf-connecting-ip': '198.51.100.7',
          'true-client-ip': '198.51.100.8',
        },
      }),
    )

    const payload = JSON.parse(chunk) as {
      httpRequest: { remoteIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('10.0.1.14')
  })

  it('usa o primeiro header presente de remoteIpHeaders quando configurado', async () => {
    const chunk = await captureLog(
      buildRequest({
        ip: '10.0.1.14',
        headers: { 'true-client-ip': '198.51.100.8' },
      }),
      { remoteIpHeaders: ['cf-connecting-ip', 'true-client-ip'] },
    )

    const payload = JSON.parse(chunk) as {
      httpRequest: { remoteIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('198.51.100.8')
  })

  it('omite a query string da URL e do referrer por padrão', async () => {
    const chunk = await captureLog(
      buildRequest({
        url: '/users?token=abc',
        headers: { referer: 'https://x.test/a?b=1' },
      }),
    )

    const payload = JSON.parse(chunk) as {
      httpRequest: { requestUrl: string; referrer: string }
    }
    expect(payload.httpRequest.requestUrl).toBe('/users')
    expect(payload.httpRequest.referrer).toBe('https://x.test/a')
  })

  it('inclui a query string com logQueryString: true', async () => {
    const chunk = await captureLog(
      buildRequest({
        url: '/users?token=abc',
        headers: { referer: 'https://x.test/a?b=1' },
      }),
      { logQueryString: true },
    )

    const payload = JSON.parse(chunk) as {
      httpRequest: { requestUrl: string; referrer: string }
    }
    expect(payload.httpRequest.requestUrl).toBe('/users?token=abc')
    expect(payload.httpRequest.referrer).toBe('https://x.test/a?b=1')
  })

  it('não usa X-Forwarded-For cru: sem request.ip cai para socket.remoteAddress', async () => {
    const chunk = await captureLog(
      buildRequest({
        ip: undefined,
        headers: { 'x-forwarded-for': '203.0.113.10, 70.41.3.18' },
      }),
    )

    const payload = JSON.parse(chunk) as {
      httpRequest: { remoteIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('172.16.0.9')
    expect(chunk).not.toContain('203.0.113.10')
  })

  it('mantém o remoteIp capturado na entrada quando o socket já fechou no close', async () => {
    const chunks: string[] = []
    const testLogger = pino(
      { base: undefined, timestamp: false },
      {
        write(chunk: string) {
          chunks.push(chunk)
          return true
        },
      },
    )
    const middleware = createHttpLoggerMiddleware({
      logger: testLogger,
      genCorrelationId: () => 'some_uuid',
    })
    const request = buildRequest({
      headers: { 'x-forwarded-for': '6.6.6.6' },
    }) as any
    const response = new FakeResponse() as any
    await middleware(request, response, () => {
      // Cliente abortou: Node/Express já não sabem o endereço no `close`.
      request.ip = undefined
      request.socket.remoteAddress = undefined
      response.socket = undefined
      response.emit('close')
    })

    expect(chunks).toHaveLength(1)
    const payload = JSON.parse(chunks[0]) as {
      httpRequest: { remoteIp: string; serverIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('10.0.0.5')
    expect(payload.httpRequest.serverIp).toBe('192.168.0.1')
    expect(chunks[0]).not.toContain('6.6.6.6')
  })

  it('cai para socket.remoteAddress sem request.ip nem X-Forwarded-For', async () => {
    const chunk = await captureLog(buildRequest({ ip: undefined }))

    const payload = JSON.parse(chunk) as {
      httpRequest: { remoteIp: string }
    }
    expect(payload.httpRequest.remoteIp).toBe('172.16.0.9')
  })

  // Roda o handler do request com um stream próprio, emitindo um log via o
  // `logger` (proxy) de dentro do contexto de request — i.e. o child logger
  // criado pelo middleware, que herda o nível do logger base montado por
  // createDefaultLogger.
  async function runWithLevel(level?: 'debug' | 'info'): Promise<string[]> {
    const chunks: string[] = []
    const middleware = createHttpLoggerMiddleware({
      logFormat: 'json',
      level,
      genCorrelationId: () => 'some_uuid',
      stream: {
        write(chunk: string) {
          chunks.push(chunk)
          return true
        },
      },
    })

    const response = new FakeResponse()
    await middleware(buildRequest() as never, response as never, () => {
      logger.debug({ marker: 'dbg' }, 'mensagem debug')
      response.statusCode = 200
      response.writableFinished = true
      response.emit('close')
    })

    return chunks
  }

  it('emite logs debug quando level: "debug" é configurado', async () => {
    const chunks = await runWithLevel('debug')
    const debugLine = chunks.find((c) => c.includes('mensagem debug'))
    expect(debugLine).toBeDefined()
    expect((JSON.parse(debugLine!) as { marker: string }).marker).toBe('dbg')
  })

  it('descarta logs debug no nível padrão (info)', async () => {
    const chunks = await runWithLevel()
    expect(chunks.some((c) => c.includes('mensagem debug'))).toBe(false)
    // o log de acesso (info, emitido no close) ainda sai.
    expect(chunks.some((c) => c.includes('httpRequest'))).toBe(true)
  })
})

describe('createHttpLoggerMiddleware — hardening', () => {
  function build(genId = () => 'some_uuid') {
    const lines: Array<Record<string, any>> = []
    const testLogger = pino(
      { base: undefined, timestamp: false },
      {
        write(chunk: string) {
          lines.push(JSON.parse(chunk))
          return true
        },
      },
    )
    const middleware = createHttpLoggerMiddleware({
      logger: testLogger,
      genCorrelationId: genId,
    })
    return { lines, middleware }
  }

  it('requestSize é "-" sem Content-Length e nunca serializa o body', async () => {
    const { lines, middleware } = build()
    const request = buildRequest() as any
    request.body = {
      toJSON() {
        throw new Error('must not stringify')
      },
    }
    const response = new FakeResponse()
    await middleware(request, response as never, () => {
      response.emit('close')
    })

    expect(lines).toHaveLength(1)
    expect(lines[0].httpRequest.requestSize).toBe('-')
  })

  it('requestSize usa o Content-Length quando presente', async () => {
    const { lines, middleware } = build()
    const request = buildRequest({ headers: { 'content-length': '1234' } }) as any
    const response = new FakeResponse()
    await middleware(request, response as never, () => {
      response.emit('close')
    })

    expect(lines[0].httpRequest.requestSize).toBe('1234')
  })

  it('não propaga exceção quando o stream de log lança (info e warn falham)', async () => {
    const middleware = createHttpLoggerMiddleware({
      genCorrelationId: () => 'some_uuid',
      stream: {
        write() {
          throw new Error('ENOSPC')
        },
      },
    })
    const response = new FakeResponse()
    let emitted = false
    await middleware(buildRequest() as never, response as never, () => {
      expect(() => response.emit('close')).not.toThrow()
      emitted = true
    })

    expect(emitted).toBe(true)
  })

  it('não propaga exceção quando montar o payload falha', async () => {
    const { lines, middleware } = build()
    const base = buildRequest()
    const request = {
      ...base,
      get(header: string) {
        if (header.toLowerCase() === 'user-agent') {
          throw new Error('boom')
        }
        return base.get(header)
      },
    }
    const response = new FakeResponse()
    await middleware(request as never, response as never, () => {
      expect(() => response.emit('close')).not.toThrow()
    })

    const warnLines = lines.filter((line) => line.level === 40)
    expect(warnLines).toHaveLength(1)
    expect(warnLines[0].msg).toBe('[httpLogger] failed to write the access log')
  })

  it('ignora correlation id inválido (>128 chars ou fora de [A-Za-z0-9._:-]) e gera um novo', async () => {
    for (const invalidId of ['a'.repeat(129), 'bad id\nwith spaces']) {
      const { lines, middleware } = build()
      const request = buildRequest({
        headers: { 'x-correlation-id': invalidId },
      })
      const response = new FakeResponse()
      await middleware(request as never, response as never, () => {
        response.emit('close')
      })

      expect(lines[0].correlationId).not.toBe(invalidId)
      expect(lines[0].correlationId).toBe('some_uuid')
      expect(response.getHeader('x-correlation-id')).toMatch(
        CORRELATION_ID_PATTERN,
      )
    }
  })

  it('aceita correlation id válido vindo do header', async () => {
    const { lines, middleware } = build()
    const request = buildRequest({ headers: { 'x-correlation-id': 'abc-1.2:3_4' } })
    const response = new FakeResponse()
    await middleware(request as never, response as never, () => {
      response.emit('close')
    })
    expect(lines[0].correlationId).toBe('abc-1.2:3_4')
  })
})
