export interface OAuth2DiscoveryDocument {
  issuer?: unknown
  authorization_endpoint?: unknown
  token_endpoint?: unknown
  userinfo_endpoint?: unknown
  introspection_endpoint?: unknown
}

export interface OAuth2DiscoveryDocumentOptions {
  url: string
  timeoutMs?: number
  headers?: Record<string, string>
}

const discoveryDocumentCache = new Map<
  string,
  Promise<OAuth2DiscoveryDocument | null>
>()

export function fetchOAuth2DiscoveryDocument(
  options: OAuth2DiscoveryDocumentOptions,
): Promise<OAuth2DiscoveryDocument | null> {
  const cacheKey = JSON.stringify({
    url: options.url,
    timeoutMs: options.timeoutMs ?? 5000,
    headers: options.headers ?? {},
  })

  const cached = discoveryDocumentCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const resolution = loadOAuth2DiscoveryDocument(options)
  discoveryDocumentCache.set(cacheKey, resolution)
  return resolution
}

async function loadOAuth2DiscoveryDocument(
  options: OAuth2DiscoveryDocumentOptions,
): Promise<OAuth2DiscoveryDocument | null> {
  const abortController = new AbortController()
  const timeoutMs = options.timeoutMs ?? 5000
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await fetch(options.url, {
      headers: {
        accept: 'application/json',
        ...options.headers,
      },
      signal: abortController.signal,
    })

    if (!response.ok) {
      return null
    }

    const payload = await response.json()

    if (!isOAuth2DiscoveryDocument(payload)) {
      return null
    }

    if (!hasMatchingIssuer(payload, options.url)) {
      return null
    }

    return payload
  } catch {
    return null
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function hasMatchingIssuer(
  payload: OAuth2DiscoveryDocument,
  discoveryUrl: string,
): boolean {
  if (typeof payload.issuer !== 'string' || payload.issuer.trim().length === 0) {
    return false
  }

  const expectedIssuer = deriveIssuerFromDiscoveryUrl(discoveryUrl)

  if (!expectedIssuer) {
    return true
  }

  return payload.issuer === expectedIssuer
}

function deriveIssuerFromDiscoveryUrl(discoveryUrl: string): string | null {
  const suffix = '/.well-known/openid-configuration'
  const url = new URL(discoveryUrl)
  const pathname = url.pathname

  if (pathname.endsWith(suffix)) {
    const issuerPath = pathname.slice(0, -suffix.length)
    return `${url.origin}${issuerPath}` || url.origin
  }

  const insertedSuffix = `${suffix}/`

  if (pathname.startsWith(insertedSuffix)) {
    return `${url.origin}${pathname.slice(suffix.length)}`
  }

  return null
}

function isOAuth2DiscoveryDocument(
  value: unknown,
): value is OAuth2DiscoveryDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
