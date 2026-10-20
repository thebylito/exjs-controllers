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

class SignupInput extends BaseSchema {
  @Field(z.string().min(1))
  name!: string

  @Field(z.string().email())
  email!: string
}

class ParentInput extends BaseSchema {
  @Field(z.string())
  name!: string
}

class ChildInput extends ParentInput {
  @Field(z.string())
  nick!: string
}

class UndeclaredInput extends BaseSchema {}

let captured: unknown

@Injectable()
@DefineUseCase()
class CreateItem implements UseCase<CreateItemInput, { name: string }> {
  execute(input: CreateItemInput) {
    return { name: input.name }
  }
}

@Injectable()
@DefineUseCase()
class RunUndeclared implements UseCase<UndeclaredInput, { ok: boolean }> {
  execute(_input: UndeclaredInput) {
    return { ok: true }
  }
}

@JsonController('/items')
class ItemsController {
  constructor(
    @Inject(CreateItem) private readonly createItem: CreateItem,
    @Inject(RunUndeclared) private readonly runUndeclared: RunUndeclared,
  ) {}

  @Post('/echo')
  echo(@Body(CreateItemInput) input: CreateItemInput) {
    return { isInstance: input instanceof CreateItemInput, name: input.name ?? null }
  }

  @Post('/')
  create(@Body(CreateItemInput) input: CreateItemInput) {
    return this.createItem.execute(input)
  }

  @Post('/signup')
  signup(@Body(SignupInput) input: SignupInput) {
    captured = input
    return this.createItem.execute(input as unknown as CreateItemInput)
  }

  @Post('/child')
  child(@Body(ChildInput) input: ChildInput) {
    captured = input
    return {}
  }

  @Post('/undeclared')
  undeclared(@Body(UndeclaredInput) input: UndeclaredInput) {
    captured = input
    return {}
  }

  @Post('/undeclared-usecase')
  undeclaredUseCase(@Body(UndeclaredInput) input: UndeclaredInput) {
    captured = input
    return this.runUndeclared.execute(input)
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

async function postRaw(path: string, raw: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
  })
  return { status: response.status, body: await response.json() }
}

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

  it('drops undeclared keys before the handler', async () => {
    captured = undefined
    await post('/items/signup', { name: 'x', email: 'a@b.com', isAdmin: true, role: 'admin' })

    expect(Object.keys(captured as object)).toEqual(['name', 'email'])
    expect((captured as any).isAdmin).toBeUndefined()
  })

  it('keeps keys declared on a parent DTO', async () => {
    captured = undefined
    await post('/items/child', { name: 'n', nick: 'k', extra: 1 })

    expect(Object.keys(captured as object).sort()).toEqual(['name', 'nick'])
  })

  it('ignores __proto__: instance keeps its prototype and the use case answers 422', async () => {
    captured = undefined
    const { status } = await postRaw('/items/signup', '{"__proto__":{"isAdmin":true},"name":""}')

    expect(status).toBe(422)
    expect(captured).toBeInstanceOf(SignupInput)
    expect(Object.getPrototypeOf(captured)).toBe(SignupInput.prototype)
    expect((captured as any).isAdmin).toBeUndefined()
  })

  it('a "validate" or "constructor" key does not shadow the method', async () => {
    const ok = await post('/items/signup', {
      name: 'x',
      email: 'a@b.com',
      validate: 'pwned',
      constructor: 'x',
    })
    expect(ok.status).toBe(200)

    const bad = await post('/items/signup', { name: '', email: 'a@b.com', validate: 'pwned' })
    expect(bad.status).toBe(422)
  })

  it('copies own keys except forbidden ones when the DTO declares no @Field', async () => {
    captured = undefined
    await postRaw('/items/undeclared', '{"__proto__":{"x":1},"constructor":"c","prototype":"p","a":1}')

    expect(Object.keys(captured as object)).toEqual(['a'])
    expect(Object.getPrototypeOf(captured)).toBe(UndeclaredInput.prototype)
  })

  it('function-valued keys do not shadow methods when the DTO declares no @Field', async () => {
    captured = undefined
    const res = await post('/items/undeclared-usecase', {
      name: 'x',
      validate: 'pwned',
      toString: 'x',
    })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    const dto = captured as Record<string, unknown>
    expect(typeof dto.validate).toBe('function')
    expect(Object.hasOwn(dto, 'validate')).toBe(false)
    expect(Object.hasOwn(dto, 'toString')).toBe(false)
    expect(dto.name).toBe('x')
  })
})
