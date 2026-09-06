import * as z from 'zod'

import { classToZodOrUndefined } from '#exjs-controllers/core/ClassToZod'
import type {
  ExpressServerOptions,
  OpenApiDocumentationOptions,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
} from '#exjs-controllers/config/expressServerOptions'
import type { ControllerClass } from '#exjs-controllers/core/Router'
import type {
  AuthenticationConfig,
  PrincipalKind,
} from '#exjs-controllers/core/authentication/types'
import {
  legacyAuthorizationMap,
  legacyControllerMap,
  legacyParamMap,
  legacyRouteMap,
  type ParamMetadata,
} from '#exjs-controllers/metadata/legacyStorage'
import {
  getAuthorizationFromMeta,
  getControllerFromMeta,
  getRoutesFromMeta,
  type AuthorizationMetadata,
  type ControllerMeta,
  type HttpMethodType,
  type RouteMetadata,
} from '#exjs-controllers/metadata/symbols'

type JsonObject = Record<string, unknown>

interface OpenApiParameter {
  in: 'path' | 'query' | 'header'
  name: string
  required?: boolean
  schema: JsonObject
}

interface OpenApiOperation {
  summary?: string
  description?: string
  tags?: string[]
  parameters?: OpenApiParameter[]
  security?: OpenApiSecurityRequirement[]
  requestBody?: {
    required: boolean
    content: Record<string, { schema: JsonObject }>
  }
  responses: Record<
    string,
    { description: string; content?: Record<string, { schema: JsonObject }> }
  >
}

export interface OpenApiDocument {
  openapi: '3.1.0'
  info: {
    title: string
    version: string
  }
  components?: OpenApiDocumentationOptions['components']
  security?: OpenApiSecurityRequirement[]
  paths: Record<string, Partial<Record<HttpMethodType, OpenApiOperation>>>
}

/** Grupo atribuído às rotas que não declaram `group` nem no controller nem na rota. */
export const DEFAULT_OPENAPI_GROUP = 'default'

/**
 * Recorte de um documento: quais grupos entram e quais campos do documento
 * sobrescrevem a base em `openapi.documentation`.
 */
export interface OpenApiDocumentSelection {
  /** Grupos incluídos. Omitido, o documento inclui todas as rotas. */
  groups?: string[]
  info?: OpenApiDocumentationOptions['info']
  security?: OpenApiSecurityRequirement[]
}

export function resolveRouteGroup(
  controllerMeta: Pick<ControllerMeta, 'group'>,
  route: Pick<RouteMetadata, 'group'>,
): string {
  return route.group ?? controllerMeta.group ?? DEFAULT_OPENAPI_GROUP
}

export function generateOpenApiDocument(
  controllers: ControllerClass[],
  options: ExpressServerOptions,
  selection: OpenApiDocumentSelection = {},
): OpenApiDocument {
  const info = selection.info ??
    options.openapi?.documentation.info ?? {
      title: 'API Reference',
      version: '1.0.0',
    }
  const security = selection.security ?? options.openapi?.documentation.security
  const includedGroups = selection.groups ? new Set(selection.groups) : undefined

  const paths: OpenApiDocument['paths'] = {}

  for (const controller of controllers) {
    const controllerMeta = getControllerMeta(controller)
    const routes = getRouteMetadata(controller)
    const controllerParams = legacyParamMap.get(controller.prototype) ?? new Map()

    for (const route of routes) {
      if (
        includedGroups &&
        !includedGroups.has(resolveRouteGroup(controllerMeta, route))
      ) {
        continue
      }

      const fullPath = normalizePath(controllerMeta.prefix, route.path)
      const authorization = getAuthorizationMetadata(controller, route.handlerName)

      const operation = buildOperation(
        route,
        controllerParams.get(String(route.handlerName)) ?? [],
        authorization,
        options.authentication,
      )

      if (!paths[fullPath]) {
        paths[fullPath] = {}
      }

      paths[fullPath][route.method] = operation
    }
  }

  const components = buildComponents(options)

  return {
    openapi: '3.1.0',
    info,
    ...(components ? { components } : {}),
    ...(security ? { security } : {}),
    paths,
  }
}

function buildOperation(
  route: RouteMetadata,
  params: ParamMetadata[],
  authorization: AuthorizationMetadata | undefined,
  authentication: AuthenticationConfig | undefined,
): OpenApiOperation {
  const operation: OpenApiOperation = {
    responses: buildResponses(route),
  }

  if (route.summary) {
    operation.summary = route.summary
  }

  if (route.description) {
    operation.description = route.description
  }

  if (route.tags) {
    operation.tags = route.tags
  }

  const parameters = buildParameters(params)
  if (parameters.length > 0) {
    operation.parameters = parameters
  }

  const requestBody = buildRequestBody(route, params)
  if (requestBody) {
    operation.requestBody = requestBody
  }

  const security = buildRouteSecurity(authorization, params, authentication)
  if (security) {
    operation.security = security
  }

  return operation
}

function buildRouteSecurity(
  authorization: AuthorizationMetadata | undefined,
  params: ParamMetadata[],
  authentication: AuthenticationConfig | undefined,
): Array<Record<string, string[]>> | undefined {
  if (!authentication) return undefined

  const nonOptionalPrincipalKinds: PrincipalKind[] = params
    .filter(p =>
      (p.type === 'current-user' || p.type === 'current-api-key') &&
      p.optional !== true,
    )
    .map(p => (p.type === 'current-user' ? 'user' : 'api-key'))

  const hasAuth = authorization !== undefined
  const hasNonOptionalPrincipal = nonOptionalPrincipalKinds.length > 0

  if (!hasAuth && !hasNonOptionalPrincipal) return undefined

  const requiredKinds: PrincipalKind[] =
    authorization?.kinds ??
    (hasNonOptionalPrincipal
      ? Array.from(new Set(nonOptionalPrincipalKinds))
      : ['user', 'api-key'])

  const schemes = authentication.openApiSecuritySchemes ?? {}
  const eligible = Object.entries(schemes).filter(([_, entry]) => {
    if (!entry.kinds || entry.kinds.length === 0) return true
    return entry.kinds.some(k => requiredKinds.includes(k))
  })

  if (eligible.length === 0) return undefined

  const scopes = authorization?.permissions ?? []
  return eligible.map(([name]) => ({ [name]: scopes }))
}

