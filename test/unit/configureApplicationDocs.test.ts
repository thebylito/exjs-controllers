import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configureApplication } from '#exjs-controllers/config/configureApplication'
import type { ExpressServerOptions } from '#exjs-controllers/config/expressServerOptions'
import { _resetRoutesForTests } from '#exjs-controllers/core/Router'
import { JsonController } from '#exjs-controllers/decorators/Controller'
import { Get } from '#exjs-controllers/decorators/HttpMethod'
import { createApplication, type Application } from '#exjs-controllers/http/application'

@JsonController('/public')
class PublicController {
  @Get('/items') items() {
    return []
  }
}

@JsonController('/admin', { group: 'admin' })
class AdminController {
  @Get('/users') users() {
    return []
  }
}

const controllers = [PublicController, AdminController]
const documentation = { info: { title: 'X', version: '1' } }

let app: Application | undefined

beforeEach(() => {
  _resetRoutesForTests()
})

afterEach(async () => {
  if (!app) return
  const current = app
  app = undefined
  await new Promise<void>((resolve) => current.close(() => resolve()))
})

async function start(
  options: Omit<ExpressServerOptions, 'controllers' | 'logger'>,
): Promise<string> {
  app = createApplication()
  await configureApplication(app, { controllers, logger: false, ...options })

  const started = app
  await new Promise<void>((resolve) => started.listen(0, resolve))
  const address = started.address()

  if (!address || typeof address === 'string') {
    throw new Error('Servidor de teste sem porta TCP')
  }

  return `http://127.0.0.1:${address.port}`
}

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const response = await fetch(url)
  return { status: response.status, body: await response.json() }
}

async function getText(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url)
  return { status: response.status, body: await response.text() }
}

describe('configureApplication — documentos OpenAPI', () => {
  it('sem documents serve um único documento com todas as rotas', async () => {
    const base = await start({ openapi: { documentation } })

    const { status, body } = await getJson(`${base}/docs/openapi.json`)

    expect(status).toBe(200)
    expect(Object.keys(body.paths).sort()).toEqual(['/admin/users', '/public/items'])
  })

  it('documents separa as rotas por grupo nos caminhos derivados', async () => {
    const base = await start({
      openapi: {
        documentation,
        documents: {
          default: {},
          admin: { info: { title: 'Admin API', version: '2' } },
        },
      },
    })

    const publicDoc = await getJson(`${base}/docs/openapi.json`)
    const adminDoc = await getJson(`${base}/docs/admin/openapi.json`)

    expect(Object.keys(publicDoc.body.paths)).toEqual(['/public/items'])
    expect(publicDoc.body.info).toEqual(documentation.info)
    expect(Object.keys(adminDoc.body.paths)).toEqual(['/admin/users'])
    expect(adminDoc.body.info).toEqual({ title: 'Admin API', version: '2' })
  })

  it('grupo que nenhum documento referencia não é servido', async () => {
    const base = await start({
      openapi: { documentation, documents: { default: {} } },
    })

    const publicDoc = await getJson(`${base}/docs/openapi.json`)
    const adminDoc = await fetch(`${base}/docs/admin/openapi.json`)

    expect(Object.keys(publicDoc.body.paths)).toEqual(['/public/items'])
    expect(adminDoc.status).toBe(404)
  })

  it('respeita caminhos explícitos e deriva os demais da base do Scalar', async () => {
    const base = await start({
      openapi: {
        documentPath: '/internal/openapi.json',
        documentation,
        documents: {
          default: {},
          admin: { documentPath: '/x/admin.json' },
          ops: { groups: ['admin'], referencePath: '/ops-reference' },
        },
      },
      scalar: { referencePath: '/reference' },
      enableScalar: true,
    })

    expect((await getJson(`${base}/internal/openapi.json`)).status).toBe(200)
    expect((await getJson(`${base}/x/admin.json`)).status).toBe(200)
    expect((await getJson(`${base}/ops-reference/openapi.json`)).status).toBe(200)

    expect((await getText(`${base}/reference`)).body).toContain('/internal/openapi.json')
    expect((await getText(`${base}/reference/admin`)).body).toContain('/x/admin.json')
    expect((await getText(`${base}/ops-reference`)).body).toContain(
      '/ops-reference/openapi.json',
    )
  })

  it('monta um Scalar por documento, com o aninhado antes do pai', async () => {
    const base = await start({
      openapi: { documentation, documents: { default: {}, admin: {} } },
      enableScalar: true,
    })

    const publicUi = await getText(`${base}/docs`)
    const adminUi = await getText(`${base}/docs/admin`)

    expect(publicUi.status).toBe(200)
    expect(publicUi.body).toContain('/docs/openapi.json')
    expect(publicUi.body).not.toContain('/docs/admin/openapi.json')
    expect(adminUi.status).toBe(200)
    expect(adminUi.body).toContain('/docs/admin/openapi.json')
  })

  it('caminho de documento repetido falha no bootstrap', async () => {
    await expect(
      start({
        openapi: {
          documentation,
          documents: {
            default: {},
            admin: { documentPath: '/docs/openapi.json' },
          },
        },
      }),
    ).rejects.toThrow(/documentPath "\/docs\/openapi\.json" está repetido/)
  })

  it('documents vazio falha no bootstrap', async () => {
    await expect(
      start({ openapi: { documentation, documents: {} } }),
    ).rejects.toThrow(/openapi\.documents está vazio/)
  })
})
