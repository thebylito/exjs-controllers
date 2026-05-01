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
  ScalarConfigurationOptions,
} from '#exjs-controllers/config/expressServerOptions'
import type { Application } from '#exjs-controllers/http/application'
import { ensureHttpContext, type Handler } from '#exjs-controllers/http/httpTypes'
import { createHttpLoggerMiddleware } from '#exjs-controllers/logging/httpLogger'
import { generateOpenApiDocument } from '#exjs-controllers/openapi/generateOpenApiDocument'

const DEFAULT_OPENAPI_DOCUMENT_PATH = '/docs/openapi.json'
const DEFAULT_SCALAR_REFERENCE_PATH = '/docs'

export async function configureApplication(
  app: Application,
  options: ExpressServerOptions,
): Promise<Application> {
  const controllers = await resolveControllers(options)
  const openApiDocumentPath = resolveOpenApiDocumentPath(options)
  const scalarReferencePath = resolveScalarReferencePath(options)
  const openApiDocument = shouldServeOpenApi(options)
    ? generateOpenApiDocument(controllers, options)
    : undefined
  const scalarConfiguration = openApiDocument
    ? buildScalarConfiguration(options, openApiDocument)
    : undefined

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

  if (openApiDocument) {
    app.get(openApiDocumentPath, (_request, response) => {
      response.json(openApiDocument)
    })
  }

  if (options.enableScalar) {
    if (!openApiDocument) {
      throw new Error(
        '[OpenAPI] enableScalar requires openapi documentation info to generate the reference document.',
      )
    }

    // Scalar resolves request snippets from the runtime config, so the current
    // origin needs to be injected when the HTML is rendered for each request.
    const serveScalarReference: Handler = (request, response, next) => {
      const scalarMiddleware = apiReference({
        url: openApiDocumentPath,
        ...resolveScalarConfigurationForRequest(request, scalarConfiguration),
      }) as Handler

      scalarMiddleware(request, response, next)
    }

    app.use(scalarReferencePath, serveScalarReference)
  }

  registerControllersWithOptions(app, options, ...controllers)

  if (options.errorHandler) {
    app.use(options.errorHandler)
  }

  return app
}

function buildScalarConfiguration(
  options: ExpressServerOptions,
  openApiDocument: ReturnType<typeof generateOpenApiDocument>,
): ScalarConfigurationOptions {
  const scalarConfiguration: ScalarConfigurationOptions = {
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

  if (options.authentication?.provider.name) {
    return options.authentication.provider.name
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

  const host = request.get('host')

  if (!host) {
    return scalarConfiguration ?? {}
  }

  return {
    ...(scalarConfiguration ?? {}),
    servers: [
      {
        url: getRequestOrigin(request),
      },
    ],
  }
}

function getRequestOrigin(
  request: Parameters<Application['get']>[1] extends (
    ...args: infer TArgs
  ) => unknown
    ? TArgs[0]
    : never,
): string {
  return `${request.protocol}://${request.get('host')}`
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
