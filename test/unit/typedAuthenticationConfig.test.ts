import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { configureApplication } from '#exjs-controllers/config/configureApplication'
import type { ExpressServerOptions } from '#exjs-controllers/config/expressServerOptions'
import type { AuthenticationConfig } from '#exjs-controllers/core/authentication/types'
import { _resetRoutesForTests } from '#exjs-controllers/core/Router'
import { Authorized } from '#exjs-controllers/decorators/Authorized'
import { JsonController } from '#exjs-controllers/decorators/Controller'
import { CurrentUser } from '#exjs-controllers/decorators/CurrentUser'
import { Get } from '#exjs-controllers/decorators/HttpMethod'
import { createApplication, type Application } from '#exjs-controllers/http/application'

interface User {
  id: string
  permissions: string[]
}

// Config tipado com o principal da aplicação, como no exemplo do README.
const authentication: AuthenticationConfig<User> = {
  currentUserChecker: ({ request }) =>
    request.headers.authorization === 'Bearer ok'
      ? { principal: { id: 'u1', permissions: ['items:read'] }, kind: 'user' }
      : null,
  authorizationChecker: (_action, user, _kind, required) =>
    required.every((permission) => user.permissions.includes(permission)),
  openApiSecuritySchemes: {
    bearerAuth: { scheme: { type: 'http', scheme: 'bearer' }, kinds: ['user'] },
  },
}

// Regressão de tipagem (verificada por `yarn typecheck`): um
// AuthenticationConfig<User> precisa ser atribuível à opção `authentication`
// sem cast. Antes, `principal: TPrincipal` como propriedade de função era
// contravariante e isto não compilava.
const options: Pick<ExpressServerOptions, 'authentication'> = { authentication }

@JsonController('/me')
class MeController {
  @Authorized('items:read')
  @Get('/')
  me(@CurrentUser() user: User) {
    return { id: user.id }
  }
}

let app: Application | undefined
let baseUrl = ''

beforeEach(async () => {
  _resetRoutesForTests()
  app = createApplication()
  await configureApplication(app, {
    controllers: [MeController],
    logger: false,
    ...options,
    errorHandler: (error: any, _request, response, _next) => {
      response.status(error.status ?? 500).json({ name: error.name })
    },
  })

  const started = app
  await new Promise<void>((resolve) => started.listen(0, resolve))
  const address = started.address()
  if (!address || typeof address === 'string') throw new Error('Servidor de teste sem porta TCP')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  if (!app) return
  const current = app
  app = undefined
  await new Promise<void>((resolve) => current.close(() => resolve()))
})

describe('AuthenticationConfig<TPrincipal> in configureApplication', () => {
  it('rejects anonymous callers', async () => {
    const response = await fetch(`${baseUrl}/me`)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ name: 'UnauthorizedError' })
  })

  it('resolves the typed principal and injects it with @CurrentUser', async () => {
    const response = await fetch(`${baseUrl}/me`, { headers: { authorization: 'Bearer ok' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'u1' })
  })
})
