import { apiReference } from '@scalar/express-api-reference'
import { json } from 'express'

import {
  getControllerPrefix,
  getControllerResponseMode,
  registerControllersWithOptions,
  type ControllerClass,
} from '#exjs-controllers/core/Router'
import { discoverControllers } from '#exjs-controllers/core/discoverControllers'
import type {
  ExpressServerOptions,
  MiddlewareRegistration,
  OpenApiDocumentOptions,
  ScalarConfigurationOptions,
} from '#exjs-controllers/config/expressServerOptions'
import type { Application } from '#exjs-controllers/http/application'
import { createDefaultErrorHandler } from '#exjs-controllers/http/errorHandler'
import { ensureHttpContext, type Handler } from '#exjs-controllers/http/httpTypes'
import { createHttpLoggerMiddleware } from '#exjs-controllers/logging/httpLogger'
import {
  DEFAULT_OPENAPI_GROUP,
  generateOpenApiDocument,
  type OpenApiDocument,
} from '#exjs-controllers/openapi/generateOpenApiDocument'

const DEFAULT_OPENAPI_DOCUMENT_PATH = '/docs/openapi.json'
const DEFAULT_SCALAR_REFERENCE_PATH = '/docs'

/** Bundle do Scalar servido por padrão; sobrescreva com `scalar.cdn`. */
export const DEFAULT_SCALAR_CDN = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0'

interface ResolvedOpenApiDocument {
  key: string
  documentPath: string
  referencePath: string
  document: OpenApiDocument
}

export async function configureApplication(
  app: Application,
  options: ExpressServerOptions,
): Promise<Application> {
  const controllers = await resolveControllers(options)
  const openApiDocuments = shouldServeOpenApi(options)
    ? resolveOpenApiDocuments(controllers, options)
    : []

  const bindHttpContext: Handler = (request, response, next) => {
    ensureHttpContext(request, response)
    next()
  }

  app.use(bindHttpContext)

  if (options.logger) {
    app.use(createHttpLoggerMiddleware(options.logger))
  }

  applyFrameworkMiddlewares(app, controllers)

  applyMiddlewares(app, options.middlewares ?? [])

  for (const entry of openApiDocuments) {
    app.get(entry.documentPath, (_request, response) => {
      response.json(entry.document)
    })
  }

  if (options.enableScalar) {
    if (openApiDocuments.length === 0) {
      throw new Error(
        '[OpenAPI] enableScalar requires openapi documentation info to generate the reference document.',
      )
    }

    // `app.use('/docs')` também casa `/docs/admin`, então o Scalar de um
    // documento aninhado precisa ser montado antes do documento pai.
    const byLongestReferencePath = [...openApiDocuments].sort(
      (a, b) => b.referencePath.length - a.referencePath.length,
    )

    for (const entry of byLongestReferencePath) {
      const scalarConfiguration = buildScalarConfiguration(options, entry.document)

      // Scalar resolves request snippets from the runtime config, so the current
      // origin needs to be injected when the HTML is rendered for each request.
      const serveScalarReference: Handler = (request, response, next) => {
        const scalarMiddleware = apiReference({
          url: entry.documentPath,
          ...resolveScalarConfigurationForRequest(request, scalarConfiguration),
        }) as Handler

        scalarMiddleware(request, response, next)
      }

      app.use(entry.referencePath, serveScalarReference)
    }
  }

  registerControllersWithOptions(app, options, ...controllers)

  if (options.errorHandler && options.errorHandler.length < 4) {
    throw new Error(
      '[configureApplication] errorHandler precisa declarar 4 parâmetros (error, request, response, next); com menos o Express o ignora.',
    )
  }
  app.use(options.errorHandler ?? createDefaultErrorHandler())

  return app
}

