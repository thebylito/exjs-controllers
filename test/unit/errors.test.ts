import { describe, it, expect } from 'vitest'
import {
  UnauthorizedError,
  ForbiddenError,
} from '#exjs-controllers/core/authentication/errors'

describe('UnauthorizedError', () => {
  it('default message and status 401', () => {
    const err = new UnauthorizedError()
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(401)
    expect(err.name).toBe('UnauthorizedError')
    expect(err.message).toBe('Unauthorized')
  })

  it('preserves cause', () => {
    const cause = new Error('token expired')
    const err = new UnauthorizedError('custom', { cause })
    expect(err.message).toBe('custom')
    expect(err.cause).toBe(cause)
  })
})

describe('ForbiddenError', () => {
  it('default message and status 403', () => {
    const err = new ForbiddenError()
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(403)
    expect(err.name).toBe('ForbiddenError')
    expect(err.message).toBe('Forbidden')
  })

  it('preserves cause', () => {
    const cause = new Error('insufficient scope')
    const err = new ForbiddenError('denied', { cause })
    expect(err.message).toBe('denied')
    expect(err.cause).toBe(cause)
  })
})
