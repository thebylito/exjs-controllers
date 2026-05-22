import {
  AUTHORIZATION_METADATA,
  type AuthorizationMetadata,
} from '#exjs-controllers/metadata/symbols'
import { legacyAuthorizationMap } from '#exjs-controllers/metadata/legacyStorage'
import type { PrincipalKind } from '#exjs-controllers/core/authentication/types'

export type AuthorizationOptions = {
  permissions?: string[]
  kinds?: PrincipalKind[]
}

type DecoratedMethod = (this: object, ...args: unknown[]) => unknown

function isAuthorizationOptions(value: unknown): value is AuthorizationOptions {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function Authorized(...permissions: string[]): MethodDecorator
export function Authorized(options: AuthorizationOptions): MethodDecorator
export function Authorized(
  ...args: [AuthorizationOptions] | string[]
): MethodDecorator {
  const authorization: AuthorizationMetadata =
    args.length === 1 && isAuthorizationOptions(args[0])
      ? {
          permissions: args[0].permissions ?? [],
          ...(args[0].kinds ? { kinds: args[0].kinds } : {}),
        }
      : { permissions: args as string[] }

  return function (
    valueOrTarget: DecoratedMethod | object,
    ctxOrKey: ClassMethodDecoratorContext<object, DecoratedMethod> | string | symbol,
    _descriptor?: PropertyDescriptor,
  ): void {
    if (isStandardMethodDecoratorContext(ctxOrKey)) {
      const metadata = ctxOrKey.metadata as Record<symbol, unknown>
      const authorizationMap =
        (metadata[AUTHORIZATION_METADATA] as
          | Map<string | symbol, AuthorizationMetadata>
          | undefined) ?? new Map<string | symbol, AuthorizationMetadata>()
      authorizationMap.set(ctxOrKey.name, authorization)
      metadata[AUTHORIZATION_METADATA] = authorizationMap
      return
    }

    const target = valueOrTarget as object
    const authorizationMap =
      legacyAuthorizationMap.get(target) ??
      new Map<string | symbol, AuthorizationMetadata>()
    authorizationMap.set(ctxOrKey as string | symbol, authorization)
    legacyAuthorizationMap.set(target, authorizationMap)
  }
}

function isStandardMethodDecoratorContext(
  value: ClassMethodDecoratorContext<object, DecoratedMethod> | string | symbol,
): value is ClassMethodDecoratorContext<object, DecoratedMethod> {
  return typeof value === 'object' && value !== null && 'kind' in value
}