function buildScalarConfiguration(
  options: ExpressServerOptions,
  openApiDocument: ReturnType<typeof generateOpenApiDocument>,
): ScalarConfigurationOptions {
  const scalarConfiguration: ScalarConfigurationOptions = {
    cdn: DEFAULT_SCALAR_CDN,
    ...(options.scalar ?? {}),
  }
  const securitySchemeName = resolveScalarSecuritySchemeName(
    options,
    openApiDocument,
  )

  if (!securitySchemeName) {
    return scalarConfiguration
  }

  const authentication = {
    ...(scalarConfiguration.authentication ?? {}),
  }

  authentication.preferredSecurityScheme ??= securitySchemeName

  const selectedScopes = getScalarSelectedScopes(openApiDocument, securitySchemeName)

  if (selectedScopes.length > 0) {
    const existingScheme = authentication.securitySchemes?.[securitySchemeName]
    const existingAuthorizationCodeFlow = existingScheme?.flows?.authorizationCode

    if (!existingAuthorizationCodeFlow?.selectedScopes?.length) {
      authentication.securitySchemes = {
        ...(authentication.securitySchemes ?? {}),
        [securitySchemeName]: {
          ...(existingScheme ?? {}),
          flows: {
            ...(existingScheme?.flows ?? {}),
            authorizationCode: {
              ...(existingAuthorizationCodeFlow ?? {}),
              selectedScopes,
            },
          },
        },
      }
    }
  }

  return {
    ...scalarConfiguration,
    authentication,
  }
}

function resolveScalarSecuritySchemeName(
  options: ExpressServerOptions,
  openApiDocument: ReturnType<typeof generateOpenApiDocument>,
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

  const registeredSchemes = Object.keys(
    options.authentication?.openApiSecuritySchemes ?? {},
  )
  if (registeredSchemes.length === 1) {
    return registeredSchemes[0]
  }

  return Object.keys(openApiDocument.components?.securitySchemes ?? {})[0]
}

function getScalarSelectedScopes(
  openApiDocument: ReturnType<typeof generateOpenApiDocument>,
  securitySchemeName: string,
): string[] {
  const securityScheme =
    openApiDocument.components?.securitySchemes?.[securitySchemeName]

  if (!securityScheme || securityScheme.type !== 'oauth2' || !securityScheme.flows) {
    return []
  }

  const scopes = new Set<string>()

  for (const flow of Object.values(securityScheme.flows)) {
    if (!flow) {
      continue
    }

    for (const scope of Object.keys(flow.scopes ?? {})) {
      scopes.add(scope)
    }
  }

  return [...scopes]
}

function shouldServeOpenApi(options: ExpressServerOptions): boolean {
  return Boolean(options.openapi || options.enableScalar)
}

function resolveOpenApiDocumentPath(options: ExpressServerOptions): string {
  return options.openapi?.documentPath ?? DEFAULT_OPENAPI_DOCUMENT_PATH
}

function resolveScalarReferencePath(options: ExpressServerOptions): string {
  return options.scalar?.referencePath ?? DEFAULT_SCALAR_REFERENCE_PATH
}

/**
 * Sem `openapi.documents`, há um único documento com todas as rotas nos
 * caminhos de sempre. Com `documents`, cada chave vira um documento próprio:
 * o `default` herda `openapi.documentPath` e `scalar.referencePath`; os demais
 * ficam em `<scalar.referencePath>/<chave>` e `<referencePath>/openapi.json`,
 * salvo caminhos explícitos.
 */
function resolveOpenApiDocuments(
  controllers: ControllerClass[],
  options: ExpressServerOptions,
): ResolvedOpenApiDocument[] {
  const baseDocumentPath = resolveOpenApiDocumentPath(options)
  const baseReferencePath = resolveScalarReferencePath(options)
  const documents = options.openapi?.documents

  if (!documents) {
    return [
      {
        key: DEFAULT_OPENAPI_GROUP,
        documentPath: baseDocumentPath,
        referencePath: baseReferencePath,
        document: generateOpenApiDocument(controllers, options),
      },
    ]
  }

  const entries = Object.entries(documents)

  if (entries.length === 0) {
    throw new Error(
      '[OpenAPI] openapi.documents está vazio. Remova a opção para servir um único documento ou declare ao menos um documento.',
    )
  }

  const resolved = entries.map(([key, documentOptions]) =>
    resolveOpenApiDocument(key, documentOptions, {
      controllers,
      options,
      baseDocumentPath,
      baseReferencePath,
    }),
  )

  assertUniqueDocumentPaths(resolved)

  return resolved
}

