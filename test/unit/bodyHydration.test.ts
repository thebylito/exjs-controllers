import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { configureApplication } from '#exjs-controllers/config/configureApplication'
import { _resetRoutesForTests } from '#exjs-controllers/core/Router'
import type { UseCase } from '#exjs-controllers/core/UseCase'
import { JsonController } from '#exjs-controllers/decorators/Controller'
import { DefineUseCase } from '#exjs-controllers/decorators/DefineUseCase'
import { Inject, Injectable } from '#exjs-controllers/decorators/DependencyInjection'
import { Field } from '#exjs-controllers/decorators/Field'
import { Post } from '#exjs-controllers/decorators/HttpMethod'
import { Body } from '#exjs-controllers/decorators/Params'
import { createApplication, type Application } from '#exjs-controllers/http/application'
import { BaseSchema } from '#exjs-controllers/schemas/BaseSchema'

class CreateItemInput extends BaseSchema {
  @Field(z.string().min(1))
  name!: string
}

@Injectable()
@DefineUseCase()
class CreateItem implements UseCase<CreateItemInput, { name: string }> {
  execute(input: CreateItemInput) {
    return { name: input.name }
  }
}

@JsonController('/items')
class ItemsController {
  constructor(@Inject(CreateItem) private readonly createItem: CreateItem) {}

  @Post('/echo')
  echo(@Body(CreateItemInput) input: CreateItemInput) {
    return { isInstance: input instanceof CreateItemInput, name: input.name ?? null }
  }

  @Post('/')
  create(@Body(CreateItemInput) input: CreateItemInput) {
    return this.createItem.execute(input)
  }

  @Post('/raw')
  raw(@Body() body: unknown) {
    return { received: body ?? null }
  }
}

let app: Application | undefined
let baseUrl = ''

beforeEach(async () => {
  _resetRoutesForTests()
  app = createApplication()
  await configureApplication(app, {
    controllers: [ItemsController],
    logger: false,
    errorHandler: (error: any, _request, response, _next) => {
      response
        .status(error.statusCode ?? error.status ?? 500)
        .json({ name: error.name, issues: error.issues })
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

async function post(path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

describe('@Body(Dto) hydration', () => {
  it('hydrates a JSON body into an instance of the DTO', async () => {
    expect(await post('/items/echo', { name: 'x' })).toEqual({
      status: 200,
      body: { isInstance: true, name: 'x' },
    })
  })

  it('hands the handler an empty DTO instance when the request has no body', async () => {
    expect(await post('/items/echo')).toEqual({
      status: 200,
      body: { isInstance: true, name: null },
    })
  })

  it('lets the use case answer 422 with the missing fields when the request has no body', async () => {
    const { status, body } = await post('/items')

    expect(status).toBe(422)
    expect(body.name).toBe('UseCaseInputValidationError')
    expect(body.issues.map((issue: { path: string[] }) => issue.path)).toEqual([['name']])
  })

  it('still runs the use case normally with a valid body', async () => {
    expect(await post('/items', { name: 'ok' })).toEqual({ status: 200, body: { name: 'ok' } })
  })

  it('leaves @Body() without a class untouched', async () => {
    expect(await post('/items/raw')).toEqual({ status: 200, body: { received: null } })
    expect(await post('/items/raw', { a: 1 })).toEqual({ status: 200, body: { received: { a: 1 } } })
  })
})
