import multer, { type Options as MulterOptions } from 'multer'

import {
  createAuthenticationMiddleware,
  RESOLVED_PRINCIPAL_KEY,
} from '#exjs-controllers/core/authentication/middleware'
import {
  UnauthorizedError,
  ForbiddenError,
} from '#exjs-controllers/core/authentication/errors'
import type { ResolvedPrincipal } from '#exjs-controllers/core/authentication/types'
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
    handlerParams,
  )
  const routeHandlers: Handler[] = []

  if (authenticationHandler) {
    routeHandlers.push(authenticationHandler)
  }

  // Upload (multer) roda DEPOIS do auth — não parseia o multipart de quem
  // nem está autorizado — e ANTES do handler, populando req.file/req.files.
  const uploadHandler = resolveUploadMiddleware(handlerParams)
  if (uploadHandler) {
    routeHandlers.push(uploadHandler)
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

// Constrói o middleware do multer para a rota quando há um param de upload.
// Suporta um param de upload por rota (single ou array). Sem opções, o
// multer usa memoryStorage (arquivo disponível em `buffer`).
function resolveUploadMiddleware(params: ParamMetadata[]): Handler | undefined {
  const uploadParam = params.find(
    (p) => p.type === 'uploaded-file' || p.type === 'uploaded-files',
  )
  if (!uploadParam?.name) {
    return undefined
  }

  const rawOptions = uploadParam.uploadOptions?.options
  const resolvedOptions =
    typeof rawOptions === 'function' ? rawOptions() : rawOptions
  const instance = multer((resolvedOptions ?? {}) as MulterOptions)

  return uploadParam.type === 'uploaded-files'
    ? instance.array(uploadParam.name)
    : instance.single(uploadParam.name)
}

function resolveArgs(
  request: {
    body: unknown
    locals: Record<string, unknown>
    params: Record<string, string | string[]>
    query: Record<string, unknown>
    headers: Record<string, string | string[] | undefined>
    file?: unknown
    files?: unknown
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
      case 'uploaded-file':
        args[p.index] = request.file
        break
      case 'uploaded-files':
        args[p.index] = request.files
        break
      case 'current-user':
      case 'current-api-key': {
        const attached = (request as any)[RESOLVED_PRINCIPAL_KEY] as
          | ResolvedPrincipal
          | undefined
        const expectedKind = p.type === 'current-user' ? 'user' : 'api-key'

        if (!attached) {
          if (p.optional === true) {
            args[p.index] = undefined
            break
          }
          throw new UnauthorizedError()
        }

        if (attached.kind !== expectedKind) {
          if (p.optional === true) {
            args[p.index] = undefined
            break
          }
          throw new ForbiddenError()
        }

        args[p.index] = attached.principal
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
  if (!param.schemaClass) {
    return body
  }

  if (body instanceof param.schemaClass) {
    return body
  }

  const SchemaClass = param.schemaClass as new () => object

  // Sem body (request sem JSON, ou parser que não populou `req.body`), o
  // handler recebe uma instância vazia do DTO. Assim a validação do use case
  // responde 422 listando os campos faltantes, em vez de um 500 por "input
  // não estende BaseSchema".
  if (typeof body !== 'object' || body === null) {
    return new SchemaClass()
  }

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
  handlerParams: ParamMetadata[],
): Handler | undefined {
  const authorization =
    getAuthorizationFromMeta(controllerDecoratorMetadata, handlerName) ??
    legacyAuthorizationMap.get(Object.getPrototypeOf(instance))?.get(handlerName)

  const principalParams = handlerParams.filter(
    p => p.type === 'current-user' || p.type === 'current-api-key',
  )
  const hasPrincipalDecorator = principalParams.length > 0
  const hasAuthorizedDecorator = authorization !== undefined

  if (!hasAuthorizedDecorator && !hasPrincipalDecorator) {
    return undefined
  }

  if (!serverOptions?.authentication) {
    throw new Error(
      `[Authentication] A rota protegida ${instance.constructor.name}.${String(handlerName)} exige authentication config no bootstrap.`,
    )
  }

  return createAuthenticationMiddleware({
    authentication: serverOptions.authentication,
    requiredPermissions: authorization?.permissions ?? [],
    allowedKinds: authorization?.kinds,
    hasAuthorizedDecorator,
  })
}
