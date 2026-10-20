# exjs-controllers

Declarative controllers, DTO validation, dependency injection, OpenAPI generation and Express bootstrap for TypeScript APIs.

📖 **Documentation:** https://thebylito.github.io/exjs-controllers/

## Install

```bash
npm install exjs-controllers express zod
npm install -D @types/express   # Express types for TypeScript
```

`express ^5` and `zod ^4` are peer dependencies: your project owns them, so the schemas you pass to `@Field` and the middlewares you register share one copy with the framework. npm and pnpm install peers automatically; with Yarn, add them explicitly as above. Requires Node.js `>=22`.

---

## Table of contents

- [Quick start](#quick-start)
- [Controllers](#controllers)
- [Route decorators](#route-decorators)
- [Parameter decorators](#parameter-decorators)
- [DTOs and field validation](#dtos-and-field-validation)
- [Dependency injection](#dependency-injection)
- [Authentication and authorization](#authentication-and-authorization)
- [Use cases](#use-cases)
- [OpenAPI and Scalar](#openapi-and-scalar)
- [Observability](#observability)
- [configureApplication options](#configureapplication-options)
- [Public entrypoints](#public-entrypoints)
- [Changelog](#changelog)

---

## Quick start

```ts
import { z } from 'zod'
import { createApplication } from 'exjs-controllers/http/application'
import { configureApplication } from 'exjs-controllers/config/configureApplication'
import { Controller } from 'exjs-controllers/decorators/Controller'
import { Get } from 'exjs-controllers/decorators/HttpMethod'
import { Field } from 'exjs-controllers/decorators/Field'
import { BaseSchema } from 'exjs-controllers/schemas/BaseSchema'

class HealthOutput extends BaseSchema {
  @Field(z.string())
  status!: string
}

@Controller('/health')
class HealthController {
  @Get('/', { outputClass: HealthOutput, summary: 'Health check', tags: ['health'] })
  getHealth(): HealthOutput {
    return HealthOutput.create({ status: 'ok' })
  }
}

const app = createApplication()

await configureApplication(app, {
  controllers: [HealthController],
  openapi: {
    documentation: { info: { title: 'Example API', version: '1.0.0' } },
  },
  enableScalar: true,
})

app.listen(3000)
```

---

## Controllers

### `@Controller(prefix, options?)`

Registers a class as a controller. All routes inside will be prefixed with `prefix`.

```ts
@Controller('/users')
class UsersController { ... }
```

`options.group` puts every route of the controller in an OpenAPI documentation group (see [Multiple documents](#multiple-documents)). It does not affect routing.

### `@JsonController(prefix, options?)`

Like `@Controller`, but automatically serialises the return value with `res.json()` instead of `res.send()`. Accepts the same `options`.

```ts
@JsonController('/api/v1/users')
class UsersController { ... }
```

---

## Route decorators

All route decorators accept a path and an optional `RouteOptions` object.

```ts
@Get(path, options?)
@Post(path, options?)
@Put(path, options?)
@Patch(path, options?)
@Delete(path, options?)
@QueryMethod(path, options?)
```

`@QueryMethod` registers an HTTP `QUERY` route: safe and idempotent like `GET`, but it carries a request body, so `@Body` and `inputClass` work as they do on `@Post`. It is documented under the `query` operation of the OpenAPI document.

### `RouteOptions`

| Property | Type | Description |
|---|---|---|
| `inputClass` | `typeof BaseSchema` | DTO class used to **document** the request body in OpenAPI (validation happens through `@Body(Dto)` + `validate()`) |
| `outputClass` | `typeof BaseSchema` | DTO class used to document the response body |
| `outputIsArray` | `boolean` | When `true`, the OpenAPI response schema is wrapped as `{ type: 'array', items: <outputClass schema> }` |
| `summary` | `string` | Short description shown in the OpenAPI docs |
| `description` | `string` | Long description shown in the OpenAPI docs |
| `tags` | `string[]` | OpenAPI tags for grouping |
| `group` | `string` | OpenAPI documentation group; overrides the controller's `group` (default: `default`) |

```ts
@Get('/items', {
  outputClass: ItemOutput,
  outputIsArray: true,
  summary: 'List all items',
  tags: ['items'],
})
listItems(): ItemOutput[] { ... }
```

---

## Parameter decorators

Use these decorators on method parameters to bind request data automatically.

| Decorator | Binds |
|---|---|
| `@Body(schemaClass?)` | `req.body` — optionally hydrates into an instance of `schemaClass`, copying only the keys declared with `@Field` |
| `@Param(name)` | `req.params[name]` |
| `@QueryParam(name)` | `req.query[name]` — a `string[]` when the key is repeated (`?tag=a&tag=b`) |
| `@QueryParams()` | `req.query` (entire object) |
| `@HeaderParam(name)` | `req.headers[name]` — the name must be lower-case (Node lower-cases incoming headers) |
| `@Req()` | The raw Express `Request` object |
| `@Res()` | The raw Express `Response` object |
| `@CurrentUser(options?)` | The resolved `user` principal — responds `401` when missing unless `{ optional: true }` |
| `@CurrentApiKey(options?)` | The resolved `api-key` principal — same rules as `@CurrentUser` |
| `@UploadedFile(field, options?)` | A single uploaded file from a `multipart/form-data` field (via [multer](https://github.com/expressjs/multer)) |
| `@UploadedFiles(field, options?)` | All uploaded files from a `multipart/form-data` field (array) |

```ts
@Controller('/orders')
class OrdersController {
  @Post('/')
  create(
    @Body(CreateOrderInput) input: CreateOrderInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    console.log('Created by', user.id)
    return this.orderService.create(input)
  }

  @Get('/:id')
  findOne(
    @Param('id') id: string,
    @QueryParam('expand') expand?: string,
  ) { ... }
}
```

### File uploads

`@UploadedFile` / `@UploadedFiles` wire [multer](https://github.com/expressjs/multer) into the route automatically. With no options the file is kept in memory (`buffer` is populated); pass `options` (object or factory) to configure multer — `storage`, `limits`, `fileFilter`. The OpenAPI document advertises the route as `multipart/form-data` with the field as a binary, so Scalar renders a file picker.

```ts
import { UploadedFile, type UploadedFileInfo } from 'exjs-controllers/decorators/Params'

@Controller('/imports')
class ImportsController {
  @Post('/')
  upload(@UploadedFile('file') file: UploadedFileInfo) {
    return this.service.import(file.buffer.toString('utf-8'))
  }

  // Custom multer options (disk storage, size limit, ...)
  @Post('/large')
  uploadLarge(
    @UploadedFile('file', { options: { limits: { fileSize: 16 * 1024 * 1024 } } })
    file: UploadedFileInfo,
  ) { ... }
}
```

Every upload route gets default multer limits (exported as `DEFAULT_UPLOAD_LIMITS`); `options.limits` overrides them key by key:

| Limit | Default |
|---|---|
| `fileSize` | 16 MiB |
| `files` | 10 (per request, not per field) |
| `fields` | 100 |
| `parts` | 200 |
| `fieldNameSize` | 100 bytes |
| `fieldSize` | 1 MiB |
| `headerPairs` | 2000 |
| `fieldNestingDepth` | 5 |
| `fieldArrayIndexLimit` | 100 |

```ts
@UploadedFile('file', { options: { limits: { fileSize: 2 * 1024 * 1024 } } }) // other limits keep the defaults
```

Limit errors are answered by the default error handler: `413` for `LIMIT_FILE_SIZE`, `400` for the other multer errors. With `diskStorage`, files already written are deleted when the handler throws. A route with a non-optional `@CurrentUser()` / `@CurrentApiKey()` rejects anonymous requests with `401` before multer parses the body.

`UploadedFileInfo` is a self-contained type (mirrors `Express.Multer.File`) re-exported from `exjs-controllers/decorators/Params` — no need to install `@types/multer` in the consumer.

---

## DTOs and field validation

### `BaseSchema`

All DTO classes must extend `BaseSchema`. Use `@Field(zodSchema)` to declare each property.

```ts
import { z } from 'zod'
import { BaseSchema } from 'exjs-controllers/schemas/BaseSchema'
import { Field } from 'exjs-controllers/decorators/Field'

class CreateUserInput extends BaseSchema {
  @Field(z.string().min(1))
  name!: string

  @Field(z.string().email())
  email!: string
}
```

**Inheritance** — `@Field` decorators are collected from the full prototype chain, so child classes inherit all fields from parent DTOs:

```ts
class AuditedInput extends BaseSchema {
  @Field(z.string())
  createdBy!: string
}

class CreateAssetInput extends AuditedInput {
  @Field(z.string())
  assetTag!: string
}
// classToZod(CreateAssetInput) includes both createdBy and assetTag
```

**Hydration** — `@Body(Dto)` copies only the keys declared with `@Field`; undeclared client keys are dropped, and `__proto__`, `constructor` and `prototype` are always ignored. A DTO with no `@Field` keeps all other own keys. `validate()` writes the Zod parse result back onto the instance, so transforms, `.default()` and `z.coerce` take effect (keys added via `merge()` are preserved).

### Useful methods

```ts
// Create an instance (optional initial data)
const input = CreateUserInput.create({ name: 'Alice', email: 'alice@example.com' })

// Merge partial data into an existing instance
input.merge({ name: 'Bob' })

// Validate against the Zod schema — throws ZodError on failure
input.validate()

// Get the Zod schema for the class
const schema = CreateUserInput.toZod()
```

---

## Dependency injection

### `@Injectable(options?)`

Marks a class as injectable. By default creates a singleton — set `{ singleton: false }` to create a new instance **per resolution** (controllers are resolved once at bootstrap, so a non-singleton dependency of a controller is also created once). There is no request scope.

```ts
import { Injectable } from 'exjs-controllers/decorators/DependencyInjection'

@Injectable()
class UserRepository {
  findAll() { ... }
}
```

### `@Inject(token)`

Injects a specific token into a constructor parameter. Useful when the parameter type is an interface or abstract class.

```ts
@Injectable()
class UserService {
  constructor(
    @Inject(UserRepository) private readonly repo: UserRepository,
  ) {}
}
```

Controllers are resolved automatically via the DI container — no need to mark them with `@Injectable`.

---

## Authentication and authorization

`exjs-controllers` does not ship an auth backend. You implement the `AuthenticationConfig` contract — resolve the caller, decide permissions — and pass it to `configureApplication`. The authentication middleware is mounted only on routes that use `@Authorized`, `@CurrentUser` or `@CurrentApiKey`.

### Configuration

```ts
import type { AuthenticationConfig } from 'exjs-controllers/core/authentication'

const authentication: AuthenticationConfig<AuthenticatedUser> = {
  // Who is calling? Return { principal, kind } or null for anonymous.
  currentUserChecker: async ({ request }) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) return null

    const session = await sessions.verify(header.slice('Bearer '.length))
    return session ? { principal: session.user, kind: 'user' } : null
  },

  // Does the principal satisfy the route's permissions?
  authorizationChecker: (_action, user, _kind, required) =>
    required.every((permission) => user.permissions.includes(permission)),

  // Schemes to document in OpenAPI, tagged with the kinds they cover.
  openApiSecuritySchemes: {
    bearerAuth: {
      scheme: { type: 'http', scheme: 'bearer' },
      kinds: ['user'],
    },
  },
}

await configureApplication(app, { controllers, authentication })
```

`kind` is `'user'` or `'api-key'`, so human sessions and machine clients can coexist behind a single config.

### `@Authorized(...permissions)`

Protects a route. Permissions are passed verbatim to your `authorizationChecker`; their semantics are yours. `@Authorized()` with no arguments only requires an authenticated principal.

```ts
@JsonController('/admin')
class AdminController {
  @Authorized('admin:read')
  @Get('/users')
  listUsers() { ... }

  // Object form also restricts which principal kinds may call the route
  @Authorized({ permissions: ['admin:write'], kinds: ['user'] })
  @Delete('/users/:id')
  deleteUser(@Param('id') id: string) { ... }
}
```

### `@CurrentUser()` and `@CurrentApiKey()`

Inject the resolved principal into a handler argument. Both accept `{ optional?: boolean }`; without it, a missing principal responds `401` and a wrong-kind principal responds `403`.

```ts
import { CurrentUser } from 'exjs-controllers/decorators/CurrentUser'

@Get('/me')
getMe(@CurrentUser() user: AuthenticatedUser) {
  return user
}

@Get('/me-or-anon')
maybeMe(@CurrentUser({ optional: true }) user?: AuthenticatedUser) {
  return user ?? { anonymous: true }
}
```

### Errors

`UnauthorizedError` (`401`) and `ForbiddenError` (`403`) are exported from `exjs-controllers/core/authentication`. Handle them in your `errorHandler` to shape the HTTP response.

- An exception thrown by `currentUserChecker` is answered `401` with the fixed message `Unauthorized` (the original error stays in `cause`).
- `{ principal: null }` counts as unauthenticated.
- Applying `@Authorized` twice to the same method throws when the class is defined.
- Direct users of `createAuthenticationMiddleware`: the option `hasAuthorizedDecorator` was renamed `requirePrincipal`.

Full reference: [Authentication](https://thebylito.github.io/exjs-controllers/docs/authentication/configuration/) and [`@Authorized` & principals](https://thebylito.github.io/exjs-controllers/docs/authentication/authorized/).

---

## Use cases

Use cases encapsulate business logic. `exjs-controllers` provides decorators to connect controllers to use cases with automatic input validation.

### `@DefineUseCase()`

Wraps the `execute` method of a use case class with input validation and OpenTelemetry tracing.

```ts
import { UseCase } from 'exjs-controllers/core/UseCase'
import { DefineUseCase } from 'exjs-controllers/decorators/DefineUseCase'

@DefineUseCase()
class CreateUserUseCase implements UseCase<CreateUserInput, UserOutput> {
  async execute(input: CreateUserInput): Promise<UserOutput> {
    input.validate()
    // business logic...
    return UserOutput.create({ id: '1', name: input.name })
  }
}
```

### Calling a use case from a controller

Inject the use case via `@Inject`, then call `execute(input)` directly from the handler. Any additional arguments forwarded to `execute` will reach the underlying method.

```ts
@Controller('/users')
class UsersController {
  constructor(
    @Inject(CreateUserUseCase) private readonly createUser: CreateUserUseCase,
  ) {}

  @Post('/', { inputClass: CreateUserInput })
  create(@Body(CreateUserInput) input: CreateUserInput) {
    return this.createUser.execute(input)
  }
}
```

### `UseCase<TInput, TOutput>` interface

```ts
interface UseCase<TInput extends BaseSchema, TOutput> {
  execute(input: TInput, ...args: unknown[]): TOutput | Promise<TOutput>
}
```

### Validation errors

When `execute` is called, `input.validate()` is invoked automatically. On failure, a `UseCaseInputValidationError` with `statusCode: 422` is thrown and forwarded to Express error handlers.

---

## OpenAPI and Scalar

### Generating the document

`generateOpenApiDocument(controllers, options)` builds an OpenAPI 3.2 document from the metadata registered by route decorators.

```ts
import { generateOpenApiDocument } from 'exjs-controllers/openapi/generateOpenApiDocument'

const document = generateOpenApiDocument([UsersController], options)
```

### Serving via `configureApplication`

When `openapi.documentation` is set, the document is automatically served at `/docs/openapi.json` (configurable via `openapi.documentPath`).

When `enableScalar: true` is set, Scalar API reference is served at `/docs` (configurable via `scalar.referencePath`). The page loads a pinned `@scalar/api-reference` bundle from jsDelivr (`DEFAULT_SCALAR_CDN`), so the UI only changes when the framework bumps it; set `scalar.cdn` to load another version or a self-hosted copy.

### Multiple documents

Declare a `group` on controllers or routes and configure one document per group with `openapi.documents`. Each document gets its own JSON and, with `enableScalar`, its own Scalar UI. Routes in a group that no document references are not exposed anywhere.

```ts
@JsonController('/admin/users', { group: 'admin' })
class AdminUsersController { ... }

await configureApplication(app, {
  controllers: [UsersController, AdminUsersController],
  openapi: {
    documentation: { info: { title: 'My API', version: '1.0.0' } },
    documents: {
      default: {}, // routes without a group → /docs/openapi.json, Scalar at /docs
      admin: {},   // group "admin"          → /docs/admin/openapi.json, Scalar at /docs/admin
    },
  },
  enableScalar: true,
})
```

Without `documents`, a single document includes every route. See the [documentation](https://thebylito.github.io/exjs-controllers/docs/documentation/openapi/#multiple-documents) for path and resolution rules.

### Security schemes in OpenAPI

```ts
await configureApplication(app, {
  openapi: {
    documentation: {
      info: { title: 'My API', version: '1.0.0' },
      security: [{ bearerAuth: [] }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  },
})
```

---

## Observability

### `@TraceSpan(name?, options?)`

Wraps a method in an OpenTelemetry span. Works on any class method — not just controllers.

```ts
import { TraceSpan } from 'exjs-controllers/decorators/TraceSpan'

class UserRepository {
  @TraceSpan('UserRepository.findAll')
  async findAll() { ... }
}
```

Controller route handlers are automatically wrapped in spans via `runWithControllerSpan`. Use case `execute` methods are also automatically traced when decorated with `@DefineUseCase`.

Requires an OpenTelemetry SDK to be initialised in the application before spans will be exported.

---

## `configureApplication` options

| Option | Type | Description |
|---|---|---|
| `controllers` | `ControllerClass[]` | Controller classes to register |
| `controllerDiscovery` | `ControllerDiscoveryOptions` | Discover controllers from directories when `controllers` is omitted; `directories` mounts every `*.controller.*` file recursively, so keep test fixtures out of them |
| `authentication` | `AuthenticationConfig` | Principal resolution and permission checks for protected routes |
| `logger` | `HttpLoggerOptions \| false` | Pino HTTP logger, mounted when provided. Besides `logger`, `logFormat`, `levelFormat`, etc., it accepts `remoteIpHeaders?: string[]` (default `[]`: no client IP header such as `CF-Connecting-IP` is trusted unless listed) and `logQueryString?: boolean` (default `false`: query string and fragment are stripped from `requestUrl` and `referrer`) |
| `middlewares` | `MiddlewareRegistration[]` | Express middlewares applied before controllers and before the docs routes. `/docs` and the OpenAPI JSON are public by default; protect them with `{ path: '/docs', handlers: [requireAdmin] }` |
| `errorHandler` | `ErrorMiddleware` | Express error middleware, mounted last. When omitted, `createDefaultErrorHandler()` is mounted: JSON `{ error, message, issues? }`, 5xx always `Internal Server Error`, 4xx echo `error.message`, `MulterError` becomes 413/400 and `UseCaseInputValidationError` becomes 422 with `issues`. A handler declared with fewer than 4 parameters throws at bootstrap |
| `openapi.documentation` | `OpenApiDocumentationOptions` | OpenAPI document metadata |
| `openapi.documentPath` | `string` | Path to serve the JSON document (default: `/docs/openapi.json`) |
| `openapi.documents` | `Record<string, OpenApiDocumentOptions>` | One OpenAPI document (and Scalar UI) per group |
| `enableScalar` | `boolean` | Mount the Scalar UI |
| `scalar` | `ScalarConfigurationOptions` | Scalar runtime options; `scalar.referencePath` sets the UI path (default: `/docs`). Everything under `scalar` is embedded in the public HTML, so never put real credentials there. The `Host` header is validated before it becomes the server URL; set `scalar.servers` to pin it |

---

## Public entrypoints

```
exjs-controllers
exjs-controllers/config/*
exjs-controllers/core/*
exjs-controllers/core/authentication
exjs-controllers/decorators/*
exjs-controllers/http/*
exjs-controllers/logging/*
exjs-controllers/metadata/*
exjs-controllers/observability/*
exjs-controllers/openapi/*
exjs-controllers/schemas/*
```

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## Releasing

Releases are automated: pushing a `vX.Y.Z` tag publishes to npm and creates the GitHub Release. See [RELEASING.md](./RELEASING.md).
