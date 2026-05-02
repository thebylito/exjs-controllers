import { createOAuth2AuthenticationMiddleware } from '#exjs-controllers/authentication/oauth2'
import { getAuthenticationContext } from '#exjs-controllers/authentication/oauth2'
import type { ExpressServerOptions } from '#exjs-controllers/config/expressServerOptions'
import type { Application } from '#exjs-controllers/http/application'
import { ensureHttpContext, type Handler } from '#exjs-controllers/http/httpTypes'
import {
  getAuthorizationFromMeta,
  getControllerFromMeta,
  getRoutesFromMeta,
  type RouteMetadata,
} from '#exjs-controllers/metadata/symbols'
import {
  legacyAuthorizationMap,
  legacyControllerMap,
  legacyRouteMap,
  legacyParamMap,
  type ParamMetadata,
} from '#exjs-controllers/metadata/legacyStorage'
import { resolveDependency } from '#exjs-controllers/core/DependencyContainer'
import { runWithControllerSpan } from '#exjs-controllers/observability/tracing'

export type ControllerClass = new (...args: any[]) => object

const registeredRoutes = new Set<string>()

class RequiredSessionContextError extends Error {
  readonly statusCode = 401

  constructor() {
    super('Authenticated session context is required for @SessionContext().')
    this.name = 'RequiredSessionContextError'
  }
}

export function _resetRoutesForTests(): void {
  registeredRoutes.clear()
}

export function registerControllers(
  app: Application,
  ...controllers: ControllerClass[]
): void {
  registerControllersWithOptions(app, undefined, ...controllers)
}

export function registerControllersWithOptions(
  app: Application,
  options: ExpressServerOptions | undefined,
  ...controllers: ControllerClass[]
): void {
  for (const Ctor of controllers) {
    const meta = (Ctor as unknown as { [Symbol.metadata]?: DecoratorMetadata })[
      Symbol.metadata
    ]
    const tc39Routes = getRoutesFromMeta(meta)
    const legacyRoutes = legacyRouteMap.get(Ctor.prototype) ?? []
    const controllerMeta = getControllerMeta(Ctor)
    const routes = tc39Routes.length > 0 ? tc39Routes : legacyRoutes
    const instance = resolveDependency(Ctor)

    for (const route of routes) {
      registerRoute(app, instance, controllerMeta, route, Ctor.name, meta, options)
    }
  }
}

export function getControllerPrefix(Ctor: ControllerClass): string {
  return getControllerMeta(Ctor).prefix
}

export function getControllerResponseMode(
  Ctor: ControllerClass,
): 'default' | 'json' {
  return getControllerMeta(Ctor).responseMode
}

function getControllerMeta(Ctor: ControllerClass): {
  prefix: string
  responseMode: 'default' | 'json'
} {
  const meta = (Ctor as unknown as { [Symbol.metadata]?: DecoratorMetadata })[
    Symbol.metadata
  ]
  const controllerMeta = getControllerFromMeta(meta)
  const legacyMeta = legacyControllerMap.get(Ctor)
  return {
    prefix: (controllerMeta ?? legacyMeta)?.prefix ?? '',
    responseMode: (controllerMeta ?? legacyMeta)?.responseMode ?? 'default',
  }
}

function registerRoute(
  app: Application,
  instance: object,
  controllerMeta: { prefix: string; responseMode: 'default' | 'json' },
  route: RouteMetadata,
  controllerName: string,
  controllerDecoratorMetadata: DecoratorMetadata | undefined,
  serverOptions: ExpressServerOptions | undefined,
): void {
  const fullPath = normalizePath(controllerMeta.prefix, route.path)
  const routeKey = `${route.method.toUpperCase()} ${fullPath}`

  if (registeredRoutes.has(routeKey)) {
    throw new Error(
      `[Router] Rota duplicada detectada: ${routeKey} já foi registrada por outro controller. ` +
        `Conflito em "${controllerName}.${String(route.handlerName)}".`,
    )
  }

  registeredRoutes.add(routeKey)

  const proto = Object.getPrototypeOf(instance) as object
  const handlerParams =
    legacyParamMap.get(proto)?.get(String(route.handlerName)) ?? []

  const handler = (instance as Record<string | symbol, unknown>)[
    route.handlerName
  ] as (...args: unknown[]) => unknown

  const authenticationHandler = resolveAuthenticationHandler(
    instance,
    route.handlerName,
    controllerDecoratorMetadata,
    serverOptions,
  )
  const routeHandlers: Handler[] = []

  if (authenticationHandler) {
    routeHandlers.push(authenticationHandler)
  }

  const routeHandler: Handler = async (request, response, next) => {
    const ctx = ensureHttpContext(request, response)

    try {
      const args = resolveArgs(ctx.request, ctx.response, handlerParams)
      const result = await runWithControllerSpan(
        {
          controllerName,
          handlerName: String(route.handlerName),
          httpMethod: route.method,
          routePath: fullPath,
        },
        () => handler.call(instance, ...args),
      )

      if (controllerMeta.responseMode === 'json') {
        writeJsonControllerResult(ctx.response, result)
        return
      }

      writeControllerResult(ctx.response, result)
    } catch (error) {
      next(error)
    }
  }

  routeHandlers.push(routeHandler)

  app.register(route.method, fullPath, ...routeHandlers)
}

