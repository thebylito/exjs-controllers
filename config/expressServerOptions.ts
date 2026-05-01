import type { ErrorMiddleware, Handler } from '#exjs-controllers/http/httpTypes'
import type { ControllerClass } from '#exjs-controllers/core/Router'
import type { HttpLoggerOptions } from '#exjs-controllers/logging/httpLogger'
import type { OAuth2AuthenticationOptions } from '#exjs-controllers/authentication/oauth2'

export interface MiddlewareRegistration {
  path: string
  handlers: Handler[]
}

export interface ControllerDiscoveryOptions {
  rootDir?: string
  directories?: string[]
}

export interface OpenApiSecurityRequirement {
  [securitySchemeName: string]: string[]
}

export interface OpenApiOAuth2Flow {
  authorizationUrl?: string
  tokenUrl?: string
  refreshUrl?: string
  scopes: Record<string, string>
}

export interface OpenApiSecurityScheme {
  type: 'oauth2' | 'http' | 'apiKey' | 'openIdConnect'
  description?: string
  scheme?: string
  bearerFormat?: string
  name?: string
  in?: 'query' | 'header' | 'cookie'
  openIdConnectUrl?: string
  flows?: {
    authorizationCode?: OpenApiOAuth2Flow
    clientCredentials?: OpenApiOAuth2Flow
    implicit?: OpenApiOAuth2Flow
    password?: OpenApiOAuth2Flow
  }
}

export interface OpenApiServer {
  url: string
  description?: string
}

export interface OpenApiDocumentationOptions {
  info: {
    title: string
    version: string
  }
  components?: {
    securitySchemes?: Record<string, OpenApiSecurityScheme>
  }
  security?: OpenApiSecurityRequirement[]
}

export interface ScalarOAuth2FlowConfiguration {
  token?: string
  authorizationUrl?: string
  tokenUrl?: string
  'x-scalar-client-id'?: string
  'x-scalar-redirect-uri'?: string
  'x-usePkce'?: 'SHA-256' | 'plain' | 'no'
  selectedScopes?: string[]
  'x-scalar-security-query'?: Record<string, string>
  'x-scalar-security-body'?: Record<string, string>
  'x-tokenName'?: string
  'x-scalar-credentials-location'?: 'header' | 'body'
}

export interface ScalarAuthenticationConfiguration {
  preferredSecurityScheme?: string | string[] | Array<string | string[]>
  securitySchemes?: Record<
    string,
    {
      name?: string
      in?: 'header' | 'query' | 'cookie'
      value?: string
      token?: string
      username?: string
      password?: string
      flows?: {
        authorizationCode?: ScalarOAuth2FlowConfiguration
        clientCredentials?: ScalarOAuth2FlowConfiguration
        implicit?: ScalarOAuth2FlowConfiguration
        password?: ScalarOAuth2FlowConfiguration
      }
      'x-default-scopes'?: string[]
    }
  >
  createAnySecurityScheme?: boolean
}

export interface ScalarResolvedSecurity {
  in: 'header' | 'query' | 'cookie'
  name: string
  value: string
  format?: 'basic' | 'bearer'
}

export interface ScalarRequestBuilder {
  baseUrl: string
  method: string
  headers: Headers
  query: URLSearchParams
  cookies: Array<{ name: string; value: string; isDisabled?: boolean }>
  path: {
    raw: string
    variables: Record<string, string>
  }
  body: unknown
  security: ScalarResolvedSecurity[]
  options: {
    disableSecurity?: boolean
    isElectron?: boolean
  }
}

export interface ScalarBeforeRequestContext {
  request: Request
  requestBuilder: ScalarRequestBuilder
}

export interface ScalarConfigurationOptions {
  servers?: OpenApiServer[]
  referencePath?: string
  authentication?: ScalarAuthenticationConfiguration
  oauth2RedirectUri?: string
  persistAuth?: boolean
  onBeforeRequest?: (context: ScalarBeforeRequestContext) => void | Promise<void>
}

export interface ExpressServerOptions {
  controllers?: ControllerClass[]
  controllerDiscovery?: ControllerDiscoveryOptions
  authentication?: OAuth2AuthenticationOptions
  logger?: HttpLoggerOptions | false
  middlewares?: MiddlewareRegistration[]
  errorHandler?: ErrorMiddleware
  openapi?: {
    documentPath?: string
    documentation: OpenApiDocumentationOptions
  }
  scalar?: ScalarConfigurationOptions
  enableScalar?: boolean
}
