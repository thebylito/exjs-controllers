import { describe, expect, it, vi } from 'vitest'

import { createCookieMiddleware } from '#exjs-controllers/http/cookies'

function parse(header: string): Record<string, string> {
  const request = { headers: { cookie: header } } as never
  const response = {} as never
  const next = vi.fn()

  createCookieMiddleware()(request, response, next)

  expect(next).toHaveBeenCalledOnce()

  return (request as unknown as { cookies: Record<string, string> }).cookies
}

describe('cookie middleware', () => {
  it('stores a cookie named __proto__ as an own property', () => {
    const cookies = parse('session=abc; __proto__=pwned')

    expect(Object.hasOwn(cookies, '__proto__')).toBe(true)
    expect(cookies['__proto__']).toBe('pwned')
  })

  it('uses a null-prototype container so parsed names cannot collide with Object.prototype', () => {
    const cookies = parse('session=abc')

    expect(Object.getPrototypeOf(cookies)).toBe(null)
  })

  it('stores prototype-member names as own keys', () => {
    const cookies = parse('hasOwnProperty=x; constructor=y; toString=z')

    expect(Object.hasOwn(cookies, 'hasOwnProperty')).toBe(true)
    expect(cookies['hasOwnProperty']).toBe('x')
    expect(cookies['constructor']).toBe('y')
    expect(cookies['toString']).toBe('z')
  })

  it('keeps existing parsing behavior for ordinary values', () => {
    expect(parse('a=1;a=2')).toEqual({ a: '2' })
    expect(parse('a=%E2%9C%93;b=%ZZ')).toEqual({ a: '✓', b: '%ZZ' })
    expect(parse('novalue;=blank;empty=')).toEqual({ empty: '' })
    expect(parse('')).toEqual({})
  })
})
