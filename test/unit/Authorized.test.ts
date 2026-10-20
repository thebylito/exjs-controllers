import { describe, it, expect } from 'vitest'
import { Authorized } from '#exjs-controllers/decorators/Authorized'
import {
  getAuthorizationFromMeta,
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

describe('@Authorized aplicado mais de uma vez', () => {
  it('lança no mesmo método (legacy)', () => {
    const proto = {}
    const desc = { value() {} } as PropertyDescriptor
    expect(() => {
      Authorized('a')(proto, 'list', desc)
      Authorized('b')(proto, 'list', desc)
    }).toThrow(/mais de uma vez/)
  })

  it('lança no mesmo método (TC39)', () => {
    const ctx = { kind: 'method', name: 'list', metadata: Object.create(null) } as any
    const apply = (Authorized as any)
    expect(() => {
      apply('a')(function list() {}, ctx)
      apply('b')(function list() {}, ctx)
    }).toThrow(/mais de uma vez/)
  })

  it('não lança quando a subclasse sobrescreve o método herdado (TC39)', () => {
    const parentMeta = Object.create(null)
    const childMeta = Object.create(parentMeta)
    const apply = (Authorized as any)
    expect(() => {
      apply('a')(function list() {}, { kind: 'method', name: 'list', metadata: parentMeta })
      apply('b')(function list() {}, { kind: 'method', name: 'list', metadata: childMeta })
    }).not.toThrow()
  })

  it('não lança em subclasse com método novo decorado antes do override (TC39)', () => {
    const parentMeta = Object.create(null)
    const apply = (Authorized as any)
    apply('a')(function list() {}, { kind: 'method', name: 'list', metadata: parentMeta })
    const childMeta = Object.create(parentMeta)
    expect(() => {
      apply('x')(function extra() {}, { kind: 'method', name: 'extra', metadata: childMeta })
      apply('y')(function list() {}, { kind: 'method', name: 'list', metadata: childMeta })
    }).not.toThrow()
    expect(getAuthorizationFromMeta(childMeta, 'extra')).toEqual({ permissions: ['x'] })
    expect(getAuthorizationFromMeta(childMeta, 'list')).toEqual({ permissions: ['y'] })
    expect(getAuthorizationFromMeta(parentMeta, 'list')).toEqual({ permissions: ['a'] })
    expect(getAuthorizationFromMeta(parentMeta, 'extra')).toBeUndefined()
  })
})
