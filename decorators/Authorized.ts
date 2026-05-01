import {
  AUTHORIZATION_METADATA,
  type AuthorizationMetadata,
} from '#exjs-controllers/metadata/symbols'
import { legacyAuthorizationMap } from '#exjs-controllers/metadata/legacyStorage'

type DecoratedMethod = (this: object, ...args: unknown[]) => unknown

export function Authorized(...requiredScopes: string[]) {
  const authorization: AuthorizationMetadata = {
    requiredScopes,
  }

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

    authorizationMap.set(ctxOrKey, authorization)
    legacyAuthorizationMap.set(target, authorizationMap)
  }
}

function isStandardMethodDecoratorContext(
  value: ClassMethodDecoratorContext<object, DecoratedMethod> | string | symbol,
): value is ClassMethodDecoratorContext<object, DecoratedMethod> {
  return typeof value === 'object' && value !== null && 'kind' in value
}
