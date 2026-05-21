# Auth/Authz Redesign — Lib Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o acoplamento atual da `exjs-controllers` a OAuth2 por um par de hooks agnósticos (`currentUserChecker` + `authorizationChecker`) configuráveis no bootstrap, com decorators de principal kind-tipados (`@CurrentUser`, `@CurrentApiKey`) e erros HTTP tipados pela lib.

**Architecture:** Single-`authentication` config em `ExpressServerOptions`. Resolução em duas fases: Fase A (middleware) chama o checker, valida `@Authorized` e anexa `ResolvedPrincipal` à request; Fase B (`resolveArgs`) injeta o principal nos parâmetros validando kind. OAuth2 e `BaseEntity` saem da lib (consumidor migra em plano separado).

**Tech Stack:** TypeScript, Express 5, Zod, Vitest (a ser adicionado), `@scalar/express-api-reference`, OpenAPI 3.1.

**Spec:** `docs/superpowers/specs/2026-05-19-auth-strategies-redesign-design.md` (commit `acd69c6`).

---

## File Structure

### Files to create

| Caminho                                  | Responsabilidade                                                  |
|------------------------------------------|--------------------------------------------------------------------|
| `vitest.config.ts`                        | Configuração do Vitest                                             |
| `test/unit/.gitkeep`                      | Manter pasta versionada                                            |
| `core/authentication/types.ts`            | `AuthenticationConfig`, `ResolvedPrincipal`, `PrincipalKind`, `Action`, `OpenAPISecurityScheme`, `OpenApiSecuritySchemeEntry`, `ScalarSecurityConfig` |
| `core/authentication/errors.ts`           | `UnauthorizedError`, `ForbiddenError`                              |
| `core/authentication/middleware.ts`       | `createAuthenticationMiddleware` (Fase A do algoritmo)              |
| `core/authentication/index.ts`            | Re-exports do pacote `authentication`                              |
| `decorators/CurrentUser.ts`               | `@CurrentUser`, `@CurrentApiKey`, `PrincipalDecoratorOptions`     |
| `test/unit/errors.test.ts`                | Testes para `UnauthorizedError` / `ForbiddenError`                  |
| `test/unit/CurrentUser.test.ts`           | Testes para os decorators de principal                              |
| `test/unit/Authorized.test.ts`            | Testes para o decorator `@Authorized`                              |
| `test/unit/authMiddleware.test.ts`        | Testes para o middleware da Fase A                                  |
| `test/unit/openApi.test.ts`               | Testes para geração de OpenAPI                                     |

### Files to modify

| Caminho                                  | Mudança principal                                                  |
|------------------------------------------|--------------------------------------------------------------------|
| `package.json`                            | Adicionar `vitest` em devDependencies + script `test`              |
| `metadata/symbols.ts`                     | `AuthorizationMetadata`: rename `requiredScopes` → `permissions`; add `kinds?` |
| `metadata/legacyStorage.ts`               | `ParamType`: remove `'session-context'`; add `'current-user'`, `'current-api-key'`. `ParamMetadata`: add `optional?: boolean` |
| `decorators/Authorized.ts`                | Overload: `(...permissions)` ou `(options: AuthorizationOptions)` |
| `decorators/Params.ts`                    | Remover `@SessionContext()` e `export type SessionContext`         |
| `config/expressServerOptions.ts`          | `authentication?: OAuth2AuthenticationOptions` → `authentication?: AuthenticationConfig` |
| `config/configureApplication.ts`          | Remover bloco hardcoded de Scalar OAuth2; encaminhar `authentication.scalarSecurityConfig` |
| `openapi/generateOpenApiDocument.ts`      | `components.securitySchemes` e per-route `security` derivam de `openApiSecuritySchemes` |
| `core/Router.ts`                          | `resolveAuthenticationHandler` chama o novo middleware; `resolveArgs` ganha 2 cases novos |
| `index.ts`                                | Trocar exports                                                     |
| `CHANGELOG.md`                            | Documentar breaking changes                                        |

### Files to delete

- `authentication/oauth2.ts`
- `authentication/oauth2Discovery.ts`
- `authentication/` (diretório, se vazio depois)
- `entities/BaseEntity.ts`
- `entities/` (diretório, se vazio depois)

---

## Tasks

### Task 1: Adicionar Vitest ao repo da lib

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `test/unit/.gitkeep`

- [ ] **Step 1: Adicionar vitest como devDependency**

Run:
```bash
yarn add -D vitest@^4.0.0
```

Expected: `vitest` aparece em `devDependencies` no `package.json`.

- [ ] **Step 2: Adicionar script `test` em `package.json`**

No bloco `scripts`, adicionar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Criar `vitest.config.ts` na raiz**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 4: Criar pasta `test/unit/` com `.gitkeep`**

```bash
mkdir -p test/unit
touch test/unit/.gitkeep
```

- [ ] **Step 5: Verificar que `yarn test` roda sem erro (sem testes ainda)**

Run:
```bash
yarn test
```

Expected: Vitest reporta "No test files found" mas exit code 0. (Se Vitest falhar com exit não-zero em "no tests", ajustar config com `passWithNoTests: true`.)

- [ ] **Step 6: Commit**

```bash
git add package.json yarn.lock vitest.config.ts test/unit/.gitkeep
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: Criar tipos públicos de autenticação

**Files:**
- Create: `core/authentication/types.ts`

- [ ] **Step 1: Criar `core/authentication/types.ts`**

```ts
import type { Request, Response } from 'express'

export type PrincipalKind = 'user' | 'api-key'

export type Action = {
  request: Request
  response: Response
}

// OpenAPI 3.1 SecuritySchemeObject (forma estrutural; a tipagem completa
// é responsabilidade do consumidor que monta o objeto).
export type OpenAPISecurityScheme = Record<string, unknown>

export type ScalarSecurityConfig = Record<string, unknown>

export type ResolvedPrincipal<TPrincipal = unknown> = {
  principal: TPrincipal
  kind: PrincipalKind
}

export type OpenApiSecuritySchemeEntry = {
  scheme: OpenAPISecurityScheme
  /**
   * Quais kinds este scheme documenta. Usado para derivar o `security` por
   * rota filtrando schemes compatíveis com os kinds aceitos pela rota.
   * Se omitido, o scheme cobre todos os kinds.
   */
  kinds?: PrincipalKind[]
}

