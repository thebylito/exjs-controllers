import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Authorized } from '#exjs-controllers/decorators/Authorized'
import { Get } from '#exjs-controllers/decorators/HttpMethod'
import { Field } from '#exjs-controllers/decorators/Field'
import { classToZod } from '#exjs-controllers/core/ClassToZod'
import {
  AUTHORIZATION_METADATA,
  getAuthorizationFromMeta,
  getRoutesFromMeta,
} from '#exjs-controllers/metadata/symbols'

type Meta = Record<symbol, unknown>
const meta = (parent?: object) => Object.create(parent ?? null) as Meta
const methodCtx = (name: string, metadata: Meta) =>
  ({ kind: 'method', name, metadata }) as any
const fieldCtx = (name: string, metadata: Meta) =>
  ({ kind: 'field', name, metadata }) as any

describe('metadata TC39: copy-on-write entre classe pai e filha', () => {
  it('@Authorized na subclasse não altera as permissões do pai', () => {
    class Parent { list() {} }
    class Child extends Parent { override list() {} }
    const parentMeta = meta()
    const childMeta = meta(parentMeta)

    ;(Authorized('admin') as any)(Parent.prototype.list as any, methodCtx('list', parentMeta))
    ;(Authorized('users:read') as any)(Child.prototype.list as any, methodCtx('list', childMeta))

    expect(getAuthorizationFromMeta(parentMeta, 'list')).toEqual({ permissions: ['admin'] })
    expect(getAuthorizationFromMeta(childMeta, 'list')).toEqual({ permissions: ['users:read'] })
    expect(parentMeta[AUTHORIZATION_METADATA]).not.toBe(childMeta[AUTHORIZATION_METADATA])
  })

  it('@Get na subclasse não empurra rotas no array do pai e a subclasse herda uma cópia', () => {
    class Parent { list() {} mine() {} }
    class Child extends Parent {}
    const parentMeta = meta()
    const childMeta = meta(parentMeta)

    Get('/list')(Parent.prototype.list as any, methodCtx('list', parentMeta))
    Get('/mine')(Child.prototype.mine as any, methodCtx('mine', childMeta))

    expect(getRoutesFromMeta(parentMeta)).toHaveLength(1)
    expect(getRoutesFromMeta(childMeta).map((r) => r.path)).toEqual(['/list', '/mine'])
  })

  it('@Field na subclasse não enfraquece o schema do pai', () => {
    class Parent {}
    class Child extends Parent {}
    const parentMeta = meta()
    const childMeta = meta(parentMeta)

    Field(z.string().min(8))(undefined, fieldCtx('password', parentMeta))
    Field(z.string().optional())(undefined, fieldCtx('password', childMeta))
    Object.defineProperty(Parent, Symbol.metadata, { value: parentMeta, configurable: true })
    Object.defineProperty(Child, Symbol.metadata, { value: childMeta, configurable: true })

    expect(classToZod(Parent).safeParse({}).success).toBe(false)
    expect(classToZod(Child).safeParse({}).success).toBe(true)
  })
})
