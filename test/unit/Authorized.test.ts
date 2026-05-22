import { describe, it, expect } from 'vitest'
import { Authorized } from '#exjs-controllers/decorators/Authorized'
import {
  AUTHORIZATION_METADATA,
  type AuthorizationMetadata,
} from '#exjs-controllers/metadata/symbols'
import { legacyAuthorizationMap } from '#exjs-controllers/metadata/legacyStorage'

function getLegacyAuth(target: object, handlerName: string): AuthorizationMetadata | undefined {
  return legacyAuthorizationMap.get(target)?.get(handlerName)
}

describe('@Authorized', () => {
  it('short form stores permissions array', () => {
    class C {
      @Authorized('posts:read', 'posts:write')
      handler() {}
    }
    const meta = getLegacyAuth(C.prototype, 'handler')
    expect(meta).toEqual({ permissions: ['posts:read', 'posts:write'] })
  })

  it('object form stores permissions and kinds', () => {
    class C {
      @Authorized({ permissions: ['posts:read'], kinds: ['user'] })
      handler() {}
    }
    const meta = getLegacyAuth(C.prototype, 'handler')
    expect(meta).toEqual({ permissions: ['posts:read'], kinds: ['user'] })
  })

  it('object form without permissions defaults to empty array', () => {
    class C {
      @Authorized({ kinds: ['api-key'] })
      handler() {}
    }
    const meta = getLegacyAuth(C.prototype, 'handler')
    expect(meta).toEqual({ permissions: [], kinds: ['api-key'] })
  })

  it('short form with no arguments stores empty permissions', () => {
    class C {
      @Authorized()
      handler() {}
    }
    const meta = getLegacyAuth(C.prototype, 'handler')
    expect(meta).toEqual({ permissions: [] })
  })
})
