import type { ErrorMiddleware, Handler } from '#exjs-controllers/http/httpTypes'
import type { ControllerClass } from '#exjs-controllers/core/Router'
import type { HttpLoggerOptions } from '#exjs-controllers/logging/httpLogger'
import type { AuthenticationConfig } from '#exjs-controllers/core/authentication/types'

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

/**
 * Um documento OpenAPI servido separadamente, contendo só as rotas dos grupos
 * indicados. A chave em `openapi.documents` identifica o documento e, por
 * padrão, também é o único grupo incluído nele.
 */
export interface OpenApiDocumentOptions {
  /**
   * Caminho do JSON deste documento. Padrão: `openapi.documentPath` para a
   * chave `default`; `<referencePath>/openapi.json` para as demais.
   */
  documentPath?: string
  /**
   * Caminho do Scalar deste documento, quando `enableScalar` está ativo.
   * Padrão: `scalar.referencePath` para a chave `default`;
   * `<scalar.referencePath>/<chave>` para as demais.
   */
  referencePath?: string
  /** Grupos incluídos no documento. Padrão: `[chave]`. */
  groups?: string[]
  /** Sobrescreve `documentation.info` só neste documento. */
  info?: OpenApiDocumentationOptions['info']
  /** Sobrescreve `documentation.security` só neste documento. */
  security?: OpenApiSecurityRequirement[]
}

export interface ExpressServerOptions {
  controllers?: ControllerClass[]
  controllerDiscovery?: ControllerDiscoveryOptions
  authentication?: AuthenticationConfig
  logger?: HttpLoggerOptions | false
  middlewares?: MiddlewareRegistration[]
  errorHandler?: ErrorMiddleware
  openapi?: {
    documentPath?: string
    documentation: OpenApiDocumentationOptions
    /**
     * Documentos separados por grupo (`@Controller(prefix, { group })` e
     * `RouteOptions.group`). Sem esta opção, um único documento inclui todas
     * as rotas, independentemente de grupo. Com ela, cada documento inclui só
     * os seus grupos, e um grupo que nenhum documento referencia não é
     * exposto em lugar nenhum.
     */
    documents?: Record<string, OpenApiDocumentOptions>
  }
  scalar?: ScalarConfigurationOptions
  enableScalar?: boolean
}
