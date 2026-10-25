import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Field } from '#exjs-controllers/decorators/Field'
import { BaseSchema } from '#exjs-controllers/schemas/BaseSchema'

class SignupInput extends BaseSchema {
  @Field(z.string().email().toLowerCase())
  email!: string

  @Field(z.coerce.number())
  qty!: number

  @Field(z.string().default('br'))
  locale!: string
}

describe('BaseSchema.validate()', () => {
  it('applies transforms, coerce and defaults on the instance itself', () => {
    const input = Object.assign(new SignupInput(), { email: 'A@B.com', qty: '5' })

    input.validate()

    expect(input.email).toBe('a@b.com')
    expect(input.qty).toBe(5)
    expect(input.locale).toBe('br')
  })

  it('preserves keys added through merge()', () => {
    const input = Object.assign(new SignupInput(), { email: 'a@b.com', qty: 1 })

    input.merge({ ownerId: 'u1' })
    input.validate()

    expect((input as any).ownerId).toBe('u1')
  })

  it('create() keeps the instance prototype when data carries an own __proto__ key', () => {
    const data = JSON.parse('{"__proto__":{"role":"admin"},"name":"a"}')

    const input = SignupInput.create(data)

    expect(Object.getPrototypeOf(input)).toBe(SignupInput.prototype)
    expect((input as any).role).toBeUndefined()
  })

  it('create() and merge() do not let data shadow prototype methods or forbidden keys', () => {
    const created = SignupInput.create(
      JSON.parse('{"validate":"pwned","constructor":{},"prototype":{},"name":"a"}'),
    )

    expect(typeof created.validate).toBe('function')

    const input = Object.assign(new SignupInput(), { email: 'a@b.com', qty: 1 })
    input.merge(JSON.parse('{"__proto__":{"role":"admin"},"validate":"pwned","name":"x"}'))

    expect(Object.getPrototypeOf(input)).toBe(SignupInput.prototype)
    expect(typeof input.validate).toBe('function')
    expect((input as any).role).toBeUndefined()
  })

  it('create() and merge() still preserve extra data keys after filtering', () => {
    const created = SignupInput.create(JSON.parse('{"email":"a@b.com","extraKey":"v"}'))

    expect((created as any).extraKey).toBe('v')
    expect(created.email).toBe('a@b.com')

    const input = Object.assign(new SignupInput(), { email: 'a@b.com', qty: 1 })
    input.merge({ extraKey: 'v' })

    expect((input as any).extraKey).toBe('v')
  })

  it('create() and merge() preserve enumerable symbol-keyed data properties', () => {
    const ownerSymbol = Symbol('owner')

    const created = SignupInput.create({ email: 'a@b.com', [ownerSymbol]: 'u1' } as never)

    expect((created as unknown as Record<symbol, unknown>)[ownerSymbol]).toBe('u1')

    const input = Object.assign(new SignupInput(), { email: 'a@b.com', qty: 1 })
    input.merge({ [ownerSymbol]: 'u1' })

    expect((input as unknown as Record<symbol, unknown>)[ownerSymbol]).toBe('u1')
  })
})
