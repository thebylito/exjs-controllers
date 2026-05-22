import { describe, it, expect } from 'vitest'
import { generateOpenApiDocument } from '#exjs-controllers/openapi/generateOpenApiDocument'
import { Controller } from '#exjs-controllers/decorators/Controller'
import { Get } from '#exjs-controllers/decorators/HttpMethod'
import { Authorized } from '#exjs-controllers/decorators/Authorized'
import { CurrentUser, CurrentApiKey } from '#exjs-controllers/decorators/CurrentUser'
import type { AuthenticationConfig } from '#exjs-controllers/core/authentication/types'
import type { ExpressServerOptions } from '#exjs-controllers/config/expressServerOptions'

const authentication: AuthenticationConfig = {
  currentUserChecker: () => null,
  authorizationChecker: () => true,
  openApiSecuritySchemes: {
    bearerUser: {
      scheme: { type: 'http', scheme: 'bearer' },
      kinds: ['user'],
    },
    bearerApiKey: {
      scheme: { type: 'http', scheme: 'bearer' },
      kinds: ['api-key'],
    },
  },
}

@Controller('/posts')
class PostsController {
  @Get('/public') public() {}

  @Authorized('posts:read')
  @Get('/list') list() {}

  @Authorized({ kinds: ['user'], permissions: ['posts:write'] })
  @Get('/write') write() {}

  @Get('/me') me(@CurrentUser() _user: unknown) {}

  @Get('/admin-key') adminKey(@CurrentApiKey() _key: unknown) {}

  @Get('/maybe') maybe(@CurrentUser({ optional: true }) _user?: unknown) {}
}

function makeOptions(): ExpressServerOptions {
  return {
    authentication,
    openapi: { documentation: { info: { title: 'X', version: '1' } } },
  }
}

describe('generateOpenApiDocument — security', () => {
  it('emits components.securitySchemes from openApiSecuritySchemes', () => {
    const doc = generateOpenApiDocument([PostsController], makeOptions())
    expect(doc.components?.securitySchemes).toEqual({
      bearerUser: { type: 'http', scheme: 'bearer' },
      bearerApiKey: { type: 'http', scheme: 'bearer' },
    })
  })

  it('public route has no security', () => {
    const doc = generateOpenApiDocument([PostsController], makeOptions())
    expect(doc.paths['/posts/public']?.get?.security).toBeUndefined()
  })

  it('short-form @Authorized → OR over all schemes', () => {
    const doc = generateOpenApiDocument([PostsController], makeOptions())
    expect(doc.paths['/posts/list']?.get?.security).toEqual([
      { bearerUser: ['posts:read'] },
      { bearerApiKey: ['posts:read'] },
    ])
  })

  it('@Authorized({ kinds: ["user"] }) → only user-kind schemes', () => {
    const doc = generateOpenApiDocument([PostsController], makeOptions())
    expect(doc.paths['/posts/write']?.get?.security).toEqual([
      { bearerUser: ['posts:write'] },
    ])
  })

  it('@CurrentUser() (no @Authorized) → user-kind schemes with empty scopes', () => {
    const doc = generateOpenApiDocument([PostsController], makeOptions())
    expect(doc.paths['/posts/me']?.get?.security).toEqual([
      { bearerUser: [] },
    ])
  })

  it('@CurrentApiKey() (no @Authorized) → api-key-kind schemes', () => {
    const doc = generateOpenApiDocument([PostsController], makeOptions())
    expect(doc.paths['/posts/admin-key']?.get?.security).toEqual([
      { bearerApiKey: [] },
    ])
  })

  it('optional principal decorator without @Authorized → no security', () => {
    const doc = generateOpenApiDocument([PostsController], makeOptions())
    expect(doc.paths['/posts/maybe']?.get?.security).toBeUndefined()
  })
})