function writeControllerResult(
  response: {
    headersSent: boolean
    type: (contentType: string) => unknown
    send: (body: unknown) => unknown
  },
  result: unknown,
): void {
  if (result === undefined || response.headersSent) {
    return
  }

  if (typeof result === 'string') {
    response.type('text/plain')
  }

  response.send(result)
}

function writeJsonControllerResult(
  response: {
    headersSent: boolean
    json: (body: unknown) => unknown
  },
  result: unknown,
): void {
  if (result === undefined || response.headersSent) {
    return
  }

  response.json(normalizeJsonControllerResult(result))
}

function normalizeJsonControllerResult(result: unknown): unknown {
  if (typeof result !== 'string') {
    return result
  }

  try {
    return JSON.parse(result)
  } catch {
    return result
  }
}

function resolveArgs(
  request: {
    body: unknown
    locals: Record<string, unknown>
    params: Record<string, string | string[]>
    query: Record<string, unknown>
    headers: Record<string, string | string[] | undefined>
  },
  response: unknown,
  params: ParamMetadata[],
): unknown[] {
  if (params.length === 0) return [request]

  const args: unknown[] = []

  for (const p of params) {
    switch (p.type) {
      case 'body':
        args[p.index] = hydrateBodyArg(request.body, p)
        break
      case 'param':
        args[p.index] = getFirstValue(request.params[p.name!])
        break
      case 'query':
        args[p.index] = request.query[p.name!]
        break
      case 'query-all':
        args[p.index] = request.query
        break
      case 'header':
        args[p.index] = request.headers[p.name!]
        break
      case 'req':
        args[p.index] = request
        break
      case 'res':
        args[p.index] = response
        break
      case 'session-context': {
        const authenticationContext = getAuthenticationContext(request)

        if (!authenticationContext) {
          throw new RequiredSessionContextError()
        }

        args[p.index] = authenticationContext
        break
      }
    }
  }

  return args
}

function getFirstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function hydrateBodyArg(body: unknown, param: ParamMetadata): unknown {
  if (!param.schemaClass || typeof body !== 'object' || body === null) {
    return body
  }

  if (body instanceof param.schemaClass) {
    return body
  }

  const SchemaClass = param.schemaClass as new () => object

  return Object.assign(new SchemaClass(), body)
}

function normalizePath(prefix: string, routePath: string): string {
  const combined = (prefix + routePath).replace(/\/+/g, '/')
  return combined.endsWith('/') && combined.length > 1
    ? combined.slice(0, -1)
    : combined || '/'
}

function resolveAuthenticationHandler(
  instance: object,
  handlerName: string | symbol,
  controllerDecoratorMetadata: DecoratorMetadata | undefined,
  serverOptions: ExpressServerOptions | undefined,
): Handler | undefined {
  const authorization =
    getAuthorizationFromMeta(controllerDecoratorMetadata, handlerName) ??
    legacyAuthorizationMap.get(Object.getPrototypeOf(instance))?.get(handlerName)

  if (!authorization) {
    return undefined
  }

  if (!serverOptions?.authentication) {
    throw new Error(
      `[Authentication] A rota protegida ${instance.constructor.name}.${String(handlerName)} exige configuracao de authentication no bootstrap.`,
    )
  }

  return createOAuth2AuthenticationMiddleware({
    authentication: serverOptions.authentication,
    requiredScopes: authorization.requiredScopes,
  })
}
