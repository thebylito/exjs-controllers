import { ensureHttpContext, type Handler } from '#exjs-controllers/http/httpTypes'
import { fetchOAuth2DiscoveryDocument } from '#exjs-controllers/authentication/oauth2Discovery'

export const AUTHENTICATION_CONTEXT_KEY = 'auth'

export interface AuthenticationContext {
  provider: string
  scheme: 'oauth2' | 'session'
  subject?: string
  scopes: string[]
  claims: Record<string, unknown>
}

export interface OAuth2IntrospectionOptions {
  url: string
  clientId: string
  clientSecret: string
  timeoutMs?: number
  headers?: Record<string, string>
}

export interface OAuth2DiscoveryOptions {
  url: string
  clientId: string
  clientSecret: string
  timeoutMs?: number
  headers?: Record<string, string>
}

export type OAuth2AuthenticationProviderOptions =
  | {
      type: 'oauth2'
      name: string
      introspection: OAuth2IntrospectionOptions
    }
  | {
      type: 'oauth2'
      name: string
      discovery: OAuth2DiscoveryOptions
    }

const discoveryIntrospectionOptionsCache = new WeakMap<
  OAuth2AuthenticationProviderOptions,
  Promise<OAuth2IntrospectionOptions | null>
>()

export interface OAuth2AuthenticationOptions {
  provider: OAuth2AuthenticationProviderOptions
  allowDirectBearerAuthentication?: boolean
}

export interface OAuth2AuthenticationMiddlewareOptions {
  authentication: OAuth2AuthenticationOptions
  requiredScopes?: string[]
}

export function createOAuth2AuthenticationMiddleware(
  options: OAuth2AuthenticationMiddlewareOptions,
): Handler {
  return async (request, response, next) => {
    const ctx = ensureHttpContext(request, response)
    const existingAuthentication = getAuthenticationContext(ctx.request)

    if (existingAuthentication) {
      if (
        !hasRequiredScopes(
          existingAuthentication.scopes,
          options.requiredScopes ?? [],
        )
      ) {
        ctx.response.status(403).json({
          error: 'insufficient_scope',
          message: 'Authenticated session does not grant the required permissions.',
          requiredScopes: options.requiredScopes ?? [],
        })
        return
      }

      next()
      return
    }

    if (options.authentication.allowDirectBearerAuthentication === false) {
      ctx.response.status(401).json({
        error: 'local_auth_required',
        message:
          'This resource is managed by the application and requires local authentication context.',
      })
      return
    }

    const accessToken = extractBearerToken(ctx.request.get('authorization'))

    if (!accessToken) {
      ctx.response.status(401).json({
        error: 'missing_bearer_token',
        message: 'Bearer token is required for this resource.',
      })
      return
    }

    const introspectionResult = await introspectAccessToken(
      accessToken,
      options.authentication.provider,
    )

    if (introspectionResult.status === 'provider_error') {
      ctx.response.status(502).json({
        error: 'oauth2_provider_unavailable',
        message: 'OAuth2 provider introspection request failed.',
      })
      return
    }

    if (introspectionResult.status === 'inactive') {
      ctx.response.status(401).json({
        error: 'invalid_token',
        message: 'Access token rejected by the OAuth2 provider.',
      })
      return
    }

    const scopes = parseScopes(introspectionResult.claims.scope)

    if (!hasRequiredScopes(scopes, options.requiredScopes ?? [])) {
      ctx.response.status(403).json({
        error: 'insufficient_scope',
        message: 'Access token does not grant the required scopes.',
        requiredScopes: options.requiredScopes ?? [],
      })
      return
    }

    setAuthenticationContext(ctx.request, {
      provider: options.authentication.provider.name,
      scheme: 'oauth2',
      subject: resolveSubject(introspectionResult.claims),
      scopes,
      claims: introspectionResult.claims,
    })

    next()
  }
}

export function setAuthenticationContext(
  request: { locals: Record<string, unknown> },
  context: AuthenticationContext,
): void {
  request.locals[AUTHENTICATION_CONTEXT_KEY] =
    context satisfies AuthenticationContext
}

export function getAuthenticationContext(request: {
  locals: Record<string, unknown>
}): AuthenticationContext | undefined {
  const candidate = request.locals[AUTHENTICATION_CONTEXT_KEY]

  if (!isAuthenticationContext(candidate)) {
    return undefined
  }

  return candidate
}

