import { describe, it, expect, vi } from 'vitest'
import { createAuthenticationMiddleware } from '#exjs-controllers/core/authentication/middleware'
import type { AuthenticationConfig } from '#exjs-controllers/core/authentication/types'
import { UnauthorizedError } from '#exjs-controllers/core/authentication/errors'
import { ForbiddenError } from '#exjs-controllers/core/authentication/errors'

function mockReqRes() {
  const request = { headers: {} } as any
  const response = { status: vi.fn(), json: vi.fn() } as any
  const next = vi.fn()
  return { request, response, next }
}

describe('createAuthenticationMiddleware — happy path', () => {
  it('resolves principal, runs authorizationChecker, attaches resolved and calls next()', async () => {
    const principal = { id: 'u1' }
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({ principal, kind: 'user' }),
      authorizationChecker: vi.fn().mockResolvedValue(true),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: ['posts:read'],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })

    const { request, response, next } = mockReqRes()
    await middleware(request, response, next)

    expect(config.currentUserChecker).toHaveBeenCalledWith({ request, response })
    expect(config.authorizationChecker).toHaveBeenCalledWith(
      { request, response }, principal, 'user', ['posts:read'],
    )
    expect(request.__resolvedPrincipal).toEqual({ principal, kind: 'user' })
    expect(next).toHaveBeenCalledWith()  // sem erro
  })
})

describe('createAuthenticationMiddleware — no principal resolved', () => {
  it('throws UnauthorizedError when checker returns null and @Authorized is present', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue(null),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError)
    expect(config.authorizationChecker).not.toHaveBeenCalled()
  })

  it('calls next() (no error) when checker returns null and no @Authorized', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue(null),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: undefined,
      hasAuthorizedDecorator: false,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next).toHaveBeenCalledWith()
    expect(config.authorizationChecker).not.toHaveBeenCalled()
  })

  it('treats undefined like null', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue(undefined),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()
    await middleware(request, response, next)
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError)
  })
})

describe('createAuthenticationMiddleware — kind restriction', () => {
  it('throws ForbiddenError when kind not in allowedKinds', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({
        principal: { id: 'svc1' },
        kind: 'api-key',
      }),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: ['user'],
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError)
    expect(config.authorizationChecker).not.toHaveBeenCalled()
  })

  it('allows kind when allowedKinds includes it', async () => {
    const principal = { id: 'u1' }
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({ principal, kind: 'user' }),
      authorizationChecker: vi.fn().mockResolvedValue(true),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: ['user', 'api-key'],
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next).toHaveBeenCalledWith()
    expect(config.authorizationChecker).toHaveBeenCalled()
  })
})

describe('createAuthenticationMiddleware — authorization denied', () => {
  it('throws ForbiddenError when authorizationChecker returns false', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({
        principal: { id: 'u1' },
        kind: 'user',
      }),
      authorizationChecker: vi.fn().mockResolvedValue(false),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: ['posts:write'],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError)
  })

  it('passes requiredPermissions to authorizationChecker', async () => {
    const principal = { id: 'u1' }
    const checker = vi.fn().mockResolvedValue(true)
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({ principal, kind: 'user' }),
      authorizationChecker: checker,
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: ['a', 'b'],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(checker).toHaveBeenCalledWith(
      { request, response }, principal, 'user', ['a', 'b'],
    )
  })
})

describe('createAuthenticationMiddleware — checker throws', () => {
  it('wraps thrown error in UnauthorizedError with cause preserved', async () => {
    const cause = new Error('token expired')
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockRejectedValue(cause),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    const passedErr = next.mock.calls[0][0]
    expect(passedErr).toBeInstanceOf(UnauthorizedError)
    expect(passedErr.message).toBe('token expired')
    expect((passedErr as any).cause).toBe(cause)
    expect(config.authorizationChecker).not.toHaveBeenCalled()
  })
})
