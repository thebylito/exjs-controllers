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
})