type OAuth2IntrospectionClaims = Record<string, unknown> & {
  active?: boolean
  scope?: unknown
  sub?: unknown
  username?: unknown
  client_id?: unknown
}

type IntrospectionResult =
  | { status: 'active'; claims: OAuth2IntrospectionClaims }
  | { status: 'inactive' }
  | { status: 'provider_error' }

async function introspectAccessToken(
  accessToken: string,
  provider: OAuth2AuthenticationProviderOptions,
): Promise<IntrospectionResult> {
  const introspection = await resolveIntrospectionOptions(provider)

  if (!introspection) {
    return { status: 'provider_error' }
  }

  const abortController = new AbortController()
  const timeoutMs = introspection.timeoutMs ?? 5000
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await fetch(introspection.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: buildBasicAuthorizationHeader(
          introspection.clientId,
          introspection.clientSecret,
        ),
        'content-type': 'application/x-www-form-urlencoded',
        ...introspection.headers,
      },
      body: new URLSearchParams({
        token: accessToken,
        token_type_hint: 'access_token',
      }),
      signal: abortController.signal,
    })

    if (!response.ok) {
      return { status: 'provider_error' }
    }

    const payload = await response.json()
    if (!isOAuth2IntrospectionClaims(payload)) {
      return { status: 'provider_error' }
    }

    if (payload.active !== true) {
      return { status: 'inactive' }
    }

    return { status: 'active', claims: payload }
  } catch {
    return { status: 'provider_error' }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

async function resolveIntrospectionOptions(
  provider: OAuth2AuthenticationProviderOptions,
): Promise<OAuth2IntrospectionOptions | null> {
  if ('introspection' in provider) {
    return provider.introspection
  }

  const cached = discoveryIntrospectionOptionsCache.get(provider)

  if (cached) {
    return cached
  }

  const resolution = resolveDiscoveryIntrospectionOptions(provider.discovery)
  discoveryIntrospectionOptionsCache.set(provider, resolution)
  return resolution
}

async function resolveDiscoveryIntrospectionOptions(
  discovery: OAuth2DiscoveryOptions,
): Promise<OAuth2IntrospectionOptions | null> {
  const payload = await fetchOAuth2DiscoveryDocument({
    url: discovery.url,
    timeoutMs: discovery.timeoutMs,
    headers: discovery.headers,
  })

  const introspectionUrl = payload?.introspection_endpoint

  if (typeof introspectionUrl !== 'string' || introspectionUrl.trim().length === 0) {
    return null
  }

  return {
    url: introspectionUrl,
    clientId: discovery.clientId,
    clientSecret: discovery.clientSecret,
    timeoutMs: discovery.timeoutMs,
    headers: discovery.headers,
  }
}

function extractBearerToken(
  headerValue: string | string[] | undefined,
): string | null {
  const header = Array.isArray(headerValue) ? headerValue[0] : headerValue

  if (!header) {
    return null
  }

  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || null
}

function buildBasicAuthorizationHeader(
  clientId: string,
  clientSecret: string,
): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  return `Basic ${encoded}`
}

function parseScopes(scopeClaim: unknown): string[] {
  if (typeof scopeClaim !== 'string') {
    return []
  }

  return scopeClaim
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
}

function hasRequiredScopes(
  actualScopes: string[],
  requiredScopes: string[],
): boolean {
  if (requiredScopes.length === 0) {
    return true
  }

  const actualScopeSet = new Set(actualScopes)
  return requiredScopes.every((scope) => actualScopeSet.has(scope))
}

function resolveSubject(claims: OAuth2IntrospectionClaims): string | undefined {
  if (typeof claims.sub === 'string' && claims.sub.length > 0) {
    return claims.sub
  }

  if (typeof claims.username === 'string' && claims.username.length > 0) {
    return claims.username
  }

  if (typeof claims.client_id === 'string' && claims.client_id.length > 0) {
    return claims.client_id
  }

  return undefined
}

function isOAuth2IntrospectionClaims(
  value: unknown,
): value is OAuth2IntrospectionClaims {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAuthenticationContext(value: unknown): value is AuthenticationContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    (candidate.scheme === 'oauth2' || candidate.scheme === 'session') &&
    typeof candidate.provider === 'string' &&
    Array.isArray(candidate.scopes) &&
    typeof candidate.claims === 'object' &&
    candidate.claims !== null
  )
}
