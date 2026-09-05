# exjs-controllers

Declarative controllers, DTO validation, dependency injection, OpenAPI generation and Express bootstrap for TypeScript APIs.

📖 **Documentation:** https://thebylito.github.io/exjs-controllers/

## Install

```bash
npm install exjs-controllers express zod
```

Peer dependencies: `express ^5`, `zod ^4`.

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

### `@Controller(prefix)`

Registers a class as a controller. All routes inside will be prefixed with `prefix`.

```ts
@Controller('/users')
class UsersController { ... }
```

### `@JsonController(prefix)`

Like `@Controller`, but automatically serialises the return value with `res.json()` instead of `res.send()`.

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
```

### `RouteOptions`

| Property | Type | Description |
|---|---|---|
| `inputClass` | `typeof BaseSchema` | DTO class used to validate and document the request body |
| `outputClass` | `typeof BaseSchema` | DTO class used to document the response body |
| `outputIsArray` | `boolean` | When `true`, the OpenAPI response schema is wrapped as `{ type: 'array', items: <outputClass schema> }` |
| `summary` | `string` | Short description shown in the OpenAPI docs |
| `description` | `string` | Long description shown in the OpenAPI docs |
| `tags` | `string[]` | OpenAPI tags for grouping |

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
| `@Body(schemaClass?)` | `req.body` — optionally hydrates into an instance of `schemaClass` |
| `@Param(name)` | `req.params[name]` |
| `@QueryParam(name)` | `req.query[name]` |
| `@QueryParams()` | `req.query` (entire object) |
| `@HeaderParam(name)` | `req.headers[name]` |
| `@Req()` | The raw Express `Request` object |
| `@Res()` | The raw Express `Response` object |
| `@SessionContext()` | The authenticated session (`AuthenticationContext`) — throws `401` if no active session |
| `@UploadedFile(field, options?)` | A single uploaded file from a `multipart/form-data` field (via [multer](https://github.com/expressjs/multer)) |
| `@UploadedFiles(field, options?)` | All uploaded files from a `multipart/form-data` field (array) |

```ts
@Controller('/orders')
class OrdersController {
  @Post('/')
  create(
    @Body(CreateOrderInput) input: CreateOrderInput,
    @SessionContext() session: SessionContext,
  ) {
    console.log('Created by', session.subject)
    return this.orderService.create(input)
  }

  @Get('/:id')
  findOne(
    @Param('id') id: string,
    @QueryParam('expand') expand?: string,
  ) { ... }
}
```

> `SessionContext` (the type) is re-exported from `exjs-controllers/decorators/Params` for convenience and is identical to `AuthenticationContext`.

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

Marks a class as injectable. By default creates a singleton — set `{ singleton: false }` to create a new instance on every injection.

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

### Configuration

Pass `authentication` to `configureApplication` to enable OAuth2 token introspection:

```ts
await configureApplication(app, {
  controllers: [...],
  authentication: {
    provider: {
      type: 'oauth2',
      name: 'my-provider',
      // Option A — direct introspection endpoint
      introspection: {
        url: 'https://auth.example.com/introspect',
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
      },
      // Option B — discovery document (auto-resolves introspection URL)
      // discovery: { url: 'https://auth.example.com/.well-known/openid-configuration', ... }
    },
  },
})
```

### `@Authorized(...scopes)`

Protects a route. The request must carry a valid Bearer token with all listed scopes.

```ts
@Controller('/admin')
class AdminController {
  @Authorized('admin:read')
  @Get('/users')
  listUsers() { ... }

  @Authorized('admin:write')
  @Delete('/users/:id')
  deleteUser(@Param('id') id: string) { ... }
}
```

### `@SessionContext()`

Injects the authenticated session into a parameter. Responds with `401` if there is no active session.

```ts
@Get('/me')
getMe(@SessionContext() session: SessionContext) {
  return { subject: session.subject, scopes: session.scopes }
}
```

### `AuthenticationContext`

```ts
interface AuthenticationContext {
  provider: string
  scheme: 'oauth2' | 'session'
  subject?: string
  scopes: string[]
  claims: Record<string, unknown>
}
```

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

`generateOpenApiDocument(controllers, options)` builds an OpenAPI 3.1 document from the metadata registered by route decorators.

```ts
import { generateOpenApiDocument } from 'exjs-controllers/openapi/generateOpenApiDocument'

const document = generateOpenApiDocument([UsersController], options)
```

### Serving via `configureApplication`

When `openapi.documentation` is set, the document is automatically served at `/docs/openapi.json` (configurable via `openapi.documentPath`).

When `enableScalar: true` is set, Scalar API reference is served at `/docs` (configurable via `openapi.scalarPath`).

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
| `controllers` | `ControllerClass[]` | List of controller classes to register |
| `discovery` | `ControllerDiscoveryOptions` | Dynamically discover controllers from directories |
| `middlewares` | `MiddlewareRegistration[]` | Express middlewares to apply before controllers |
| `authentication` | `OAuth2AuthenticationOptions` | OAuth2 provider for `@Authorized` routes |
| `logger` | `HttpLoggerOptions` | Attach a Pino HTTP logger |
| `openapi.documentation` | `OpenApiDocumentationOptions` | OpenAPI document metadata |
| `openapi.documentPath` | `string` | Path to serve the JSON document (default: `/docs/openapi.json`) |
| `openapi.scalarPath` | `string` | Path to serve Scalar reference (default: `/docs`) |
| `enableScalar` | `boolean` | Mount the Scalar UI |

---

## Public entrypoints

```
exjs-controllers
exjs-controllers/authentication/*
exjs-controllers/config/*
exjs-controllers/core/*
exjs-controllers/decorators/*
exjs-controllers/entities/*
exjs-controllers/http/*
exjs-controllers/logging/*
exjs-controllers/metadata/*
exjs-controllers/observability/*
exjs-controllers/openapi/*
exjs-controllers/schemas/*
```

---

## Changelog

### 0.3.0

- **`@SessionContext()`** — new parameter decorator that injects `AuthenticationContext` into a handler. Responds `401` automatically when no active session exists.
- **`outputIsArray`** in `RouteOptions` — when `true`, the OpenAPI response schema is generated as an array of `outputClass` items.
- **`classToZod` inheritance** — `@Field` decorators declared on parent DTO classes are now included when building the Zod schema for child classes.
- **`DefineUseCase` extra args** — `execute(input, ...extraArgs)` now forwards arguments that appear after the first `BaseSchema` parameter.

### 0.2.1

- Fix import path for `TraceSpan`.

### 0.2.0

- Initial public release with controllers, DI, OpenAPI generation and Scalar integration.

---

## Publish

```bash
npm run publish:dry-run   # preview what will be published
npm publish               # publish to npm
```