function resolveOpenApiDocument(
  key: string,
  documentOptions: OpenApiDocumentOptions,
  context: {
    controllers: ControllerClass[]
    options: ExpressServerOptions
    baseDocumentPath: string
    baseReferencePath: string
  },
): ResolvedOpenApiDocument {
  const isDefault = key === DEFAULT_OPENAPI_GROUP
  const referencePath =
    documentOptions.referencePath ??
    (isDefault ? context.baseReferencePath : joinPath(context.baseReferencePath, key))
  const documentPath =
    documentOptions.documentPath ??
    (isDefault ? context.baseDocumentPath : joinPath(referencePath, 'openapi.json'))

  return {
    key,
    documentPath,
    referencePath,
    document: generateOpenApiDocument(context.controllers, context.options, {
      groups: documentOptions.groups ?? [key],
      info: documentOptions.info,
      security: documentOptions.security,
    }),
  }
}

function assertUniqueDocumentPaths(documents: ResolvedOpenApiDocument[]): void {
  const seen = new Map<string, string>()

  for (const entry of documents) {
    for (const [field, value] of [
      ['documentPath', entry.documentPath],
      ['referencePath', entry.referencePath],
    ] as const) {
      const previous = seen.get(`${field}:${value}`)

      if (previous !== undefined) {
        throw new Error(
          `[OpenAPI] ${field} "${value}" está repetido nos documentos "${previous}" e "${entry.key}". Cada documento precisa de caminhos próprios.`,
        )
      }

      seen.set(`${field}:${value}`, entry.key)
    }
  }
}

function joinPath(base: string, segment: string): string {
  const trimmedBase = base.replace(/\/+$/, '')
  const trimmedSegment = segment.replace(/^\/+/, '')
  return `${trimmedBase}/${trimmedSegment}`
}

function resolveScalarConfigurationForRequest(
  request: Parameters<Application['get']>[1] extends (
    ...args: infer TArgs
  ) => unknown
    ? TArgs[0]
    : never,
  scalarConfiguration: ScalarConfigurationOptions | undefined,
): ScalarConfigurationOptions {
  if (scalarConfiguration?.servers && scalarConfiguration.servers.length > 0) {
    return scalarConfiguration
  }

  const origin = resolveRequestOrigin(request)

  if (!origin) {
    return scalarConfiguration ?? {}
  }

  return {
    ...(scalarConfiguration ?? {}),
    servers: [
      {
        url: origin,
      },
    ],
  }
}

// Host é controlado pelo cliente e a configuração do Scalar vai inline num <script>:
// só aceitamos hostname/IPv6 com porta opcional.
const HOST_HEADER_PATTERN =
  /^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(:\d{1,5})?$/

function resolveRequestOrigin(
  request: Parameters<Application['get']>[1] extends (
    ...args: infer TArgs
  ) => unknown
    ? TArgs[0]
    : never,
): string | undefined {
  const host = request.get('host')

  if (!host || !HOST_HEADER_PATTERN.test(host)) {
    return undefined
  }

  return `${request.protocol}://${host}`
}

async function resolveControllers(
  options: ExpressServerOptions,
): Promise<ControllerClass[]> {
  if (options.controllers && options.controllers.length > 0) {
    return options.controllers
  }

  return discoverControllers(options.controllerDiscovery)
}

function applyFrameworkMiddlewares(
  app: Application,
  controllers: ControllerClass[],
): void {
  const jsonPrefixes = new Set<string>()

  for (const controller of controllers) {
    if (getControllerResponseMode(controller) !== 'json') {
      continue
    }

    jsonPrefixes.add(getControllerPrefix(controller))
  }

  for (const prefix of jsonPrefixes) {
    if (prefix === '/' || prefix === '') {
      app.use(json())
      continue
    }

    app.use(prefix, json())
  }
}

function applyMiddlewares(
  app: Application,
  middlewares: MiddlewareRegistration[],
): void {
  for (const middleware of middlewares) {
    if (middleware.path === '/' || middleware.path === '') {
      app.use(...middleware.handlers)
      continue
    }

    app.use(middleware.path, ...middleware.handlers)
  }
}
