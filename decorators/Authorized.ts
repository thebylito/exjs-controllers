import {
  AUTHORIZATION_METADATA,
  type AuthorizationMetadata,
} from '#exjs-controllers/metadata/symbols'
import { ownMetadataEntry } from '#exjs-controllers/metadata/ownMetadata'
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
      const ownedBefore = Object.hasOwn(metadata, AUTHORIZATION_METADATA)
      const authorizationMap = ownMetadataEntry(
        metadata,
        AUTHORIZATION_METADATA,
        () => new Map<string | symbol, AuthorizationMetadata>(),
        (inherited) => new Map(inherited),
      )
      const name = ctxOrKey.name
      // Só a entrada própria conta: a herdada da classe pai pode ser sobrescrita.
      if (ownedBefore && authorizationMap.has(name)) {
        throw new Error(
          `[Authorized] @Authorized aplicado mais de uma vez em ${String(name)}; combine as permissões em uma única chamada.`,
        )
      }
      authorizationMap.set(name, authorization)
      return
    }

    const target = valueOrTarget as object
    const authorizationMap =
      legacyAuthorizationMap.get(target) ??
      new Map<string | symbol, AuthorizationMetadata>()
    const name = ctxOrKey as string | symbol
    if (authorizationMap.has(name)) {
      throw new Error(
        `[Authorized] @Authorized aplicado mais de uma vez em ${String(name)}; combine as permissões em uma única chamada.`,
      )
    }
    authorizationMap.set(name, authorization)
    legacyAuthorizationMap.set(target, authorizationMap)
  }
}

function isStandardMethodDecoratorContext(
  value: ClassMethodDecoratorContext<object, DecoratedMethod> | string | symbol,
): value is ClassMethodDecoratorContext<object, DecoratedMethod> {
  return typeof value === 'object' && value !== null && 'kind' in value
}
