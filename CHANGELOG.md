# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
