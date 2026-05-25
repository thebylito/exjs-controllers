# Redesenho da autenticação/autorização do exjs-controllers

**Data:** 2026-05-19
**Status:** Design aprovado, aguardando spec review
**Versão alvo:** próxima minor (preview phase — breaking changes liberados)

---

## 1. Contexto e problema

A versão atual da lib (0.3.0) declara-se como "Declarative controllers, DTO validation, dependency injection, OpenAPI and Express bootstrap" mas embute responsabilidades fora desse escopo:

- **OAuth2 hardcoded no core.** O middleware OAuth2, o discovery do OpenID Connect, a introspection e a extração de claims/scopes vivem dentro de `authentication/oauth2*` e são referenciados diretamente por `core/Router.ts`, `openapi/generateOpenApiDocument.ts` e `config/configureApplication.ts`. Não há ponto de extensão para JWT local, sessão, API keys, ou qualquer outro esquema.
- **Vocabulário OAuth2 vazado nos decorators.** `@Authorized(...scopes)` usa "scopes" (termo OAuth2); `@SessionContext()` injeta um `AuthenticationContext` (estrutura OAuth2) e re-exporta o tipo como `SessionContext`.
- **`BaseEntity` com semântica de ORM.** Tem `markAsPersisted`, `getUpdateDiff`, convenção de `_id`. Nenhum consumidor interno da lib usa esses métodos — é API pura para o app domain layer, fora do escopo de uma lib de controllers HTTP.
- **OpenAPI security scheme assumido como OAuth2.** Geração de `components.securitySchemes` e do `security` por rota é hardcoded para o provider OAuth2 configurado.

O único consumidor atual (`gac-gestao-de-ativos`) usa hoje `@Authorized('verb:noun')` no formato puro de permission strings (ex.: `@Authorized('list:notes')`, `@Authorized('loans:request')`, `@Authorized('manage:access')`) e tem seu próprio `permissionCatalogService`. A semântica real é **RBAC com permissões nomeadas**, mas precisamos manter portas abertas para **ABAC** (decisões baseadas em atributos do sujeito, do recurso, ou do ambiente) e para **policy engines externos** (OPA, Cedar, libs como `@anishpras/rbac`). A lib não deve assumir nenhuma dessas estratégias.

Adicionalmente, o `SessionContext` atual **conflaca usuários humanos e api-keys/client_credentials** num único tipo. O app sempre precisa inspecionar claims para descobrir "quem está chamando", o que vaza acoplamento.

A lib está em **preview phase**: não há contrato de compatibilidade. Breaking changes são livres, sem aliases ou shims.

## 2. Objetivos

1. Tornar a lib **agnóstica** ao esquema de autenticação. RBAC, ABAC, JWT, OAuth2, API key, sessão, ou qualquer combinação devem ser implementáveis sem mudar a lib.
2. Tornar a lib **agnóstica** ao policy engine. Quem decide "esse user pode `posts:read`?" é o app, via callback.
3. Separar formalmente **usuário humano** vs **api-key/service** no nível do decorator de parâmetro, eliminando o `SessionContext` polimórfico.
4. Suportar **um único par de hooks** (`currentUserChecker` + `authorizationChecker`) que internamente sabe lidar com user e api-key — sem array de strategies. O checker classifica o principal por request (`kind: 'user' | 'api-key'`). OpenAPI pode opcionalmente documentar múltiplos schemes (puro doc, não afeta runtime).
5. Mover OAuth2 e `BaseEntity` para o consumidor (`gac-gestao-de-ativos`). A lib não conhece nem mantém esse código.
6. **Default valida** — `@CurrentUser()` exige principal autenticado por construção. Permitir `undefined` é opt-in explícito (`{ optional: true }`).
7. Erros HTTP de auth (401/403) são responsabilidade da lib via erros tipados; o checker retorna apenas boolean.

## 3. Não-objetivos (YAGNI)

- Múltiplas estratégias de autenticação concorrentes em runtime. Um único `authentication` config; o consumidor dispatch internamente (uma única função de checker pode aceitar JWT, OAuth2, sessão e API key, retornando o kind apropriado).
- `AND` entre security schemes no OpenAPI (só `OR`).
- `@Authorized` no nível de classe / controller-wide.
- `@CurrentPrincipal()` decorator agnóstico de kind. Se a rota aceita ambos os kinds, o consumidor usa `@CurrentUser({ optional: true })` + `@CurrentApiKey({ optional: true })` e ramifica no handler.
- Hooks `onUnauthorized` / `onForbidden`. O consumidor intercepta via error handler do Express.
- Outros `principalKind` além de `user` e `api-key`. O tipo é uma união extensível, mas só esses dois são suportados nesta entrega.
- Resolução AND entre kinds (uma rota exigindo simultaneamente user E api-key).
- Hierarquia/herança de permissions na lib. Isso é problema do checker do app.

