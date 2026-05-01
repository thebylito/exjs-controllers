# exjs-controllers

Declarative controllers, DTO validation, dependency injection, OpenAPI generation and Express bootstrap for TypeScript APIs.

## Install

```bash
npm install exjs-controllers express zod
```

## What it provides

- controller and route decorators
- constructor-based dependency injection
- DTO validation backed by Zod
- OpenAPI document generation and Scalar integration
- Express application bootstrap helpers

## Basic usage

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
  @Get('/', {
    outputClass: HealthOutput,
    summary: 'Health check',
    tags: ['health'],
  })
  getHealth(): HealthOutput {
    return HealthOutput.create().merge({ status: 'ok' }) as HealthOutput
  }
}

const app = createApplication()

await configureApplication(app, {
  controllers: [HealthController],
  openapi: {
    documentation: {
      info: {
        title: 'Example API',
        version: '1.0.0',
      },
    },
  },
  enableScalar: true,
})

app.listen(3000)
```

## Public entrypoints

- `exjs-controllers`
- `exjs-controllers/config/*`
- `exjs-controllers/authentication/*`
- `exjs-controllers/core/*`
- `exjs-controllers/decorators/*`
- `exjs-controllers/entities/*`
- `exjs-controllers/http/*`
- `exjs-controllers/logging/*`
- `exjs-controllers/metadata/*`
- `exjs-controllers/observability/*`
- `exjs-controllers/openapi/*`
- `exjs-controllers/schemas/*`

## Publish checklist

- choose and add a project license before public release
- run `npm run publish:dry-run`
- publish with `npm publish`
