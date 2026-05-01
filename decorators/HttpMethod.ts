import { ROUTE_METADATA, type HttpMethodType, type RouteMetadata, type RouteOptions } from '#exjs-controllers/metadata/symbols'
import { legacyRouteMap } from '#exjs-controllers/metadata/legacyStorage'

function createRouteDecorator(method: HttpMethodType, path: string, options: RouteOptions = {}) {
  return function (
    _valueOrTarget: Function | object,
    ctxOrKey: ClassMethodDecoratorContext | string,
    _descriptor?: PropertyDescriptor,
  ): void {
    const routeMeta: RouteMetadata = { method, path, handlerName: '', ...options }

    if (typeof ctxOrKey === 'object' && ctxOrKey !== null && 'metadata' in ctxOrKey) {
      const ctx = ctxOrKey as ClassMethodDecoratorContext
      routeMeta.handlerName = ctx.name
      const meta = ctx.metadata as Record<symbol, unknown>
      if (!meta[ROUTE_METADATA]) meta[ROUTE_METADATA] = [] as RouteMetadata[]
      ;(meta[ROUTE_METADATA] as RouteMetadata[]).push(routeMeta)
      return
    }

    routeMeta.handlerName = ctxOrKey as string
    const proto = _valueOrTarget as object
    if (!legacyRouteMap.has(proto)) legacyRouteMap.set(proto, [])
    legacyRouteMap.get(proto)!.push(routeMeta)
  }
}

export const Get = (path: string, options?: RouteOptions) =>
  createRouteDecorator('get', path, options)

export const Post = (path: string, options?: RouteOptions) =>
  createRouteDecorator('post', path, options)

export const Put = (path: string, options?: RouteOptions) =>
  createRouteDecorator('put', path, options)

export const Patch = (path: string, options?: RouteOptions) =>
  createRouteDecorator('patch', path, options)

export const Delete = (path: string, options?: RouteOptions) =>
  createRouteDecorator('delete', path, options)