## 4. Visão geral da arquitetura

A lib expõe um ponto único de configuração: **um objeto `authentication`** em `ExpressServerOptions.authentication`, com:

- Hooks: `currentUserChecker` (resolve principal + classifica kind) e `authorizationChecker`.
- Integração com OpenAPI: `openApiSecuritySchemes` (mapa nome → scheme, opcionalmente marcado por kinds) e `scalarSecurityConfig?`.

O `core/Router.ts` deixa de instanciar middleware OAuth2 diretamente. Em vez disso, um novo `createAuthenticationMiddleware` recebe o `authentication` config e a metadata da rota e executa o algoritmo de resolução descrito em §6.

Decorators de parâmetro novos (`@CurrentUser`, `@CurrentApiKey`) substituem `@SessionContext`. O tipo do parâmetro é determinado pela anotação do consumidor; a lib trata como `unknown` internamente. **Não há `@CurrentPrincipal` agnóstico de kind** — rotas que aceitam ambos declaram os dois decorators com `{ optional: true }`.

`@Authorized` mantém a forma curta `@Authorized('posts:read', ...)` e ganha forma objeto `@Authorized({ permissions?, kinds? })` para restringir kinds aceitos.

## 5. Tipos públicos

```ts
// core/authentication/types.ts

export type PrincipalKind = 'user' | 'api-key'

export type Action = {
  request: Request
  response: Response
}

export type OpenAPISecurityScheme =
  // OpenAPI 3.1 SecuritySchemeObject (forma estrutural; tipagem completa
  // delegada ao consumidor que monta o objeto)
  Record<string, unknown>

export type ScalarSecurityConfig = Record<string, unknown>

export type ResolvedPrincipal<TPrincipal = unknown> = {
  principal: TPrincipal
  kind: PrincipalKind
}

export type OpenApiSecuritySchemeEntry = {
  scheme: OpenAPISecurityScheme
  /**
   * Quais kinds este scheme documenta. Usado para derivar o `security` por rota
   * filtrando schemes compatíveis com os kinds aceitos pela rota.
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

```ts
// core/authentication/errors.ts

