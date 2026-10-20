import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configureApplication } from '#exjs-controllers/config/configureApplication'
import { _resetRoutesForTests } from '#exjs-controllers/core/Router'
import {
  DEFAULT_UPLOAD_LIMITS,
  resolveUploadLimits,
} from '#exjs-controllers/core/uploadLimits'
import { Controller } from '#exjs-controllers/decorators/Controller'
import { Post } from '#exjs-controllers/decorators/HttpMethod'
import { UploadedFile, UploadedFiles } from '#exjs-controllers/decorators/Params'
import { createApplication, type Application } from '#exjs-controllers/http/application'

@Controller('/up')
class UploadController {
  @Post('/one')
  one(@UploadedFile('file') file: any) {
    return { size: file?.size ?? 0 }
  }

  @Post('/many')
  many(@UploadedFiles('files') files: any[]) {
    return { count: files?.length ?? 0 }
  }

  @Post('/custom')
  custom(
    @UploadedFile('file', { options: { limits: { fileSize: 32 * 1024 * 1024 } } })
    file: any,
  ) {
    return { size: file?.size ?? 0 }
  }
}

let app: Application | undefined
let baseUrl = ''

beforeEach(async () => {
  _resetRoutesForTests()
  app = createApplication()
  await configureApplication(app, {
    controllers: [UploadController],
    logger: false,
    errorHandler: (error: any, _request, response, _next) => {
      response.status(400).json({ code: error.code ?? error.name })
    },
  })
  const started = app
  await new Promise<void>((resolve) => started.listen(0, resolve))
  const address = started.address()
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta TCP')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  if (!app) return
  const current = app
  app = undefined
  await new Promise<void>((resolve) => current.close(() => resolve()))
})

const BOUNDARY = 'xBOUNDARYx'

function filePart(field: string, content: Buffer, name = 'a.bin'): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    content,
    Buffer.from('\r\n'),
  ])
}

function fieldPart(field: string, value: string): Buffer {
  return Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${field}"\r\n\r\n${value}\r\n`,
  )
}

async function postMultipart(path: string, parts: Buffer[]) {
  const body = Buffer.concat([...parts, Buffer.from(`--${BOUNDARY}--\r\n`)])
  const start = performance.now()
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    body,
  })
  const json = (await response.json()) as any
  return { status: response.status, body: json, elapsedMs: performance.now() - start }
}

describe('upload limits — defaults', () => {
  it('resolveUploadLimits(undefined) devolve DEFAULT_UPLOAD_LIMITS', () => {
    expect(resolveUploadLimits(undefined)).toEqual(DEFAULT_UPLOAD_LIMITS)
  })

  it('resolveUploadLimits sobrescreve só as chaves informadas', () => {
    expect(resolveUploadLimits({ files: 1 })).toEqual({ ...DEFAULT_UPLOAD_LIMITS, files: 1 })
  })

  it('resolveUploadLimits ignora chaves undefined', () => {
    expect(resolveUploadLimits({ files: undefined })).toEqual(DEFAULT_UPLOAD_LIMITS)
  })

  it('rejeita arquivo de 17 MiB com LIMIT_FILE_SIZE em rota sem options', async () => {
    const res = await postMultipart('/up/one', [filePart('file', Buffer.alloc(17 * 1024 * 1024))])
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('LIMIT_FILE_SIZE')
  })

  it('rejeita campo arr[150000000] com LIMIT_FIELD_ARRAY_INDEX em menos de 1 s', async () => {
    const res = await postMultipart('/up/one', [fieldPart('arr[150000000]', 'x')])
    expect(res.body.code).toBe('LIMIT_FIELD_ARRAY_INDEX')
    expect(res.elapsedMs).toBeLessThan(1000)
  })

  it('rejeita a 11ª parte de arquivo com LIMIT_FILE_COUNT em @UploadedFiles', async () => {
    const parts = Array.from({ length: 11 }, (_, i) =>
      filePart('files', Buffer.from('x'), `f${i}.bin`),
    )
    const res = await postMultipart('/up/many', parts)
    expect(res.body.code).toBe('LIMIT_FILE_COUNT')
  })

  it('options.limits do consumidor sobrescreve só as chaves informadas', async () => {
    const ok = await postMultipart('/up/custom', [filePart('file', Buffer.alloc(17 * 1024 * 1024))])
    expect(ok.status).toBe(200)
    expect(ok.body.size).toBe(17 * 1024 * 1024)

    const bad = await postMultipart('/up/custom', [fieldPart('arr[150000000]', 'x')])
    expect(bad.body.code).toBe('LIMIT_FIELD_ARRAY_INDEX')
  })
})

describe('upload limits — logger ativo (uploads-2)', () => {
  it('request multipart chunked com arr[150000000] e logger ativo não gera uncaughtException', async () => {
    // Reconfigura o app com o log de acesso ligado (o beforeEach usa logger: false).
    const previous = app
    app = undefined
    if (previous) await new Promise<void>((resolve) => previous.close(() => resolve()))

    const sink = { write: () => true }
    _resetRoutesForTests()
    app = createApplication()
    await configureApplication(app, {
      controllers: [UploadController],
      logger: { stream: sink },
      errorHandler: (error: any, _request, response, _next) => {
        response.status(400).json({ code: error.code ?? error.name })
      },
    })
    const started = app
    await new Promise<void>((resolve) => started.listen(0, resolve))
    const address = started.address()
    if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta TCP')
    baseUrl = `http://127.0.0.1:${address.port}`

    const uncaught: unknown[] = []
    const previousListeners = process.listeners('uncaughtException')
    process.removeAllListeners('uncaughtException')
    process.on('uncaughtException', (error) => uncaught.push(error))
    try {
      const body = Buffer.concat([
        fieldPart('arr[150000000]', 'x'),
        Buffer.from(`--${BOUNDARY}--\r\n`),
      ])
      // Corpo em stream => Transfer-Encoding: chunked, sem content-length.
      const response = await fetch(`${baseUrl}/up/one`, {
        method: 'POST',
        headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(body))
            controller.close()
          },
        }),
        duplex: 'half',
      } as RequestInit)
      expect(response.status).toBe(400)
      await response.text()

      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(uncaught).toEqual([])
    } finally {
      process.removeAllListeners('uncaughtException')
      for (const listener of previousListeners) process.on('uncaughtException', listener)
    }
  })
})
