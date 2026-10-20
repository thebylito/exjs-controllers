import { MulterError } from 'multer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { configureApplication } from '#exjs-controllers/config/configureApplication'
import { UnauthorizedError } from '#exjs-controllers/core/authentication/errors'
import { _resetRoutesForTests } from '#exjs-controllers/core/Router'
import type { UseCase } from '#exjs-controllers/core/UseCase'
import { Controller, JsonController } from '#exjs-controllers/decorators/Controller'
import { DefineUseCase } from '#exjs-controllers/decorators/DefineUseCase'
import { Inject, Injectable } from '#exjs-controllers/decorators/DependencyInjection'
import { Field } from '#exjs-controllers/decorators/Field'
import { Get, Post } from '#exjs-controllers/decorators/HttpMethod'
import { Body, Res, UploadedFile } from '#exjs-controllers/decorators/Params'
import { createDefaultErrorHandler, resolveErrorStatus } from '#exjs-controllers/http/errorHandler'
import { createApplication, type Application } from '#exjs-controllers/http/application'
import { BaseSchema } from '#exjs-controllers/schemas/BaseSchema'

class ItemInput extends BaseSchema {
  @Field(z.string().min(1))
  name!: string
}

@Injectable()
@DefineUseCase()
class CreateItem implements UseCase<ItemInput, { name: string }> {
  execute(input: ItemInput) {
    return { name: input.name }
  }
}

@JsonController('/e')
class ErrorsController {
  constructor(@Inject(CreateItem) private readonly createItem: CreateItem) {}

  @Get('/boom')
  boom() {
    throw new Error('redis://10.0.0.5:6379 refused')
  }

  @Get('/unauthorized')
  unauthorized() {
    throw new UnauthorizedError()
  }

  @Post('/item')
  item(@Body(ItemInput) input: ItemInput) {
    return this.createItem.execute(input)
  }

  @Get('/partial')
  partial(@Res() res: any) {
    res.write('partial')
    throw new Error('late failure')
  }
}

@Controller('/up')
class UploadController {
  @Post('/one')
  one(@UploadedFile('file') file: any) {
    return { size: file?.size ?? 0 }
  }
}

describe('resolveErrorStatus', () => {
  it.each([
    [new UnauthorizedError(), 401],
    [Object.assign(new Error('x'), { statusCode: 422 }), 422],
    [new MulterError('LIMIT_FILE_SIZE'), 413],
    [new MulterError('LIMIT_UNEXPECTED_FILE'), 400],
    [new Error('x'), 500],
    [Object.assign(new Error('x'), { status: 999 }), 500],
    [null, 500],
    ['boom', 500],
  ])('%s → %i', (error, status) => {
    expect(resolveErrorStatus(error)).toBe(status)
  })
})

describe('createDefaultErrorHandler — headersSent', () => {
  it('delega a next(error) com o mesmo erro e não escreve resposta', () => {
    const error = new Error('late')
    const response = { headersSent: true, status: vi.fn(), json: vi.fn() }
    const next = vi.fn()

    createDefaultErrorHandler()(error, {} as any, response as any, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith(error)
    expect(next.mock.calls[0][0]).toBe(error)
    expect(response.status).not.toHaveBeenCalled()
    expect(response.json).not.toHaveBeenCalled()
  })

  it('responde JSON e não chama next quando headersSent é false', () => {
    const response: any = { headersSent: false, json: vi.fn() }
    response.status = vi.fn().mockReturnValue(response)
    const next = vi.fn()

    createDefaultErrorHandler()(new Error('x'), {} as any, response, next)

    expect(response.status).toHaveBeenCalledWith(500)
    expect(response.json).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Internal Server Error',
    })
    expect(next).not.toHaveBeenCalled()
  })
})

let app: Application | undefined
let baseUrl = ''

async function boot(options: Record<string, unknown> = {}, controllers: any[] = [ErrorsController, UploadController]) {
  _resetRoutesForTests()
  app = createApplication()
  await configureApplication(app, { controllers, logger: false, ...options } as any)
  const started = app
  await new Promise<void>((resolve) => started.listen(0, resolve))
  const address = started.address()
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta TCP')
  baseUrl = `http://127.0.0.1:${address.port}`
}

beforeEach(() => {
  _resetRoutesForTests()
})

afterEach(async () => {
  if (!app) return
  const current = app
  app = undefined
  await new Promise<void>((resolve) => current.close(() => resolve()))
})

describe('default error handler (app sem errorHandler)', () => {
  it('500 não expõe mensagem nem stack', async () => {
    await boot()
    const res = await fetch(`${baseUrl}/e/boom`)
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(JSON.parse(text)).toEqual({ error: 'Internal Server Error', message: 'Internal Server Error' })
    expect(text).not.toContain('redis')
    expect(text).not.toContain('at ')
  })

  it('422 do use case inclui issues', async () => {
    await boot()
    const res = await fetch(`${baseUrl}/e/item`, { method: 'POST' })
    const body = (await res.json()) as any
    expect(res.status).toBe(422)
    expect(body.error).toBe('Unprocessable Entity')
    expect(typeof body.message).toBe('string')
    expect(body.message).not.toBe('Internal Server Error')
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it('401 responde { error: "Unauthorized", message: "Unauthorized" }', async () => {
    await boot()
    const res = await fetch(`${baseUrl}/e/unauthorized`)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized', message: 'Unauthorized' })
  })

  it('LIMIT_FILE_SIZE responde 413', async () => {
    await boot()
    const boundary = 'xBOUNDARYx'
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.alloc(17 * 1024 * 1024),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const res = await fetch(`${baseUrl}/up/one`, {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: 'Payload Too Large' })
  })

  it('delega a next(error) quando headersSent (sem segundo corpo JSON)', async () => {
    await boot()
    let text = ''
    try {
      const res = await fetch(`${baseUrl}/e/partial`)
      text = await res.text()
    } catch {
      // Express pode derrubar a conexão; nesse caso não houve segundo corpo.
    }
    expect(text).not.toContain('"error"')
    expect(text).not.toContain('late failure')
  })

  it('errorHandler do consumidor tem precedência', async () => {
    await boot({
      errorHandler: (_e: any, _req: any, res: any, _next: any) => {
        res.status(418).json({ custom: true })
      },
    })
    const res = await fetch(`${baseUrl}/e/boom`)
    expect(res.status).toBe(418)
    expect(await res.json()).toEqual({ custom: true })
  })

  it('errorHandler com 3 parâmetros falha no bootstrap', async () => {
    const instance = createApplication()
    await expect(
      configureApplication(instance, {
        controllers: [ErrorsController],
        logger: false,
        errorHandler: ((_e: any, _req: any, _res: any) => {}) as any,
      }),
    ).rejects.toThrow(/4 parâmetros/)
  })
})
