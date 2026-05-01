import { ensureHttpContext, type Handler } from '#exjs-controllers/http/httpTypes'

export function createCookieMiddleware(): Handler {
  return (request, response, next) => {
    const ctx = ensureHttpContext(request, response)
    const cookieHeader = request.headers.cookie

    ctx.request.cookies = parseCookieHeader(cookieHeader)
    next()
  }
}

function parseCookieHeader(
  cookieHeader: string | string[] | undefined,
): Record<string, string> {
  const source = Array.isArray(cookieHeader)
    ? cookieHeader.join(';')
    : cookieHeader

  if (!source) {
    return {}
  }

  const cookies: Record<string, string> = {}

  for (const chunk of source.split(';')) {
    const separatorIndex = chunk.indexOf('=')

    if (separatorIndex <= 0) {
      continue
    }

    const rawName = chunk.slice(0, separatorIndex).trim()
    const rawValue = chunk.slice(separatorIndex + 1).trim()

    if (!rawName) {
      continue
    }

    cookies[rawName] = safeDecodeURIComponent(rawValue)
  }

  return cookies
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}