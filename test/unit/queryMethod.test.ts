import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { configureApplication } from '#exjs-controllers/config/configureApplication'
import { _resetRoutesForTests, registerControllers } from '#exjs-controllers/core/Router'
import { JsonController } from '#exjs-controllers/decorators/Controller'
import { Field } from '#exjs-controllers/decorators/Field'
import { Get, QueryMethod } from '#exjs-controllers/decorators/HttpMethod'
import { Body } from '#exjs-controllers/decorators/Params'
import { createApplication, type Application } from '#exjs-controllers/http/application'
import { generateOpenApiDocument } from '#exjs-controllers/openapi/generateOpenApiDocument'
import { BaseSchema } from '#exjs-controllers/schemas/BaseSchema'

class SearchInput extends BaseSchema {
  @Field(z.string().min(1))
  term!: string
}

@JsonController('/items')
class ItemsController {
  @QueryMethod('/search', { inputClass: SearchInput })
  search(@Body(SearchInput) input: SearchInput) {
    return { isInstance: input instanceof SearchInput, term: input.term }
  }

  @Get('/search')
  list() {
    return { method: 'GET' }
  }
}

let app: Application | undefined
let baseUrl = ''

beforeEach(async () => {
  _resetRoutesForTests()
  app = createApplication()
  await configureApplication(app, { controllers: [ItemsController], logger: false })

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

describe('@QueryMethod', () => {
  it('routes QUERY requests and hydrates the body into the DTO', async () => {
    const response = await fetch(`${baseUrl}/items/search`, {
      method: 'QUERY',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ term: 'abc' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ isInstance: true, term: 'abc' })
  })

  it('keeps GET on the same path as a separate route', async () => {
    const response = await fetch(`${baseUrl}/items/search`)

    expect(await response.json()).toEqual({ method: 'GET' })
  })

  it('rejects a duplicated QUERY route', () => {
    expect(() => registerControllers(createApplication(), ItemsController)).toThrow(
      'QUERY /items/search',
    )
  })
})

describe('OpenAPI for QUERY routes', () => {
  it('documents the operation under `query` with a request body', () => {
    const document = generateOpenApiDocument([ItemsController], {})

    expect(document.openapi).toBe('3.2.0')
    expect(document.paths['/items/search']?.query?.requestBody?.content['application/json']).toBeDefined()
    expect(document.paths['/items/search']?.get).toBeDefined()
  })
})
