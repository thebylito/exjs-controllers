import type { ZodType } from 'zod'
;(Symbol as any).metadata ??= Symbol.for('Symbol.metadata')

export const ROUTE_METADATA = Symbol('route_metadata')
export const FIELD_METADATA = Symbol('field_metadata')
export const CONTROLLER_METADATA = Symbol('controller_metadata')
export const INJECTABLE_METADATA = Symbol('injectable_metadata')
export const AUTHORIZATION_METADATA = Symbol('authorization_metadata')

export type HttpMethodType = 'get' | 'post' | 'put' | 'delete' | 'patch'
export type InjectionToken<T = unknown> = new (...args: any[]) => T

export interface RouteOptions {
  inputClass?: new (...args: any[]) => object
  outputClass?: new (...args: any[]) => object
  outputIsArray?: boolean
  summary?: string
  description?: string
  tags?: string[]
}

export interface RouteMetadata extends RouteOptions {
  method: HttpMethodType
  path: string
  handlerName: string | symbol
}

export interface AuthorizationMetadata {
  requiredScopes: string[]
}

export interface ControllerMeta {
  prefix: string
  responseMode: 'default' | 'json'
  target: new (...args: any[]) => object
}

export interface InjectableMeta {
  singleton: boolean
  target: new (...args: any[]) => object
}

export function getRoutesFromMeta(
  meta: DecoratorMetadata | null | undefined,
): RouteMetadata[] {
  return (
    ((meta as Record<symbol, unknown> | null | undefined)?.[ROUTE_METADATA] as
      | RouteMetadata[]
      | undefined) ?? []
  )
}

export function getFieldsFromMeta(
  meta: DecoratorMetadata | null | undefined,
): Record<string, ZodType> {
  return (
    ((meta as Record<symbol, unknown> | null | undefined)?.[FIELD_METADATA] as
      | Record<string, ZodType>
      | undefined) ?? {}
  )
}

export function getControllerFromMeta(
  meta: DecoratorMetadata | null | undefined,
): ControllerMeta | undefined {
  return (meta as Record<symbol, unknown> | null | undefined)?.[
    CONTROLLER_METADATA
  ] as ControllerMeta | undefined
}

export function getInjectableFromMeta(
  meta: DecoratorMetadata | null | undefined,
): InjectableMeta | undefined {
  return (meta as Record<symbol, unknown> | null | undefined)?.[
    INJECTABLE_METADATA
  ] as InjectableMeta | undefined
}

export function getAuthorizationFromMeta(
  meta: DecoratorMetadata | null | undefined,
  handlerName: string | symbol,
): AuthorizationMetadata | undefined {
  const authorizationMap = (meta as Record<symbol, unknown> | null | undefined)?.[
    AUTHORIZATION_METADATA
  ] as Map<string | symbol, AuthorizationMetadata> | undefined

  return authorizationMap?.get(handlerName)
}