export class UnauthorizedError extends Error {
  readonly status = 401
  constructor(message: string = 'Unauthorized', options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  readonly status = 403
  constructor(message: string = 'Forbidden', options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ForbiddenError'
  }
}
```

```ts
// decorators/Authorized.ts (forma objeto)

export type AuthorizationOptions = {
  permissions?: string[]
  kinds?: PrincipalKind[]    // restringe os kinds aceitos pela rota
}

export function Authorized(...permissions: string[]): MethodDecorator
export function Authorized(options: AuthorizationOptions): MethodDecorator
```

```ts
// decorators/CurrentUser.ts

export type PrincipalDecoratorOptions = { optional?: boolean }

export function CurrentUser(options?: PrincipalDecoratorOptions): ParameterDecorator
export function CurrentApiKey(options?: PrincipalDecoratorOptions): ParameterDecorator
```

## 6. Algoritmo de resolução por request

O algoritmo é dividido em **duas fases** com responsabilidades distintas:

- **Fase A — Autenticação/autorização** (middleware da rota): chama `currentUserChecker`, valida `@Authorized`.
- **Fase B — Injeção de parâmetros** (executada por `resolveArgs`): aplica regras de kind dos decorators `@CurrentUser` / `@CurrentApiKey` em cima do principal já resolvido.

A separação evita ambiguidade entre "qual auth a rota aceita" e "qual kind o handler espera". Auth não enxerga decorators de parâmetro; injeção não roda `authorizationChecker`.

### Fase A — Middleware

Pré-condições derivadas da metadata da rota:

- `requiredPermissions: string[]` — vem de `@Authorized({ permissions })` (ou da forma curta), default `[]` se não houver `@Authorized`.
- `allowedKinds: PrincipalKind[] | undefined` — vem de `@Authorized({ kinds })`. `undefined` significa "todos".
- `hasAuthorizedDecorator: boolean` — true se há `@Authorized` na rota.

Algoritmo da Fase A:

```
1. try:
     resolved = await authentication.currentUserChecker(action)
   catch (err):
     throw new UnauthorizedError(err.message, { cause: err })

2. se resolved é null/undefined:
     se hasAuthorizedDecorator:
       throw new UnauthorizedError()
     senão:
       (segue pra Fase B sem principal anexado)
       next(); return

3. se allowedKinds não é undefined E resolved.kind ∉ allowedKinds:
     throw new ForbiddenError()

4. autorizado = await authentication.authorizationChecker(
     action, resolved.principal, resolved.kind, requiredPermissions
   )
   se autorizado !== true:
     throw new ForbiddenError()

5. anexar resolved na request (ex.: request[Symbol('resolvedPrincipal')] = resolved)
6. next()
```

### Fase B — Injeção em `resolveArgs`

Para cada parâmetro com decorator de principal:

```
attached = request.<principal-slot>   // ResolvedPrincipal ou undefined
expectedKind =
  decorator === 'current-user'    ? 'user'
  decorator === 'current-api-key' ? 'api-key'

se attached não existe:
  se decorator tem optional: true → args[i] = undefined
  senão → throw new UnauthorizedError()

senão se attached.kind !== expectedKind:
  se decorator tem optional: true → args[i] = undefined
  senão → throw new ForbiddenError()

senão:
  args[i] = attached.principal
```

### Notas sobre o algoritmo

- **Uma única chamada ao checker por request.** A classificação user vs api-key acontece dentro da função do consumidor; pra OAuth2 isso é "fiz introspection, agora olho os claims e devolvo `{ principal, kind }`".
- **Diferença entre "não autenticado" e "auth inválida"**: o checker retorna `null/undefined` quando o request não traz credenciais (header ausente); **lança** quando traz mas é inválido. A Fase A converte o throw em `UnauthorizedError` preservando `cause`.
- **`optional: true`** atua APENAS no decorator de parâmetro. Nunca neutraliza `@Authorized`.
- **Rota com `@CurrentUser()` (não optional) e sem `@Authorized`** → exige user humano por construção. Ver §6.1 sobre quando o middleware é instalado.

### 6.1 Quando o middleware da Fase A é instalado

O middleware da Fase A é instalado na rota quando **qualquer um** for verdadeiro:

- Há `@Authorized` na rota.
- Há ao menos um decorator de principal (`@CurrentUser` ou `@CurrentApiKey`) no handler, independente de `optional`.

Isso garante que `@CurrentUser({ optional: true })` execute auth probing (tenta resolver, sem falhar se não conseguir), e que `@CurrentUser()` puro (sem `@Authorized`) tenha a chance de chegar à Fase B com `attached`.

## 7. Geração de OpenAPI

### Components

Cópia direta do mapa configurado:

```ts
components.securitySchemes = Object.fromEntries(
  Object.entries(authentication.openApiSecuritySchemes).map(
    ([name, entry]) => [name, entry.scheme]
  )
)
```

### Per-route `security`

Para cada rota, computar:

- `requiredKinds`: união dos kinds aceitos, derivada de:
  - `@Authorized({ kinds })` se presente.
  - O kind implícito pelos decorators de parâmetro **não-optional** no handler (`@CurrentUser` → `user`; `@CurrentApiKey` → `api-key`).
  - Se nada restringe, `requiredKinds = ['user', 'api-key']` (todos os kinds suportados).
- `requiredPermissions`: array de `@Authorized` (default `[]`).

Schemes elegíveis pra entrar no `security`:

```ts
const eligible = Object.entries(openApiSecuritySchemes).filter(
  ([_, entry]) =>
    entry.kinds == null || entry.kinds.some(k => requiredKinds.includes(k))
)
```

`security` gerado:

| Estado da rota                                                                | `security` gerado                                                  |
|-------------------------------------------------------------------------------|---------------------------------------------------------------------|
| Sem `@Authorized` e sem decorator de principal não-optional                   | omitido (rota pública)                                              |
| `@Authorized('p1','p2')` (ou forma objeto sem kinds)                          | `[ {schemeA: ['p1','p2']}, {schemeB: ['p1','p2']}, ... ]` para todos os schemes |
| `@Authorized({ kinds: ['user'], permissions })`                               | `OR` entre schemes elegíveis para `'user'`, scopes = `permissions ?? []` |
| Sem `@Authorized`, com `@CurrentUser()` (não optional) no handler             | `OR` entre schemes elegíveis para `'user'`, scopes = `[]`           |
| Sem `@Authorized`, com `@CurrentApiKey()` (não optional) no handler           | `OR` entre schemes elegíveis para `'api-key'`, scopes = `[]`        |
| Sem `@Authorized`, apenas decorators de principal com `optional: true`        | omitido (rota documentada como pública; auth probing é interno)     |

OpenAPI 3.1 interpreta array de objects em `security` como `OR`; um único object com múltiplas keys seria `AND` — não usamos.

Schemes sem `kinds` declarados cobrem todos os kinds e entram em qualquer rota protegida.

### Scalar UI

`authentication.scalarSecurityConfig` (se presente) é encaminhado pro `@scalar/express-api-reference` na configuração da UI. A forma exata do encaminhamento (qual key da config do Scalar) é detalhe de implementação a resolver no plano.

## 8. Mudanças concretas por arquivo

### Lib — deletar

- `authentication/oauth2.ts`
- `authentication/oauth2Discovery.ts`
- `entities/BaseEntity.ts`
- Diretório `entities/` se ficar vazio
- `export type SessionContext = AuthenticationContext` em `decorators/Params.ts`
- Função `SessionContext()` em `decorators/Params.ts`
- Case `'session-context'` em `core/Router.ts:247-256`
- Classe `RequiredSessionContextError` (onde quer que esteja definida)
- Linhas `export * from '#exjs-controllers/authentication/oauth2'` e `export * from '#exjs-controllers/entities/BaseEntity'` em `index.ts`

### Lib — criar

- `core/authentication/types.ts` — `AuthenticationConfig`, `ResolvedPrincipal`, `PrincipalKind`, `Action`, `OpenAPISecurityScheme`, `OpenApiSecuritySchemeEntry`, `ScalarSecurityConfig`
- `core/authentication/errors.ts` — `UnauthorizedError`, `ForbiddenError`
- `core/authentication/middleware.ts` — `createAuthenticationMiddleware`, implementando §6 (Fase A)
- `decorators/CurrentUser.ts` — `@CurrentUser`, `@CurrentApiKey` + tipos `PrincipalDecoratorOptions`
- Pasta `core/authentication/` com `index.ts` reexportando

### Lib — modificar

- `decorators/Authorized.ts` — overload aceitando `(...permissions: string[])` ou `(options: AuthorizationOptions)`; metadata interna passa a `{ permissions, kinds? }`.
- `decorators/Params.ts` — remover import de `AuthenticationContext`; remover `SessionContext` (função e tipo).
- `metadata/symbols.ts` — renomear `AuthorizationMetadata.requiredScopes` → `permissions`; adicionar `kinds?: PrincipalKind[]`. O symbol `AUTHORIZATION_METADATA` mantém o nome (continua sendo sobre autorização).
- `metadata/legacyStorage.ts` — `ParamType` ganha `'current-user' | 'current-api-key'` e perde `'session-context'`. `ParamMetadata` ganha `optional?: boolean`.
- `config/expressServerOptions.ts` — substituir `authentication?: OAuth2AuthenticationOptions` por `authentication?: AuthenticationConfig`. Deletar tipos OAuth2-específicos.
- `config/configureApplication.ts` — remover bloco hardcoded de Scalar OAuth2; encaminhar `authentication.scalarSecurityConfig` quando presente.
- `openapi/generateOpenApiDocument.ts` — `components.securitySchemes` e per-route `security` derivam de `authentication.openApiSecuritySchemes` conforme §7. Remover toda lógica `oauth2`-específica.
- `core/Router.ts`:
  - `resolveAuthenticationHandler` → usa `createAuthenticationMiddleware` quando há `@Authorized` OU decorator de principal no handler. Filtra/computa metadata necessária.
  - `resolveArgs` → 2 cases novos (`current-user`, `current-api-key`) substituindo `session-context`. Cada case lê o `ResolvedPrincipal` anexado à request e respeita o flag `optional`.
- `index.ts` — adicionar exports: `core/authentication/types`, `core/authentication/errors`, `core/authentication/middleware`, `decorators/CurrentUser`. Remover exports de `authentication/oauth2` e `entities/BaseEntity`.

### Consumidor (`gac-gestao-de-ativos`) — criar

- `src/shared/authentication/oauth2/` (ou equivalente) — código portado da lib, refatorado em **uma factory** `createOAuth2Authentication(options): AuthenticationConfig` que:
  - Faz introspection do token (com cache).
  - Classifica o resultado em `kind: 'user' | 'api-key'` baseado em claims (heurística: `sub` distinto de `client_id` ⇒ user; `client_credentials` flow ou ausência de `sub` humano ⇒ api-key). A heurística exata é decisão do consumidor.
  - Retorna `{ principal, kind } | null` (ou lança em caso de token presente mas inválido).
  - Implementa `authorizationChecker` que recebe `kind` e ramifica se necessário (ex.: user passa por `permissionCatalogService`, api-key tem permissions via outra fonte).
  - Configura `openApiSecuritySchemes` — pode ter um único entry (bearer cobrindo ambos os kinds) ou dois entries marcados com `kinds: ['user']` / `kinds: ['api-key']` se quiser documentação separada no Scalar.
- `src/shared/entities/BaseEntity.ts` — código portado da lib, com imports ajustados (`TraceSpan` continua sendo importado de `exjs-controllers`).

### Consumidor — modificar

- Bootstrap: onde hoje passa `authentication: { provider: ... }` (config OAuth2-específica) → passar `authentication: createOAuth2Authentication(opts)` (retornando um `AuthenticationConfig`).
- Cada controller que usa `@SessionContext() sessionContext: SessionContext`:
  - Inspecionar o uso real do `sessionContext` no handler.
  - Substituir por `@CurrentUser() user: User` quando a rota é só para humanos.
  - Substituir por `@CurrentApiKey() apiKey: ApiKey` quando a rota é só para serviços.
  - Quando a rota legitimamente aceita ambos (raro): declarar os dois com `{ optional: true }` e ramificar no handler.
- Definir tipos `User` e `ApiKey` no consumidor, refletindo o shape do `principal` que `createOAuth2Authentication` retorna em cada kind.
- Imports `import { ..., SessionContext } from 'exjs-controllers/decorators/Params'` substituídos pelos novos.
- Entidades de domínio que estendem `BaseEntity` passam a importar de `src/shared/entities/BaseEntity`.

### Consumidor — não muda

- `@Authorized('verb:noun')` em todos os controllers continua exatamente como está.

## 9. Compatibilidade

A lib está em preview phase. **Não há suporte a versão anterior**, nem aliases, nem deprecation. A próxima versão publicada será incompatível com 0.3.0 e o `gac-gestao-de-ativos` migrará em lockstep (PRs coordenados).

`CHANGELOG.md` documentará as mudanças sob `### Breaking`.

## 10. Testes

Cobertura mínima esperada (detalhamento fica para o plano de implementação):

- `createAuthenticationMiddleware`: cada ramo do algoritmo em §6 (sem principal + rota pública; sem principal + `@Authorized`; principal resolvido + kind compatível + autorizado; principal + kind incompatível com `@Authorized({ kinds })`; principal + autorização negada; checker lançando).
- Fase B de injeção: kind match injeta principal; kind mismatch sem `optional` lança; kind mismatch com `optional` injeta `undefined`; ausência de principal sem `optional` lança; ausência com `optional` injeta `undefined`.
- Geração de OpenAPI: cada linha da tabela em §7, incluindo schemes com `kinds` declarados vs schemes sem `kinds` (cobrem tudo).
- Decorators: `@CurrentUser`, `@CurrentApiKey` com e sem `optional`.
- `@Authorized` forma curta vs forma objeto produzem metadata equivalente quando aplicável.
- Erros tipados (`UnauthorizedError`, `ForbiddenError`) chegam ao error handler com status correto e `cause` preservado.

No consumidor, os testes de integração existentes (`auth-callback.test.ts`, `auth-session.test.ts`, `access-admin.test.ts`, `permissionCatalogService.test.ts`) precisam continuar passando após a migração — eles validam que as duas factories OAuth2 portadas no app cobrem o comportamento atual.

## 11. Riscos e mitigações

- **Risco:** A heurística que classifica o principal como `user` vs `api-key` no token OAuth2 introspectado pode falhar em edge cases (ex.: token de delegação onde `sub` e `client_id` coexistem com semântica ambígua).
  **Mitigação:** A heurística vive no consumidor (`createOAuth2Authentication`), não na lib. Permite ajuste sem nova versão da lib. Documentar a regra usada e cobrir com testes de unit no consumidor.

- **Risco:** OpenAPI gerado com múltiplos schemes em `OR` pode confundir clientes que esperam um único scheme.
  **Mitigação:** Documentar comportamento; quando o consumidor quer um esquema único, declara apenas um entry em `openApiSecuritySchemes`.

- **Risco:** `@CurrentUser` com default `required` (lança 401) pode quebrar rotas legitimamente abertas que hoje injetam `SessionContext` opcional.
  **Mitigação:** Durante a migração no GAC, auditar cada uso e usar `{ optional: true }` quando aplicável. Os testes de integração existentes pegam o regredido.

- **Risco:** Uma única função de `currentUserChecker` pode crescer indefinidamente conforme o consumidor adiciona mais mecanismos de auth (JWT local + OAuth2 + sessão).
  **Mitigação:** Não é problema da lib. Quando o consumidor sentir essa dor, pode internamente compor sub-checkers e dispatchar por header — exatamente o que multi-strategy ofereceria, mas no lugar certo (no app, com o domínio à mão).