function buildParameters(params: ParamMetadata[]): OpenApiParameter[] {
  const parameters: OpenApiParameter[] = []

  for (const param of params) {
    if (!param.name) {
      continue
    }

    switch (param.type) {
      case 'param':
        parameters.push({
          in: 'path',
          name: param.name,
          required: true,
          schema: { type: 'string' },
        })
        break
      case 'query':
        parameters.push({
          in: 'query',
          name: param.name,
          schema: { type: 'string' },
        })
        break
      case 'header':
        parameters.push({
          in: 'header',
          name: param.name,
          schema: { type: 'string' },
        })
        break
    }
  }

  return parameters
}

function buildRequestBody(
  route: RouteMetadata,
  params: ParamMetadata[],
): OpenApiOperation['requestBody'] | undefined {
  // Rotas com upload: requestBody multipart/form-data com os campos de
  // arquivo como binário (Scalar renderiza um seletor de arquivo).
  const uploadParams = params.filter(
    (param) =>
      param.type === 'uploaded-file' || param.type === 'uploaded-files',
  )
  if (uploadParams.length > 0) {
    const properties: Record<string, JsonObject> = {}
    const required: string[] = []
    for (const param of uploadParams) {
      if (!param.name) continue
      properties[param.name] =
        param.type === 'uploaded-files'
          ? { type: 'array', items: { type: 'string', format: 'binary' } }
          : { type: 'string', format: 'binary' }
      if (param.optional !== true) required.push(param.name)
    }
    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties,
            ...(required.length > 0 ? { required } : {}),
          } as JsonObject,
        },
      },
    }
  }

  const bodyParam = params.find((param) => param.type === 'body')
  const inputClass = bodyParam?.schemaClass ?? route.inputClass
  const schema = buildSchemaFromClass(inputClass, 'input')

  if (!schema) {
    return undefined
  }

  return {
    required: true,
    content: {
      'application/json': {
        schema,
      },
    },
  }
}

function buildResponses(route: RouteMetadata): OpenApiOperation['responses'] {
  const itemSchema = buildSchemaFromClass(route.outputClass, 'output')

  if (!itemSchema) {
    return {
      '200': {
        description: 'Successful response',
      },
    }
  }

  const outputSchema = route.outputIsArray
    ? { type: 'array', items: itemSchema }
    : itemSchema

  return {
    '200': {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: outputSchema as JsonObject,
        },
      },
    },
  }
}

function buildSchemaFromClass(
  schemaClass: RouteMetadata['inputClass'],
  io: 'input' | 'output',
): JsonObject | undefined {
  const schema = classToZodOrUndefined(schemaClass)

  if (!schema) {
    return undefined
  }

  return z.toJSONSchema(schema, {
    io,
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as JsonObject
}

function getControllerMeta(Ctor: ControllerClass): ControllerMeta {
  const metadata = (Ctor as { [Symbol.metadata]?: DecoratorMetadata })[
    Symbol.metadata
  ]
  return (
    getControllerFromMeta(metadata) ??
    legacyControllerMap.get(Ctor) ?? {
      prefix: '',
      responseMode: 'default',
      target: Ctor,
    }
  )
}

function getRouteMetadata(Ctor: ControllerClass): RouteMetadata[] {
  const metadata = (Ctor as { [Symbol.metadata]?: DecoratorMetadata })[
    Symbol.metadata
  ]
  const tc39Routes = getRoutesFromMeta(metadata)

  if (tc39Routes.length > 0) {
    return tc39Routes
  }

  return legacyRouteMap.get(Ctor.prototype) ?? []
}

function getAuthorizationMetadata(
  Ctor: ControllerClass,
  handlerName: string | symbol,
): AuthorizationMetadata | undefined {
  const metadata = (Ctor as { [Symbol.metadata]?: DecoratorMetadata })[
    Symbol.metadata
  ]
  const tc39Authorization = getAuthorizationFromMeta(metadata, handlerName)

  if (tc39Authorization) {
    return tc39Authorization
  }

  return legacyAuthorizationMap.get(Ctor.prototype)?.get(handlerName)
}

function buildComponents(
  options: ExpressServerOptions,
): OpenApiDocument['components'] | undefined {
  const userComponents = options.openapi?.documentation.components
  const authSchemes = options.authentication?.openApiSecuritySchemes

  if (!authSchemes && !userComponents) return undefined

  const securitySchemes: Record<string, OpenApiSecurityScheme> = {
    ...(userComponents?.securitySchemes ?? {}),
  }

  for (const [name, entry] of Object.entries(authSchemes ?? {})) {
    securitySchemes[name] = entry.scheme as unknown as OpenApiSecurityScheme
  }

  return {
    ...(userComponents ?? {}),
    ...(Object.keys(securitySchemes).length > 0 ? { securitySchemes } : {}),
  }
}

function normalizePath(prefix: string, routePath: string): string {
  const combined = (prefix + routePath).replace(/\/+/g, '/')
  const withoutTrailingSlash =
    combined.endsWith('/') && combined.length > 1 ? combined.slice(0, -1) : combined || '/'
  return withoutTrailingSlash.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}')
}
