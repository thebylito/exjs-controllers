import type { ZodType } from 'zod'
import type {
  RouteMetadata,
  ControllerMeta,
  InjectableMeta,
  InjectionToken,
  AuthorizationMetadata,
} from '#exjs-controllers/metadata/symbols'

export const legacyFieldMap = new WeakMap<object, Record<string, ZodType>>()
export const legacyRouteMap = new WeakMap<object, RouteMetadata[]>()
export const legacyControllerMap = new WeakMap<Function, ControllerMeta>()
export const legacyInjectableMap = new WeakMap<Function, InjectableMeta>()
export const legacyAuthorizationMap = new WeakMap<
  object,
  Map<string | symbol, AuthorizationMetadata>
>()

export type ParamType =
  | 'body'
  | 'param'
  | 'query'
  | 'query-all'
  | 'header'
  | 'req'
  | 'res'
  | 'current-user'
  | 'current-api-key'

export interface ParamMetadata {
  index: number
  type: ParamType
  name?: string
  schemaClass?: new (...args: any[]) => object
  optional?: boolean
}

export const legacyParamMap = new WeakMap<object, Map<string, ParamMetadata[]>>()
export const legacyInjectionMap = new WeakMap<
  Function,
  Map<number, InjectionToken>
>()
