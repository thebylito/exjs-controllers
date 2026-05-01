import * as z from 'zod'

import { classToZodOrUndefined } from '#exjs-controllers/core/ClassToZod'
import type {
  ExpressServerOptions,
  OpenApiDocumentationOptions,
  OpenApiSecurityRequirement,
} from '#exjs-controllers/config/expressServerOptions'
import type { ControllerClass } from '#exjs-controllers/core/Router'
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

export function generateOpenApiDocument(
  controllers: ControllerClass[],
  options: ExpressServerOptions,
): OpenApiDocument {
  const info = options.openapi?.documentation.info ?? {
    title: 'API Reference',
    version: '1.0.0',
  }

  const paths: OpenApiDocument['paths'] = {}
  const securitySchemeName = resolveSecuritySchemeName(options)
  const documentedOAuthScopes = resolveDocumentedOAuthScopes(
    options,
    securitySchemeName,
  )

  for (const controller of controllers) {
    const controllerMeta = getControllerMeta(controller)
    const routes = getRouteMetadata(controller)
    const controllerParams = legacyParamMap.get(controller.prototype) ?? new Map()

    for (const route of routes) {
      const fullPath = normalizePath(controllerMeta.prefix, route.path)
      const authorization = getAuthorizationMetadata(controller, route.handlerName)

      const operation = buildOperation(
        route,
        controllerParams.get(String(route.handlerName)) ?? [],
        authorization,
        securitySchemeName,
        documentedOAuthScopes,
      )

      if (!paths[fullPath]) {
        paths[fullPath] = {}
      }

      paths[fullPath][route.method] = operation
    }
  }

  return {
    openapi: '3.1.0',
    info,
    ...(buildComponents(options)
      ? {
          components: buildComponents(options),
        }
      : {}),
    ...(options.openapi?.documentation.security
      ? { security: options.openapi.documentation.security }
      : {}),
    paths,
  }
}

function buildOperation(
  route: RouteMetadata,
  params: ParamMetadata[],
  authorization: AuthorizationMetadata | undefined,
  securitySchemeName: string | undefined,
  documentedOAuthScopes: Set<string> | undefined,
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

  if (authorization && securitySchemeName) {
    operation.security = [
      {
        [securitySchemeName]: resolveDocumentedSecurityRequirementScopes(
          authorization.requiredScopes,
          documentedOAuthScopes,
        ),
      },
    ]
  }

  return operation
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
  const outputSchema = buildSchemaFromClass(route.outputClass, 'output')

  if (!outputSchema) {
    return {
      '200': {
        description: 'Successful response',
      },
    }
  }

  return {
    '200': {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: outputSchema,
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

function resolveSecuritySchemeName(
  options: ExpressServerOptions,
): string | undefined {
  const preferredSecurityScheme =
    options.scalar?.authentication?.preferredSecurityScheme

  if (typeof preferredSecurityScheme === 'string') {
    return preferredSecurityScheme
  }

  if (Array.isArray(preferredSecurityScheme)) {
    const firstEntry = preferredSecurityScheme[0]

    if (typeof firstEntry === 'string') {
      return firstEntry
    }

    if (Array.isArray(firstEntry)) {
      return firstEntry.find((candidate) => typeof candidate === 'string')
    }
  }

  if (options.authentication?.provider.name) {
    return options.authentication.provider.name
  }

  return Object.keys(
    options.openapi?.documentation.components?.securitySchemes ?? {},
  )[0]
}

function buildComponents(
  options: ExpressServerOptions,
): OpenApiDocument['components'] | undefined {
  return options.openapi?.documentation.components
}

function resolveDocumentedOAuthScopes(
  options: ExpressServerOptions,
  securitySchemeName: string | undefined,
): Set<string> | undefined {
  if (!securitySchemeName) {
    return undefined
  }

  const scheme =
    options.openapi?.documentation.components?.securitySchemes?.[securitySchemeName]

  if (!scheme || scheme.type !== 'oauth2' || !scheme.flows) {
    return undefined
  }

  const scopes = new Set<string>()

  for (const flow of Object.values(scheme.flows)) {
    if (!flow) {
      continue
    }

    for (const scope of Object.keys(flow.scopes ?? {})) {
      scopes.add(scope)
    }
  }

  return scopes
}

function resolveDocumentedSecurityRequirementScopes(
  requiredScopes: string[],
  documentedOAuthScopes: Set<string> | undefined,
): string[] {
  if (
    !documentedOAuthScopes ||
    requiredScopes.length === 0 ||
    !requiredScopes.every((scope) => documentedOAuthScopes.has(scope))
  ) {
    return []
  }

  return requiredScopes
}

function normalizePath(prefix: string, routePath: string): string {
  const combined = (prefix + routePath).replace(/\/+/g, '/')
  return combined.endsWith('/') && combined.length > 1
    ? combined.slice(0, -1)
    : combined || '/'
}