export type AuthenticationConfig<TPrincipal = unknown> = {
  currentUserChecker: (
    action: Action,
  ) =>
    | Promise<ResolvedPrincipal<TPrincipal> | null | undefined>
    | ResolvedPrincipal<TPrincipal>
    | null
    | undefined

  authorizationChecker: (
    action: Action,
    principal: TPrincipal,
    kind: PrincipalKind,
    requiredPermissions: string[],
  ) => Promise<boolean> | boolean

  openApiSecuritySchemes: Record<string, OpenApiSecuritySchemeEntry>
  scalarSecurityConfig?: ScalarSecurityConfig
}
```

- [ ] **Step 2: Verificar que o arquivo compila**

Run:
```bash
yarn tsc --noEmit
```

Expected: Sem erros. Se houver erro de `Request`/`Response` do Express, garantir que `@types/express` ainda está em devDependencies (já está, do estado atual do repo).

- [ ] **Step 3: Commit**

```bash
git add core/authentication/types.ts
git commit -m "feat(auth): introduce AuthenticationConfig and ResolvedPrincipal types"
```

---

### Task 3: Criar erros tipados (`UnauthorizedError`, `ForbiddenError`) com testes

**Files:**
- Create: `core/authentication/errors.ts`
- Create: `test/unit/errors.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

`test/unit/errors.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  UnauthorizedError,
  ForbiddenError,
} from '#exjs-controllers/core/authentication/errors'

describe('UnauthorizedError', () => {
  it('default message and status 401', () => {
    const err = new UnauthorizedError()
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(401)
    expect(err.name).toBe('UnauthorizedError')
    expect(err.message).toBe('Unauthorized')
  })

  it('preserves cause', () => {
    const cause = new Error('token expired')
    const err = new UnauthorizedError('custom', { cause })
    expect(err.message).toBe('custom')
    expect(err.cause).toBe(cause)
  })
})

describe('ForbiddenError', () => {
  it('default message and status 403', () => {
    const err = new ForbiddenError()
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(403)
    expect(err.name).toBe('ForbiddenError')
    expect(err.message).toBe('Forbidden')
  })

  it('preserves cause', () => {
    const cause = new Error('insufficient scope')
    const err = new ForbiddenError('denied', { cause })
    expect(err.message).toBe('denied')
    expect(err.cause).toBe(cause)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run:
```bash
yarn test test/unit/errors.test.ts
```

Expected: FAIL com erro de import (módulo `errors` não existe).

- [ ] **Step 3: Implementar os erros**

`core/authentication/errors.ts`:
```ts
export class UnauthorizedError extends Error {
  readonly status = 401

