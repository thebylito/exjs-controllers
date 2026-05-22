import type { Request, Response, NextFunction } from 'express'
import type {
  Action,
  AuthenticationConfig,
  PrincipalKind,
  ResolvedPrincipal,
} from '#exjs-controllers/core/authentication/types'
import {
  UnauthorizedError,
  ForbiddenError,
} from '#exjs-controllers/core/authentication/errors'

export const RESOLVED_PRINCIPAL_KEY = '__resolvedPrincipal' as const

export type AuthenticationMiddlewareOptions = {
  authentication: AuthenticationConfig
  requiredPermissions: string[]
  allowedKinds: PrincipalKind[] | undefined
  hasAuthorizedDecorator: boolean
}

export function createAuthenticationMiddleware(
  options: AuthenticationMiddlewareOptions,
) {
  const {
    authentication,
    requiredPermissions,
    allowedKinds,
    hasAuthorizedDecorator,
  } = options

  return async function authenticationMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const action: Action = { request, response }

    let resolved: ResolvedPrincipal | null | undefined
    try {
      resolved = await authentication.currentUserChecker(action)
    } catch (err) {
      return next(
        new UnauthorizedError(
          err instanceof Error ? err.message : 'Unauthorized',
          { cause: err },
        ),
      )
    }

    if (resolved == null) {
      if (hasAuthorizedDecorator) {
        return next(new UnauthorizedError())
      }
      return next()
    }

    if (allowedKinds && !allowedKinds.includes(resolved.kind)) {
      return next(new ForbiddenError())
    }

    const authorized = await authentication.authorizationChecker(
      action,
      resolved.principal,
      resolved.kind,
      requiredPermissions,
    )
    if (authorized !== true) {
      return next(new ForbiddenError())
    }

    ;(request as any)[RESOLVED_PRINCIPAL_KEY] = resolved
    next()
  }
}
