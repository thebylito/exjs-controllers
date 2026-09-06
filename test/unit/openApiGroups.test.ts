import { describe, it, expect } from 'vitest'

import {
  DEFAULT_OPENAPI_GROUP,
  generateOpenApiDocument,
  resolveRouteGroup,
} from '#exjs-controllers/openapi/generateOpenApiDocument'
import { Controller, JsonController } from '#exjs-controllers/decorators/Controller'
import { Get, Post } from '#exjs-controllers/decorators/HttpMethod'
import { legacyControllerMap } from '#exjs-controllers/metadata/legacyStorage'
import type { ExpressServerOptions } from '#exjs-controllers/config/expressServerOptions'

@JsonController('/public')
class PublicController {
  @Get('/items') items() {}
}

@JsonController('/admin', { group: 'admin' })
class AdminController {
  @Get('/users') users() {}

  @Post('/reindex', { group: 'internal' }) reindex() {}
}

@Controller('/mixed')
class MixedController {
  @Get('/a') a() {}

  @Get('/b', { group: 'admin' }) b() {}
}

const controllers = [PublicController, AdminController, MixedController]

const baseInfo = { title: 'X', version: '1' }
const baseSecurity = [{ base: [] as string[] }]

function makeOptions(): ExpressServerOptions {
  return {
    openapi: { documentation: { info: baseInfo, security: baseSecurity } },
  }
}

function pathsOf(doc: ReturnType<typeof generateOpenApiDocument>): string[] {
  return Object.keys(doc.paths).sort()
}

describe('OpenAPI groups — metadata', () => {
  it('controller sem group não grava group', () => {
    expect(legacyControllerMap.get(PublicController)?.group).toBeUndefined()
  })

  it('controller com group grava group sem afetar prefix/responseMode', () => {
    expect(legacyControllerMap.get(AdminController)).toMatchObject({
      prefix: '/admin',
      responseMode: 'json',
      group: 'admin',
    })
  })

  it('resolveRouteGroup: rota > controller > default', () => {
    expect(resolveRouteGroup({}, {})).toBe(DEFAULT_OPENAPI_GROUP)
    expect(resolveRouteGroup({ group: 'admin' }, {})).toBe('admin')
    expect(resolveRouteGroup({ group: 'admin' }, { group: 'internal' })).toBe('internal')
    expect(resolveRouteGroup({}, { group: 'internal' })).toBe('internal')
  })
})

describe('generateOpenApiDocument — groups', () => {
  it('sem seleção inclui todas as rotas, independentemente de grupo', () => {
    const doc = generateOpenApiDocument(controllers, makeOptions())
    expect(pathsOf(doc)).toEqual([
      '/admin/reindex',
      '/admin/users',
      '/mixed/a',
      '/mixed/b',
      '/public/items',
    ])
  })

  it('groups: ["default"] inclui só rotas sem grupo', () => {
    const doc = generateOpenApiDocument(controllers, makeOptions(), {
      groups: [DEFAULT_OPENAPI_GROUP],
    })
    expect(pathsOf(doc)).toEqual(['/mixed/a', '/public/items'])
  })

  it('groups: ["admin"] inclui o grupo do controller e o override por rota', () => {
    const doc = generateOpenApiDocument(controllers, makeOptions(), {
      groups: ['admin'],
    })
    expect(pathsOf(doc)).toEqual(['/admin/users', '/mixed/b'])
  })

  it('override por rota tira a rota do grupo do controller', () => {
    const doc = generateOpenApiDocument(controllers, makeOptions(), {
      groups: ['default', 'admin'],
    })
    expect(pathsOf(doc)).not.toContain('/admin/reindex')
  })

  it('vários grupos num documento', () => {
    const doc = generateOpenApiDocument(controllers, makeOptions(), {
      groups: ['admin', 'internal'],
    })
    expect(pathsOf(doc)).toEqual(['/admin/reindex', '/admin/users', '/mixed/b'])
  })

  it('groups: [] gera um documento sem paths', () => {
    const doc = generateOpenApiDocument(controllers, makeOptions(), { groups: [] })
    expect(doc.paths).toEqual({})
  })

  it('info e security do documento sobrescrevem a base', () => {
    const doc = generateOpenApiDocument(controllers, makeOptions(), {
      groups: ['admin'],
      info: { title: 'Admin API', version: '2' },
      security: [{ adminKey: [] }],
    })
    expect(doc.info).toEqual({ title: 'Admin API', version: '2' })
    expect(doc.security).toEqual([{ adminKey: [] }])
  })

  it('sem override mantém info e security da base', () => {
    const doc = generateOpenApiDocument(controllers, makeOptions(), {
      groups: ['admin'],
    })
    expect(doc.info).toEqual(baseInfo)
    expect(doc.security).toEqual(baseSecurity)
  })
})