  constructor(message: string = 'Unauthorized', options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly status = 403

  constructor(message: string = 'Forbidden', options?: { cause?: unknown }) {
    super(message, options as ErrorOptions | undefined)
    this.name = 'ForbiddenError'
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run:
```bash
yarn test test/unit/errors.test.ts
```

Expected: PASS, 4 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add core/authentication/errors.ts test/unit/errors.test.ts
git commit -m "feat(auth): add UnauthorizedError and ForbiddenError"
```

---

### Task 4: Atualizar metadata (`symbols.ts` + `legacyStorage.ts`)

**Files:**
- Modify: `metadata/symbols.ts`
- Modify: `metadata/legacyStorage.ts`

> Nota: nenhum consumidor referencia diretamente o shape de `AuthorizationMetadata` por fora dos decorators, então a mudança é interna. O rename `requiredScopes` → `permissions` é breaking mas em código interno da lib.

- [ ] **Step 1: Modificar `AuthorizationMetadata` em `metadata/symbols.ts`**

Substituir:
```ts
export interface AuthorizationMetadata {
  requiredScopes: string[]
}
```

por:
```ts
import type { PrincipalKind } from '#exjs-controllers/core/authentication/types'

export interface AuthorizationMetadata {
  permissions: string[]
  kinds?: PrincipalKind[]
}
```

- [ ] **Step 2: Atualizar `ParamType` em `metadata/legacyStorage.ts`**

Substituir:
```ts
export type ParamType =
  | 'body'
  | 'param'
  | 'query'
  | 'query-all'
  | 'header'
  | 'req'
  | 'res'
  | 'session-context'

export interface ParamMetadata {
  index: number
  type: ParamType
  name?: string
  schemaClass?: new (...args: any[]) => object
}
```

por:
```ts
export type ParamType =
  | 'body'
  | 'param'
  | 'query'
  | 'query-all'
  | 'header'
  | 'req'
  | 'res'
  | 'current-user'
  | 'current-api-key'

export interface ParamMetadata {
  index: number
  type: ParamType
  name?: string
  schemaClass?: new (...args: any[]) => object
  optional?: boolean
}
```

- [ ] **Step 3: Verificar que compila (vai falhar em arquivos que ainda usam o shape antigo — esperado nesta fase)**

Run:
```bash
yarn tsc --noEmit
```

Expected: Erros em `decorators/Authorized.ts` (usa `requiredScopes`), `core/Router.ts` (usa `'session-context'`). Esses serão corrigidos nas tasks seguintes.

- [ ] **Step 4: Commit (mesmo com TS quebrando — vamos consertar nas próximas tasks)**

```bash
git add metadata/symbols.ts metadata/legacyStorage.ts
git commit -m "refactor(auth): rename requiredScopes to permissions, add kinds and param types"
```

---

### Task 5: Criar `decorators/CurrentUser.ts` com `@CurrentUser` (TDD)

**Files:**
- Create: `decorators/CurrentUser.ts`
- Create: `test/unit/CurrentUser.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

`test/unit/CurrentUser.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { CurrentUser } from '#exjs-controllers/decorators/CurrentUser'
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run:
```bash
yarn test test/unit/CurrentUser.test.ts
```

Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `decorators/CurrentUser.ts`**

```ts
import {
  legacyParamMap,
  type ParamMetadata,
  type ParamType,
} from '#exjs-controllers/metadata/legacyStorage'

export type PrincipalDecoratorOptions = { optional?: boolean }

function createPrincipalDecorator(type: ParamType) {
  return function (options?: PrincipalDecoratorOptions) {
    return function (
      target: object,
      propertyKey: string,
      parameterIndex: number,
    ): void {
      if (!legacyParamMap.has(target)) {
        legacyParamMap.set(target, new Map())
      }
      const methodMap = legacyParamMap.get(target)!
      if (!methodMap.has(propertyKey)) {
        methodMap.set(propertyKey, [])
      }

      const entry: ParamMetadata = {
        index: parameterIndex,
        type,
        optional: options?.optional,
      }
      methodMap.get(propertyKey)!.push(entry)
    }
  }
}

export const CurrentUser = createPrincipalDecorator('current-user')
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run:
```bash
yarn test test/unit/CurrentUser.test.ts
```

Expected: PASS, 2 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add decorators/CurrentUser.ts test/unit/CurrentUser.test.ts
git commit -m "feat(auth): add @CurrentUser decorator"
```

---

### Task 6: Adicionar `@CurrentApiKey` em `decorators/CurrentUser.ts` (TDD)

**Files:**
- Modify: `decorators/CurrentUser.ts`
- Modify: `test/unit/CurrentUser.test.ts`

- [ ] **Step 1: Adicionar testes para `@CurrentApiKey`**

Append em `test/unit/CurrentUser.test.ts`:
```ts
import { CurrentApiKey } from '#exjs-controllers/decorators/CurrentUser'

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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run:
```bash
yarn test test/unit/CurrentUser.test.ts
```

Expected: FAIL (`CurrentApiKey` não exportado).

- [ ] **Step 3: Adicionar export em `decorators/CurrentUser.ts`**

Append:
```ts
export const CurrentApiKey = createPrincipalDecorator('current-api-key')
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run:
```bash
yarn test test/unit/CurrentUser.test.ts
```

Expected: PASS, 4 testes verdes (os 2 anteriores + 2 novos).

- [ ] **Step 5: Commit**

```bash
git add decorators/CurrentUser.ts test/unit/CurrentUser.test.ts
git commit -m "feat(auth): add @CurrentApiKey decorator"
```

---

### Task 7: Refatorar `@Authorized` (forma curta + forma objeto) (TDD)

**Files:**
- Modify: `decorators/Authorized.ts`
- Create: `test/unit/Authorized.test.ts`

- [ ] **Step 1: Escrever testes**

`test/unit/Authorized.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Authorized } from '#exjs-controllers/decorators/Authorized'
import {
  AUTHORIZATION_METADATA,
  type AuthorizationMetadata,
} from '#exjs-controllers/metadata/symbols'
import { legacyAuthorizationMap } from '#exjs-controllers/metadata/legacyStorage'

function getLegacyAuth(target: object, handlerName: string): AuthorizationMetadata | undefined {
  return legacyAuthorizationMap.get(target)?.get(handlerName)
}

describe('@Authorized', () => {
  it('short form stores permissions array', () => {
    class C {
      @Authorized('posts:read', 'posts:write')
      handler() {}
    }
    const meta = getLegacyAuth(C.prototype, 'handler')
    expect(meta).toEqual({ permissions: ['posts:read', 'posts:write'] })
  })

  it('object form stores permissions and kinds', () => {
    class C {
      @Authorized({ permissions: ['posts:read'], kinds: ['user'] })
      handler() {}
    }
    const meta = getLegacyAuth(C.prototype, 'handler')
    expect(meta).toEqual({ permissions: ['posts:read'], kinds: ['user'] })
  })

  it('object form without permissions defaults to empty array', () => {
    class C {
      @Authorized({ kinds: ['api-key'] })
      handler() {}
    }
    const meta = getLegacyAuth(C.prototype, 'handler')
    expect(meta).toEqual({ permissions: [], kinds: ['api-key'] })
  })

  it('short form with no arguments stores empty permissions', () => {
    class C {
      @Authorized()
      handler() {}
    }
    const meta = getLegacyAuth(C.prototype, 'handler')
    expect(meta).toEqual({ permissions: [] })
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run:
```bash
yarn test test/unit/Authorized.test.ts
```

Expected: FAIL — `permissions` é `undefined`, hoje a metadata tem `requiredScopes`.

- [ ] **Step 3: Refatorar `decorators/Authorized.ts`**

Substituir conteúdo inteiro de `decorators/Authorized.ts`:
```ts
import {
  AUTHORIZATION_METADATA,
  type AuthorizationMetadata,
} from '#exjs-controllers/metadata/symbols'
import { legacyAuthorizationMap } from '#exjs-controllers/metadata/legacyStorage'
import type { PrincipalKind } from '#exjs-controllers/core/authentication/types'

export type AuthorizationOptions = {
  permissions?: string[]
  kinds?: PrincipalKind[]
}

type DecoratedMethod = (this: object, ...args: unknown[]) => unknown

function isAuthorizationOptions(value: unknown): value is AuthorizationOptions {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function Authorized(...permissions: string[]): MethodDecorator
export function Authorized(options: AuthorizationOptions): MethodDecorator
export function Authorized(
  ...args: [AuthorizationOptions] | string[]
): MethodDecorator {
  const authorization: AuthorizationMetadata =
    args.length === 1 && isAuthorizationOptions(args[0])
      ? {
          permissions: args[0].permissions ?? [],
          ...(args[0].kinds ? { kinds: args[0].kinds } : {}),
        }
      : { permissions: args as string[] }

  return function (
    valueOrTarget: DecoratedMethod | object,
    ctxOrKey: ClassMethodDecoratorContext<object, DecoratedMethod> | string | symbol,
    _descriptor?: PropertyDescriptor,
  ): void {
    if (isStandardMethodDecoratorContext(ctxOrKey)) {
      const metadata = ctxOrKey.metadata as Record<symbol, unknown>
      const authorizationMap =
        (metadata[AUTHORIZATION_METADATA] as
          | Map<string | symbol, AuthorizationMetadata>
          | undefined) ?? new Map<string | symbol, AuthorizationMetadata>()
      authorizationMap.set(ctxOrKey.name, authorization)
      metadata[AUTHORIZATION_METADATA] = authorizationMap
      return
    }

    const target = valueOrTarget as object
    const authorizationMap =
      legacyAuthorizationMap.get(target) ??
      new Map<string | symbol, AuthorizationMetadata>()
    authorizationMap.set(ctxOrKey as string | symbol, authorization)
    legacyAuthorizationMap.set(target, authorizationMap)
  }
}

function isStandardMethodDecoratorContext(
  value: ClassMethodDecoratorContext<object, DecoratedMethod> | string | symbol,
): value is ClassMethodDecoratorContext<object, DecoratedMethod> {
  return typeof value === 'object' && value !== null && 'kind' in value
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run:
```bash
yarn test test/unit/Authorized.test.ts
```

Expected: PASS, 4 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add decorators/Authorized.ts test/unit/Authorized.test.ts
git commit -m "feat(auth): @Authorized accepts permissions and kinds options"
```

---

### Task 8: Remover `@SessionContext` de `decorators/Params.ts`

**Files:**
- Modify: `decorators/Params.ts`

- [ ] **Step 1: Editar `decorators/Params.ts`**

Substituir o arquivo inteiro por:
```ts
import { legacyParamMap, type ParamType, type ParamMetadata } from '#exjs-controllers/metadata/legacyStorage'

function createParamDecorator(
  type: ParamType,
  name?: string,
  schemaClass?: new (...args: any[]) => object,
) {
  return function (target: object, propertyKey: string, parameterIndex: number): void {
    if (!legacyParamMap.has(target)) {
      legacyParamMap.set(target, new Map())
    }

    const methodMap = legacyParamMap.get(target)!
    if (!methodMap.has(propertyKey)) {
      methodMap.set(propertyKey, [])
    }

    const entry: ParamMetadata = { index: parameterIndex, type, name, schemaClass }
    methodMap.get(propertyKey)!.push(entry)
  }
}

export function Body(schemaClass?: new (...args: any[]) => object) {
  return createParamDecorator('body', undefined, schemaClass)
}

export function Param(name: string) {
  return createParamDecorator('param', name)
}

export function QueryParam(name: string) {
  return createParamDecorator('query', name)
}

export function QueryParams() {
  return createParamDecorator('query-all')
}

export function HeaderParam(name: string) {
  return createParamDecorator('header', name)
}

export function Req() {
  return createParamDecorator('req')
}

export function Res() {
  return createParamDecorator('res')
}
```

- [ ] **Step 2: Verificar que TS reclama de `core/Router.ts` ainda usando `'session-context'` (esperado, será corrigido na Task 14)**

Run:
```bash
yarn tsc --noEmit 2>&1 | grep -E "session-context|SessionContext|RequiredSessionContextError" | head -20
```

Expected: Erros em `core/Router.ts` e em `authentication/oauth2.ts`. Sem novos erros fora desses dois.

- [ ] **Step 3: Commit**

```bash
git add decorators/Params.ts
git commit -m "refactor(auth): remove @SessionContext decorator and type"
```

---

### Task 9: Middleware Fase A — happy path (principal resolvido, autorizado) (TDD)

**Files:**
- Create: `core/authentication/middleware.ts`
- Create: `core/authentication/index.ts`
- Create: `test/unit/authMiddleware.test.ts`

- [ ] **Step 1: Escrever teste happy path**

`test/unit/authMiddleware.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { createAuthenticationMiddleware } from '#exjs-controllers/core/authentication/middleware'
import type { AuthenticationConfig } from '#exjs-controllers/core/authentication/types'

function mockReqRes() {
  const request = { headers: {} } as any
  const response = { status: vi.fn(), json: vi.fn() } as any
  const next = vi.fn()
  return { request, response, next }
}

describe('createAuthenticationMiddleware — happy path', () => {
  it('resolves principal, runs authorizationChecker, attaches resolved and calls next()', async () => {
    const principal = { id: 'u1' }
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({ principal, kind: 'user' }),
      authorizationChecker: vi.fn().mockResolvedValue(true),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: ['posts:read'],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })

    const { request, response, next } = mockReqRes()
    await middleware(request, response, next)

    expect(config.currentUserChecker).toHaveBeenCalledWith({ request, response })
    expect(config.authorizationChecker).toHaveBeenCalledWith(
      { request, response }, principal, 'user', ['posts:read'],
    )
    expect(request.__resolvedPrincipal).toEqual({ principal, kind: 'user' })
    expect(next).toHaveBeenCalledWith()  // sem erro
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run:
```bash
yarn test test/unit/authMiddleware.test.ts
```

Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `core/authentication/middleware.ts` (mínimo pra passar happy path)**

```ts
import type { Request, Response, NextFunction } from 'express'
import type {
  Action,
  AuthenticationConfig,
  PrincipalKind,
  ResolvedPrincipal,
} from '#exjs-controllers/core/authentication/types'
import {
  UnauthorizedError,
  ForbiddenError,
} from '#exjs-controllers/core/authentication/errors'

export const RESOLVED_PRINCIPAL_KEY = '__resolvedPrincipal' as const

export type AuthenticationMiddlewareOptions = {
  authentication: AuthenticationConfig
  requiredPermissions: string[]
  allowedKinds: PrincipalKind[] | undefined
  hasAuthorizedDecorator: boolean
}

export function createAuthenticationMiddleware(
  options: AuthenticationMiddlewareOptions,
) {
  const {
    authentication,
    requiredPermissions,
    allowedKinds,
    hasAuthorizedDecorator,
  } = options

  return async function authenticationMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const action: Action = { request, response }

    let resolved: ResolvedPrincipal | null | undefined
    try {
      resolved = await authentication.currentUserChecker(action)
    } catch (err) {
      return next(
        new UnauthorizedError(
          err instanceof Error ? err.message : 'Unauthorized',
          { cause: err },
        ),
      )
    }

    if (resolved == null) {
      if (hasAuthorizedDecorator) {
        return next(new UnauthorizedError())
      }
      return next()
    }

    if (allowedKinds && !allowedKinds.includes(resolved.kind)) {
      return next(new ForbiddenError())
    }

    const authorized = await authentication.authorizationChecker(
      action,
      resolved.principal,
      resolved.kind,
      requiredPermissions,
    )
    if (authorized !== true) {
      return next(new ForbiddenError())
    }

    ;(request as any)[RESOLVED_PRINCIPAL_KEY] = resolved
    next()
  }
}
```

- [ ] **Step 4: Criar `core/authentication/index.ts`**

```ts
export * from '#exjs-controllers/core/authentication/types'
export * from '#exjs-controllers/core/authentication/errors'
export * from '#exjs-controllers/core/authentication/middleware'
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run:
```bash
yarn test test/unit/authMiddleware.test.ts
```

Expected: PASS, 1 teste verde.

- [ ] **Step 6: Commit**

```bash
git add core/authentication/middleware.ts core/authentication/index.ts test/unit/authMiddleware.test.ts
git commit -m "feat(auth): middleware Phase A — happy path"
```

---

### Task 10: Middleware — sem principal resolvido (com/sem `@Authorized`)

**Files:**
- Modify: `test/unit/authMiddleware.test.ts`

- [ ] **Step 1: Adicionar testes**

Append em `test/unit/authMiddleware.test.ts`:
```ts
import { UnauthorizedError } from '#exjs-controllers/core/authentication/errors'

describe('createAuthenticationMiddleware — no principal resolved', () => {
  it('throws UnauthorizedError when checker returns null and @Authorized is present', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue(null),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError)
    expect(config.authorizationChecker).not.toHaveBeenCalled()
  })

  it('calls next() (no error) when checker returns null and no @Authorized', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue(null),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: undefined,
      hasAuthorizedDecorator: false,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next).toHaveBeenCalledWith()
    expect(config.authorizationChecker).not.toHaveBeenCalled()
  })

  it('treats undefined like null', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue(undefined),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()
    await middleware(request, response, next)
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que passa (implementação da Task 9 já cobre esses casos)**

Run:
```bash
yarn test test/unit/authMiddleware.test.ts
```

Expected: PASS, 4 testes verdes (1 happy path + 3 novos).

- [ ] **Step 3: Commit**

```bash
git add test/unit/authMiddleware.test.ts
git commit -m "test(auth): cover no-principal-resolved branches"
```

---

### Task 11: Middleware — restrição de kind

**Files:**
- Modify: `test/unit/authMiddleware.test.ts`

- [ ] **Step 1: Adicionar testes**

Append em `test/unit/authMiddleware.test.ts`:
```ts
import { ForbiddenError } from '#exjs-controllers/core/authentication/errors'

describe('createAuthenticationMiddleware — kind restriction', () => {
  it('throws ForbiddenError when kind not in allowedKinds', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({
        principal: { id: 'svc1' },
        kind: 'api-key',
      }),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: ['user'],
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError)
    expect(config.authorizationChecker).not.toHaveBeenCalled()
  })

  it('allows kind when allowedKinds includes it', async () => {
    const principal = { id: 'u1' }
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({ principal, kind: 'user' }),
      authorizationChecker: vi.fn().mockResolvedValue(true),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: ['user', 'api-key'],
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next).toHaveBeenCalledWith()
    expect(config.authorizationChecker).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run:
```bash
yarn test test/unit/authMiddleware.test.ts
```

Expected: PASS, 6 testes verdes.

- [ ] **Step 3: Commit**

```bash
git add test/unit/authMiddleware.test.ts
git commit -m "test(auth): cover allowedKinds branches"
```

---

### Task 12: Middleware — autorização negada

**Files:**
- Modify: `test/unit/authMiddleware.test.ts`

- [ ] **Step 1: Adicionar testes**

Append em `test/unit/authMiddleware.test.ts`:
```ts
describe('createAuthenticationMiddleware — authorization denied', () => {
  it('throws ForbiddenError when authorizationChecker returns false', async () => {
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({
        principal: { id: 'u1' },
        kind: 'user',
      }),
      authorizationChecker: vi.fn().mockResolvedValue(false),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: ['posts:write'],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(next.mock.calls[0][0]).toBeInstanceOf(ForbiddenError)
  })

  it('passes requiredPermissions to authorizationChecker', async () => {
    const principal = { id: 'u1' }
    const checker = vi.fn().mockResolvedValue(true)
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockResolvedValue({ principal, kind: 'user' }),
      authorizationChecker: checker,
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: ['a', 'b'],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    expect(checker).toHaveBeenCalledWith(
      { request, response }, principal, 'user', ['a', 'b'],
    )
  })
})
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run:
```bash
yarn test test/unit/authMiddleware.test.ts
```

Expected: PASS, 8 testes verdes.

- [ ] **Step 3: Commit**

```bash
git add test/unit/authMiddleware.test.ts
git commit -m "test(auth): cover authorization-denied branches"
```

---

### Task 13: Middleware — checker lança erro

**Files:**
- Modify: `test/unit/authMiddleware.test.ts`

- [ ] **Step 1: Adicionar testes**

Append em `test/unit/authMiddleware.test.ts`:
```ts
describe('createAuthenticationMiddleware — checker throws', () => {
  it('wraps thrown error in UnauthorizedError with cause preserved', async () => {
    const cause = new Error('token expired')
    const config: AuthenticationConfig = {
      currentUserChecker: vi.fn().mockRejectedValue(cause),
      authorizationChecker: vi.fn(),
      openApiSecuritySchemes: {},
    }
    const middleware = createAuthenticationMiddleware({
      authentication: config,
      requiredPermissions: [],
      allowedKinds: undefined,
      hasAuthorizedDecorator: true,
    })
    const { request, response, next } = mockReqRes()

    await middleware(request, response, next)

    const passedErr = next.mock.calls[0][0]
    expect(passedErr).toBeInstanceOf(UnauthorizedError)
    expect(passedErr.message).toBe('token expired')
    expect((passedErr as any).cause).toBe(cause)
    expect(config.authorizationChecker).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run:
```bash
yarn test test/unit/authMiddleware.test.ts
```

Expected: PASS, 9 testes verdes.

- [ ] **Step 3: Commit**

```bash
git add test/unit/authMiddleware.test.ts
git commit -m "test(auth): cover checker-throws branch"
```

---

### Task 14: Integrar middleware no `core/Router.ts`

**Files:**
- Modify: `core/Router.ts`

> Nesta task o `core/Router.ts` deixa de importar OAuth2 e passa a usar o middleware novo. O cleanup do `authentication/oauth2*` em si fica na Task 18.

- [ ] **Step 1: Substituir os imports do topo de `core/Router.ts`**

Substituir as linhas 1-2:
```ts
import { createOAuth2AuthenticationMiddleware } from '#exjs-controllers/authentication/oauth2'
import { getAuthenticationContext } from '#exjs-controllers/authentication/oauth2'
```

por:
```ts
import {
  createAuthenticationMiddleware,
  RESOLVED_PRINCIPAL_KEY,
} from '#exjs-controllers/core/authentication/middleware'
import {
  UnauthorizedError,
  ForbiddenError,
} from '#exjs-controllers/core/authentication/errors'
import type { ResolvedPrincipal } from '#exjs-controllers/core/authentication/types'
```

- [ ] **Step 2: Remover a classe `RequiredSessionContextError`**

Deletar as linhas (em torno de 26-33 no estado original):
```ts
class RequiredSessionContextError extends Error {
  readonly statusCode = 401

  constructor() {
    super('Authenticated session context is required for @SessionContext().')
    this.name = 'RequiredSessionContextError'
  }
}
```

- [ ] **Step 3: Substituir `resolveAuthenticationHandler` por versão nova**

A função `resolveAuthenticationHandler` atual (linhas ~288-312) é substituída por:

```ts
function resolveAuthenticationHandler(
  instance: object,
  handlerName: string | symbol,
  controllerDecoratorMetadata: DecoratorMetadata | undefined,
  serverOptions: ExpressServerOptions | undefined,
  handlerParams: ParamMetadata[],
): Handler | undefined {
  const authorization =
    getAuthorizationFromMeta(controllerDecoratorMetadata, handlerName) ??
    legacyAuthorizationMap.get(Object.getPrototypeOf(instance))?.get(handlerName)

  const principalParams = handlerParams.filter(
    p => p.type === 'current-user' || p.type === 'current-api-key',
  )
  const hasPrincipalDecorator = principalParams.length > 0
  const hasAuthorizedDecorator = authorization !== undefined

  if (!hasAuthorizedDecorator && !hasPrincipalDecorator) {
    return undefined
  }

  if (!serverOptions?.authentication) {
    throw new Error(
      `[Authentication] A rota protegida ${instance.constructor.name}.${String(handlerName)} exige authentication config no bootstrap.`,
    )
  }

  return createAuthenticationMiddleware({
    authentication: serverOptions.authentication,
    requiredPermissions: authorization?.permissions ?? [],
    allowedKinds: authorization?.kinds,
    hasAuthorizedDecorator,
  })
}
```

- [ ] **Step 4: Atualizar a chamada de `resolveAuthenticationHandler` em `registerRoute`**

Buscar a chamada (em torno da linha 121-126 do arquivo original) e passar `handlerParams`:

```ts
const authenticationHandler = resolveAuthenticationHandler(
  instance,
  route.handlerName,
  controllerDecoratorMetadata,
  serverOptions,
  handlerParams,   // <— novo argumento
)
```

- [ ] **Step 5: Substituir o case `'session-context'` em `resolveArgs` por 2 novos**

A função `resolveArgs` (na altura das linhas 209-260): substituir o case `'session-context'` por:

```ts
case 'current-user':
case 'current-api-key': {
  const attached = (request as any)[RESOLVED_PRINCIPAL_KEY] as
    | ResolvedPrincipal
    | undefined
  const expectedKind = p.type === 'current-user' ? 'user' : 'api-key'

  if (!attached) {
    if (p.optional === true) {
      args[p.index] = undefined
      break
    }
    throw new UnauthorizedError()
  }

  if (attached.kind !== expectedKind) {
    if (p.optional === true) {
      args[p.index] = undefined
      break
    }
    throw new ForbiddenError()
  }

  args[p.index] = attached.principal
  break
}
```

- [ ] **Step 6: Verificar que `yarn tsc --noEmit` ainda mostra erros — mas apenas em arquivos que vamos remover/atualizar nas próximas tasks (oauth2.ts, configureApplication.ts, generateOpenApiDocument.ts)**

Run:
```bash
yarn tsc --noEmit 2>&1 | grep -E "error TS" | grep -vE "authentication/oauth2|configureApplication|generateOpenApiDocument|expressServerOptions" | head -10
```

Expected: Sem output (todos os erros restantes estão concentrados nos arquivos das tasks 15-18).

- [ ] **Step 7: Commit**

```bash
git add core/Router.ts
git commit -m "feat(auth): route wiring uses new authentication middleware"
```

---

### Task 15: Atualizar `config/expressServerOptions.ts`

**Files:**
- Modify: `config/expressServerOptions.ts`

- [ ] **Step 1: Ler `config/expressServerOptions.ts` atual e identificar o bloco `authentication`**

Run:
```bash
grep -n "authentication\|OAuth2\|provider" config/expressServerOptions.ts
```

- [ ] **Step 2: Substituir o campo OAuth2-específico por `AuthenticationConfig`**

No arquivo `config/expressServerOptions.ts`:

1. Adicionar import no topo:
```ts
import type { AuthenticationConfig } from '#exjs-controllers/core/authentication/types'
```

2. Localizar a linha (~138) `authentication?: OAuth2AuthenticationOptions` e substituir por:
```ts
authentication?: AuthenticationConfig
```

3. Remover toda a definição de tipos OAuth2-específicos (`OAuth2AuthenticationOptions`, `OAuth2Provider`, etc.) que vivem nesse arquivo. Manter apenas o que outros arquivos da lib ainda usam — verifique com:
```bash
grep -n "OAuth2AuthenticationOptions\|OAuth2Provider" --include="*.ts" -r . | grep -v authentication/oauth2 | grep -v dist
```
Tudo o que aparecer **fora de `authentication/oauth2*`** precisa também ser ajustado. Não devem sobrar referências fora dos arquivos que vamos deletar na Task 18.

- [ ] **Step 3: Verificar TS — erros remanescentes só em `configureApplication.ts` e `generateOpenApiDocument.ts`**

Run:
```bash
yarn tsc --noEmit 2>&1 | grep "error TS" | grep -vE "configureApplication|generateOpenApiDocument|authentication/oauth2" | head
```

Expected: Sem output.

- [ ] **Step 4: Commit**

```bash
git add config/expressServerOptions.ts
git commit -m "refactor(auth): ExpressServerOptions.authentication uses AuthenticationConfig"
```

---

### Task 16: Atualizar `config/configureApplication.ts`

**Files:**
- Modify: `config/configureApplication.ts`

- [ ] **Step 1: Ler o arquivo e mapear o bloco hardcoded de Scalar OAuth2**

Run:
```bash
grep -n "oauth2\|OAuth2\|provider\|scalar" config/configureApplication.ts
```

Identificar:
- Linhas ~111-131 (config Scalar OAuth2 hardcoded — ver spec).
- Linhas ~163-164 (`options.authentication?.provider.name`).

- [ ] **Step 2: Remover toda lógica que assume OAuth2 e encaminhar `scalarSecurityConfig`**

Substituir o bloco hardcoded por:
```ts
// Encaminhar Scalar security config quando o consumidor configurou um.
const scalarSecurityConfig = options?.authentication?.scalarSecurityConfig
```

Onde antes a config do Scalar era montada com `provider.clientId`/`authorizationUrl`/etc., agora passa-se `scalarSecurityConfig` diretamente (ou omite se ausente). O nome exato da key na config do Scalar depende do `@scalar/express-api-reference` — manter a mesma key usada hoje pelo bloco OAuth2 (ex.: `authentication: scalarSecurityConfig`).

Remover toda referência a `options.authentication.provider`.

- [ ] **Step 3: Rodar TS check**

Run:
```bash
yarn tsc --noEmit 2>&1 | grep "error TS" | grep -vE "generateOpenApiDocument|authentication/oauth2" | head
```

Expected: Sem output.

- [ ] **Step 4: Commit**

```bash
git add config/configureApplication.ts
git commit -m "refactor(auth): configureApplication forwards scalarSecurityConfig"
```

---

### Task 17: Refatorar `openapi/generateOpenApiDocument.ts` (TDD)

**Files:**
- Modify: `openapi/generateOpenApiDocument.ts`
- Create: `test/unit/openApi.test.ts`

> Estratégia: o arquivo é grande (~400 linhas). O escopo aqui é só a parte de **security** (components.securitySchemes e per-route security). Não tocar em outras partes.

- [ ] **Step 1: Escrever testes cobrindo a tabela de §7 do spec**

`test/unit/openApi.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateOpenApiDocument } from '#exjs-controllers/openapi/generateOpenApiDocument'
import { Controller, Get } from '#exjs-controllers/decorators/Controller'  // ajustar conforme o módulo correto
import { Authorized } from '#exjs-controllers/decorators/Authorized'
import { CurrentUser, CurrentApiKey } from '#exjs-controllers/decorators/CurrentUser'
import type { AuthenticationConfig } from '#exjs-controllers/core/authentication/types'

const authConfig: AuthenticationConfig = {
  currentUserChecker: () => null,
  authorizationChecker: () => true,
  openApiSecuritySchemes: {
    bearerUser: {
      scheme: { type: 'http', scheme: 'bearer' },
      kinds: ['user'],
    },
    bearerApiKey: {
      scheme: { type: 'http', scheme: 'bearer' },
      kinds: ['api-key'],
    },
  },
}

@Controller('/posts')
class PostsController {
  @Get('/public') public() {}

  @Authorized('posts:read')
  @Get('/list') list() {}

  @Authorized({ kinds: ['user'], permissions: ['posts:write'] })
  @Get('/write') write() {}

  @Get('/me') me(@CurrentUser() _user: unknown) {}

  @Get('/admin-key') adminKey(@CurrentApiKey() _key: unknown) {}

  @Get('/maybe') maybe(@CurrentUser({ optional: true }) _user?: unknown) {}
}

describe('generateOpenApiDocument — security', () => {
  it('emits components.securitySchemes from openApiSecuritySchemes', () => {
    const doc = generateOpenApiDocument({
      controllers: [PostsController],
      authentication: authConfig,
      info: { title: 'X', version: '1' },
    } as any)
    expect(doc.components?.securitySchemes).toEqual({
      bearerUser: { type: 'http', scheme: 'bearer' },
      bearerApiKey: { type: 'http', scheme: 'bearer' },
    })
  })

  it('public route has no security', () => {
    const doc = generateOpenApiDocument({
      controllers: [PostsController],
      authentication: authConfig,
      info: { title: 'X', version: '1' },
    } as any)
    expect(doc.paths!['/posts/public']!.get!.security).toBeUndefined()
  })

  it('short-form @Authorized → OR over all schemes', () => {
    const doc = generateOpenApiDocument({
      controllers: [PostsController],
      authentication: authConfig,
      info: { title: 'X', version: '1' },
    } as any)
    expect(doc.paths!['/posts/list']!.get!.security).toEqual([
      { bearerUser: ['posts:read'] },
      { bearerApiKey: ['posts:read'] },
    ])
  })

  it('@Authorized({ kinds: ["user"] }) → only user-kind schemes', () => {
    const doc = generateOpenApiDocument({
      controllers: [PostsController],
      authentication: authConfig,
      info: { title: 'X', version: '1' },
    } as any)
    expect(doc.paths!['/posts/write']!.get!.security).toEqual([
      { bearerUser: ['posts:write'] },
    ])
  })

  it('@CurrentUser() (no @Authorized) → user-kind schemes with empty scopes', () => {
    const doc = generateOpenApiDocument({
      controllers: [PostsController],
      authentication: authConfig,
      info: { title: 'X', version: '1' },
    } as any)
    expect(doc.paths!['/posts/me']!.get!.security).toEqual([
      { bearerUser: [] },
    ])
  })

  it('@CurrentApiKey() (no @Authorized) → api-key-kind schemes', () => {
    const doc = generateOpenApiDocument({
      controllers: [PostsController],
      authentication: authConfig,
      info: { title: 'X', version: '1' },
    } as any)
    expect(doc.paths!['/posts/admin-key']!.get!.security).toEqual([
      { bearerApiKey: [] },
    ])
  })

  it('optional principal decorator without @Authorized → no security', () => {
    const doc = generateOpenApiDocument({
      controllers: [PostsController],
      authentication: authConfig,
      info: { title: 'X', version: '1' },
    } as any)
    expect(doc.paths!['/posts/maybe']!.get!.security).toBeUndefined()
  })
})
```

> Nota: a assinatura exata de `generateOpenApiDocument` pode diferir; ajuste o `as any` se necessário ou refine os tipos quando consolidar.

- [ ] **Step 2: Rodar e confirmar falhas**

Run:
```bash
yarn test test/unit/openApi.test.ts
```

Expected: FAIL — a função ainda assume `options.authentication.provider.name` (OAuth2).

- [ ] **Step 3: Reescrever a parte de security em `openapi/generateOpenApiDocument.ts`**

Identificar e substituir:

a) **Geração de `components.securitySchemes`** (linhas ~152-161, ~349-377 do arquivo atual): em vez de derivar de `authentication.provider`, copiar do `openApiSecuritySchemes`:

```ts
function buildSecuritySchemes(
  authentication: AuthenticationConfig | undefined,
): Record<string, OpenAPISecurityScheme> | undefined {
  if (!authentication?.openApiSecuritySchemes) return undefined
  const entries = Object.entries(authentication.openApiSecuritySchemes)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries.map(([name, entry]) => [name, entry.scheme]))
}
```

b) **Per-route `security`**: criar função que recebe metadata da rota + params do handler e devolve o array `security` (ou `undefined`):

```ts
import type {
  AuthenticationConfig,
  PrincipalKind,
  OpenAPISecurityScheme,
} from '#exjs-controllers/core/authentication/types'
import type { AuthorizationMetadata } from '#exjs-controllers/metadata/symbols'
import type { ParamMetadata } from '#exjs-controllers/metadata/legacyStorage'

function deriveRouteSecurity(
  authorization: AuthorizationMetadata | undefined,
  handlerParams: ParamMetadata[],
  authentication: AuthenticationConfig | undefined,
): Array<Record<string, string[]>> | undefined {
  if (!authentication) return undefined

  const nonOptionalPrincipalKinds = handlerParams
    .filter(p =>
      (p.type === 'current-user' || p.type === 'current-api-key') &&
      p.optional !== true,
    )
    .map(p => (p.type === 'current-user' ? 'user' : 'api-key') as PrincipalKind)

  const hasAuth = authorization !== undefined
  const hasNonOptionalPrincipal = nonOptionalPrincipalKinds.length > 0

  if (!hasAuth && !hasNonOptionalPrincipal) return undefined

  const requiredKinds: PrincipalKind[] =
    authorization?.kinds ??
    (hasNonOptionalPrincipal ? nonOptionalPrincipalKinds : ['user', 'api-key'])

  const eligible = Object.entries(authentication.openApiSecuritySchemes).filter(
    ([_, entry]) =>
      entry.kinds == null || entry.kinds.some(k => requiredKinds.includes(k)),
  )

  if (eligible.length === 0) return undefined

  const scopes = authorization?.permissions ?? []
  return eligible.map(([name]) => ({ [name]: scopes }))
}
```

c) Chamar `deriveRouteSecurity` no loop onde cada rota é processada (substituindo a lógica OAuth2 hardcoded existente) e atribuir o resultado a `operation.security` quando não-`undefined`.

- [ ] **Step 4: Rodar testes**

Run:
```bash
yarn test test/unit/openApi.test.ts
```

Expected: PASS, 7 testes verdes.

- [ ] **Step 5: Rodar TS check geral**

Run:
```bash
yarn tsc --noEmit 2>&1 | grep "error TS" | grep -v "authentication/oauth2" | head
```

Expected: Sem output.

- [ ] **Step 6: Commit**

```bash
git add openapi/generateOpenApiDocument.ts test/unit/openApi.test.ts
git commit -m "feat(openapi): security derived from authenticationConfig schemes"
```

---

### Task 18: Deletar OAuth2 e BaseEntity

**Files:**
- Delete: `authentication/oauth2.ts`
- Delete: `authentication/oauth2Discovery.ts`
- Delete: `entities/BaseEntity.ts`
- Delete: `authentication/` (se vazio)
- Delete: `entities/` (se vazio)

- [ ] **Step 1: Confirmar que nada na lib ainda importa esses arquivos**

Run:
```bash
grep -rn "authentication/oauth2\|entities/BaseEntity" --include="*.ts" . | grep -v dist | grep -v docs | grep -v node_modules
```

Expected: Sem output. Se houver, voltar e corrigir antes de deletar.

- [ ] **Step 2: Deletar os arquivos**

```bash
git rm authentication/oauth2.ts authentication/oauth2Discovery.ts entities/BaseEntity.ts
```

- [ ] **Step 3: Remover diretórios vazios**

```bash
[ -z "$(ls -A authentication)" ] && rmdir authentication
[ -z "$(ls -A entities)" ] && rmdir entities
```

- [ ] **Step 4: TS check final**

Run:
```bash
yarn tsc --noEmit
```

Expected: Sem erros.

- [ ] **Step 5: Rodar todos os testes**

Run:
```bash
yarn test
```

Expected: PASS, todos os testes verdes.

- [ ] **Step 6: Build completo pra garantir que `dist/` gera limpo**

Run:
```bash
yarn build
```

Expected: Sem erros.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(auth): remove OAuth2 and BaseEntity from library"
```

---

### Task 19: Atualizar `index.ts`

**Files:**
- Modify: `index.ts`

- [ ] **Step 1: Substituir `index.ts` por:**

```ts
export * from '#exjs-controllers/config/configureApplication'
export * from '#exjs-controllers/config/expressServerOptions'
export * from '#exjs-controllers/core/authentication'
export * from '#exjs-controllers/core/ClassToZod'
export * from '#exjs-controllers/core/DependencyContainer'
export * from '#exjs-controllers/core/discoverControllers'
export * from '#exjs-controllers/core/Router'
export * from '#exjs-controllers/core/UseCase'
export * from '#exjs-controllers/decorators/Authorized'
export * from '#exjs-controllers/decorators/Controller'
export * from '#exjs-controllers/decorators/CurrentUser'
export * from '#exjs-controllers/decorators/DependencyInjection'
export * from '#exjs-controllers/decorators/Field'
export * from '#exjs-controllers/decorators/HttpMethod'
export * from '#exjs-controllers/decorators/Params'
export * from '#exjs-controllers/decorators/TraceSpan'
export * from '#exjs-controllers/decorators/DefineUseCase'
export * from '#exjs-controllers/http/application'
export * from '#exjs-controllers/http/cookies'
export * from '#exjs-controllers/http/httpTypes'
export * from '#exjs-controllers/logging/httpLogger'
export * from '#exjs-controllers/logging/logger'
export * from '#exjs-controllers/metadata/legacyStorage'
export * from '#exjs-controllers/metadata/symbols'
export * from '#exjs-controllers/observability/tracing'
export * from '#exjs-controllers/openapi/generateOpenApiDocument'
export * from '#exjs-controllers/schemas/BaseSchema'
```

(Diferenças vs original: adicionado `core/authentication`, `decorators/CurrentUser`. Removido `authentication/oauth2`, `entities/BaseEntity`.)

- [ ] **Step 2: Verificar build e testes**

Run:
```bash
yarn build && yarn test
```

Expected: Sem erros, todos os testes passam.

- [ ] **Step 3: Commit**

```bash
git add index.ts
git commit -m "refactor: update root exports for new auth architecture"
```

---

### Task 20: Atualizar `CHANGELOG.md` e bumpar versão

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Adicionar entrada no `CHANGELOG.md`**

Inserir no topo (logo após o cabeçalho), substituindo `<DATE>` pela data do commit e `<NEXT_VERSION>` por `0.4.0`:

```markdown
## [0.4.0] — <DATE>

### Breaking

- **Authentication redesign.** A lib agora é agnóstica ao esquema de autenticação. Substituído `authentication: OAuth2AuthenticationOptions` por `authentication: AuthenticationConfig` em `ExpressServerOptions`, com hooks `currentUserChecker` e `authorizationChecker` providos pelo consumidor.
- **Removido:** `authentication/oauth2.ts`, `authentication/oauth2Discovery.ts`, `entities/BaseEntity.ts`, `@SessionContext()`, `AuthenticationContext`, `SessionContext` type, `OAuth2AuthenticationOptions` (e tipos relacionados), `RequiredSessionContextError`.
- **Renomeado:** `AuthorizationMetadata.requiredScopes` → `permissions`.

### Added

- `@CurrentUser()` e `@CurrentApiKey()` parameter decorators (default required; aceitam `{ optional: true }`).
- `core/authentication` subpath com tipos (`AuthenticationConfig`, `ResolvedPrincipal`, `PrincipalKind`, `Action`, `OpenAPISecurityScheme`, `OpenApiSecuritySchemeEntry`, `ScalarSecurityConfig`).
- `UnauthorizedError` (status 401) e `ForbiddenError` (status 403) — lançados pela lib quando auth falha.
- `@Authorized` agora aceita forma objeto: `@Authorized({ permissions?, kinds? })`.
- Vitest test infrastructure.

### Changed

- `OpenAPI`: `components.securitySchemes` e `security` por rota derivam de `authentication.openApiSecuritySchemes`, com filtro por `kinds` declarados.
- `Scalar UI`: `configureApplication` encaminha `authentication.scalarSecurityConfig` em vez de gerar config OAuth2 hardcoded.

[0.4.0]: https://github.com/thebylito/exjs-controllers/compare/v0.3.0...v0.4.0
```

Também atualizar o link comparativo no final do arquivo se necessário.

- [ ] **Step 2: Bumpar versão em `package.json`**

Trocar `"version": "0.3.0"` por `"version": "0.4.0"`.

- [ ] **Step 3: Build + test final**

Run:
```bash
yarn build && yarn test
```

Expected: Sem erros, todos os testes verdes.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "chore: bump version to 0.4.0 with auth redesign changelog"
```

---

## Self-Review Notes (autor → executor)

**Spec coverage:** todas as seções do spec têm tasks correspondentes:
- §2/§4 (visão da arquitetura) → Tasks 2-3, 9-14
- §5 (tipos públicos) → Tasks 2, 3, 5-7
- §6 (algoritmo) → Tasks 9-13 (Fase A no middleware) e Task 14 (Fase B no Router)
- §6.1 (quando instalar middleware) → Task 14 step 3
- §7 (OpenAPI) → Task 17
- §8 (mudanças por arquivo) → Tasks 4, 8, 14, 15, 16, 18, 19
- §10 (testes) → Tasks 3, 5-7, 9-13, 17
- §11 (riscos): mitigado pelo uso de testes; risco "uso ainda usa SessionContext" não se aplica à lib (só ao consumidor).

**Não coberto neste plano (segue em plano separado):** migração do consumidor `gac-gestao-de-ativos` — port de OAuth2 + BaseEntity, swap dos decorators, bootstrap.

**Tipo consistency check:** `AuthenticationConfig`, `ResolvedPrincipal`, `PrincipalKind`, `Action`, `AuthorizationMetadata.permissions`, `ParamType.current-user`/`current-api-key`, `RESOLVED_PRINCIPAL_KEY` aparecem com a mesma assinatura em todas as tasks.

**Placeholders:** nenhum "TBD" ou "TODO" no plano. Itens explicitamente diferidos: nome da key da config do Scalar (Task 16 step 2 — manter o mesmo que já é usado pelo bloco OAuth2 atual).
