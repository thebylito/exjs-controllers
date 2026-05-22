import { describe, it, expect, beforeEach } from 'vitest'
import { CurrentUser, CurrentApiKey } from '#exjs-controllers/decorators/CurrentUser'
import { legacyParamMap } from '#exjs-controllers/metadata/legacyStorage'

describe('@CurrentUser', () => {
  beforeEach(() => {
    // Vitest isola modules; sem estado global a limpar.
  })

  it('registers a current-user param without optional flag (default required)', () => {
    class Controller {
      handler(@CurrentUser() _user: unknown) {}
    }

    const proto = Controller.prototype
    const params = legacyParamMap.get(proto)?.get('handler')

    expect(params).toBeDefined()
    expect(params!.length).toBe(1)
    expect(params![0]).toMatchObject({
      index: 0,
      type: 'current-user',
      optional: undefined,
    })
  })

  it('registers optional: true when passed', () => {
    class Controller {
      handler(@CurrentUser({ optional: true }) _user: unknown) {}
    }

    const proto = Controller.prototype
    const params = legacyParamMap.get(proto)?.get('handler')
    expect(params![0].optional).toBe(true)
  })
})

describe('@CurrentApiKey', () => {
  it('registers a current-api-key param', () => {
    class Controller {
      handler(@CurrentApiKey() _apiKey: unknown) {}
    }

    const proto = Controller.prototype
    const params = legacyParamMap.get(proto)?.get('handler')

    expect(params![0]).toMatchObject({
      index: 0,
      type: 'current-api-key',
      optional: undefined,
    })
  })

  it('registers optional: true when passed', () => {
    class Controller {
      handler(@CurrentApiKey({ optional: true }) _apiKey: unknown) {}
    }

    const proto = Controller.prototype
    const params = legacyParamMap.get(proto)?.get('handler')
    expect(params![0].optional).toBe(true)
  })
})
