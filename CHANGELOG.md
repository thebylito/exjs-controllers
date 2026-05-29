# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.7.0] — 2026-05-29

### Added

- **Upload de arquivos** — decorators `@UploadedFile(field, options?)` e `@UploadedFiles(field, options?)` (`decorators/Params`) integram o [multer](https://github.com/expressjs/multer) na rota automaticamente. O middleware roda depois do auth e antes do handler; sem `options` usa `memoryStorage` (arquivo em `buffer`). `options` aceita objeto ou factory (`storage`, `limits`, `fileFilter`). Tipos `UploadedFileInfo`, `UploadOptions` e `MulterUploadOptions` são auto-contidos e reexportados — não exige `@types/multer` no consumidor. O OpenAPI expõe a rota como `multipart/form-data` (campo binário), então o Scalar renderiza um seletor de arquivo.
- **`logging/httpLogger`** — nova opção `levelFormat: 'label' | 'number'` (default `'number'`, mantendo o comportamento nativo do Pino). Com `'label'` o nível é serializado como string (`"level":"info"`) em vez do código numérico (`"level":30`), para agregadores que classificam a severidade pelo texto (ex.: Dokploy). Afeta apenas a saída JSON; o formato `pretty` sempre imprime o rótulo.

### Changed

- **Dependências** — adicionado `multer` (runtime) e `@types/multer` (dev) para o suporte a upload.

[0.7.0]: https://github.com/thebylito/exjs-controllers/compare/v0.5.0...v0.7.0

---

## [0.5.0] — 2026-05-24

### Breaking

- **Removido `@ExecuteUseCase(property)`**. O decorator de controller que dispachava o input para `this[property].execute(input)` foi retirado. Substituição: injete o use case com `@Inject(UseCase)` e chame `this.useCase.execute(input)` direto no handler.

### Changed

- **`logging/httpLogger`** — middleware agora escuta apenas o evento `'close'` do response (sem o `'finish' + 'close'` com flag de dedup anterior). Comportamento equivalente em produção em Express 5 / Node HTTP (o `'close'` sempre dispara após `'finish'` num response normal). Consumidores que testem o middleware emitindo `'finish'` em mocks precisam trocar por `'close'`.
- **`tsconfig.json`** — `docs/` agora está em `exclude`, evitando que o build da lib tente compilar o site Fumadocs.

### Added

- **Site de documentação** em [`docs/`](https://github.com/thebylito/exjs-controllers/tree/main/docs) construído com Next.js + Fumadocs cobrindo: Getting Started, Controllers, Parameters, DTOs, Dependency Injection, Use Cases, Authentication, configureApplication, Controller Discovery, OpenAPI, Scalar, HTTP Logger e Tracing.

[0.5.0]: https://github.com/thebylito/exjs-controllers/compare/v0.4.0...v0.5.0

---

## [0.4.0] — 2026-05-21

### Breaking

- **Authentication redesign.** A lib agora é agnóstica ao esquema de autenticação. Substituído `authentication: OAuth2AuthenticationOptions` por `authentication: AuthenticationConfig` em `ExpressServerOptions`, com hooks `currentUserChecker` e `authorizationChecker` providos pelo consumidor.
- **Removido:** `authentication/oauth2.ts`, `authentication/oauth2Discovery.ts`, `entities/BaseEntity.ts`, `@SessionContext()` decorator, `AuthenticationContext` type, `SessionContext` type alias, `OAuth2AuthenticationOptions` (e tipos relacionados), `RequiredSessionContextError`.
- **Renomeado:** `AuthorizationMetadata.requiredScopes` → `permissions`.

### Added

- `@CurrentUser()` e `@CurrentApiKey()` parameter decorators (default required; aceitam `{ optional: true }` para permitir `undefined` quando não há principal).
- `core/authentication` subpath com tipos públicos (`AuthenticationConfig`, `ResolvedPrincipal`, `PrincipalKind`, `Action`, `OpenAPISecurityScheme`, `OpenApiSecuritySchemeEntry`, `ScalarSecurityConfig`).
- `UnauthorizedError` (status 401) e `ForbiddenError` (status 403) — lançados pela lib quando autenticação/autorização falha.
- `@Authorized` agora aceita forma objeto: `@Authorized({ permissions?, kinds? })` além da forma curta `@Authorized(...permissions)`.
- Vitest test infrastructure com 28 testes cobrindo erros, decorators e middleware.

### Changed

- **OpenAPI**: `components.securitySchemes` e `security` por rota derivam de `authentication.openApiSecuritySchemes`. Schemes podem declarar `kinds?: PrincipalKind[]` para filtrar a quais rotas se aplicam.
- **Scalar UI**: `configureApplication` agora resolve o `preferredSecurityScheme` a partir dos schemes registrados em `authentication.openApiSecuritySchemes` (em vez do `provider.name` OAuth2-específico).

[0.4.0]: https://github.com/thebylito/exjs-controllers/compare/v0.3.0...v0.4.0

---

## [0.3.0] — 2026-05-01

### Added

- **`@SessionContext()`** parameter decorator — injects the authenticated `AuthenticationContext` into a handler parameter. Automatically responds `401` (`RequiredSessionContextError`) when no active session exists.
- **`SessionContext` type alias** — re-exported from `exjs-controllers/decorators/Params` as a convenience alias for `AuthenticationContext`.
- **`outputIsArray`** in `RouteOptions` — when `true`, the OpenAPI response schema is generated as `{ type: 'array', items: <outputClass schema> }` instead of a plain object schema.
- **`extraArgs` forwarding in `DefineUseCase`** — `execute(input, ...extraArgs)` now forwards all arguments that appear after the first `BaseSchema` parameter to the use case.

### Fixed

- **`classToZod` inheritance** — `@Field` decorators declared on parent `BaseSchema` classes are now included when building the Zod schema for a child class. Previously only own fields were collected.

---

## [0.2.1] — 2026-05-01

### Fixed

- Corrected import path for `TraceSpan` decorator that caused a runtime resolution error.

---

## [0.2.0] — 2026-04-30

### Added

- Initial public release.
- Controller and route decorators: `@Controller`, `@JsonController`, `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`.
- Parameter decorators: `@Body`, `@Param`, `@QueryParam`, `@QueryParams`, `@HeaderParam`, `@Req`, `@Res`.
- Field decorator `@Field(zodSchema)` for DTO definition backed by Zod.
- `BaseSchema` base class with `create`, `merge`, `validate` and `toZod` helpers.
- Constructor-based dependency injection: `@Injectable`, `@Inject`.
- OAuth2 authentication middleware with introspection and discovery support.
- `@Authorized(...scopes)` route-level authorization decorator.
- Use case pattern: `@DefineUseCase`, `@ExecuteUseCase`, `UseCase<TInput, TOutput>` interface.
- `configureApplication` Express bootstrap with middleware, OpenAPI document serving and Scalar UI.
- `generateOpenApiDocument` for programmatic OpenAPI 3.1 document generation.
- OpenTelemetry tracing: `@TraceSpan`, `runWithSpan`, automatic span on controller handlers and use case `execute`.
- Pino HTTP logger integration via `HttpLoggerOptions`.
- Controller auto-discovery via filesystem scanning.
- `BaseEntity` base class with common entity fields.
- `package.json` `exports` map with full subpath support.

[0.3.0]: https://github.com/thebylito/exjs-controllers/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/thebylito/exjs-controllers/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/thebylito/exjs-controllers/releases/tag/v0.2.0
