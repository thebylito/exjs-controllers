import {
  ArrowsClockwise,
  BookOpenText,
  BracketsCurly,
  Cube,
  Files,
  Lightning,
  Lock,
  ShieldCheck,
  Sparkle,
  Stack,
  TerminalWindow,
  Waveform
} from '@phosphor-icons/react/dist/ssr'
import { Card, Cards } from 'fumadocs-ui/components/card'
import type { ComponentType } from 'react'

type OverviewItem = {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
}

const overviewItems: OverviewItem[] = [
  {
    title: 'Declarative Controllers',
    description:
      'Class-based controllers with `@Controller`, `@JsonController` and HTTP method decorators on top of Express 5.',
    icon: Stack
  },
  {
    title: 'DTOs With Zod',
    description:
      '`BaseSchema` + `@Field` collect Zod definitions, validate request bodies and feed the OpenAPI schema.',
    icon: BracketsCurly
  },
  {
    title: 'Authentication & Authorization',
    description:
      'Pluggable principal and authorization checkers with `@Authorized`, `@CurrentUser` and `@CurrentApiKey`.',
    icon: ShieldCheck
  },
  {
    title: 'OpenAPI + Scalar Out of the Box',
    description:
      'Auto-generated OpenAPI 3.1 document and Scalar reference UI served by `configureApplication`.',
    icon: BookOpenText
  }
]

export function OverviewCards() {
  return (
    <Cards>
      {overviewItems.map(({ title, description, icon: Icon }) => (
        <Card
          key={title}
          icon={<Icon className="size-5" />}
          title={title}
          description={description}
        />
      ))}
    </Cards>
  )
}

type ExportItem = {
  name: string
  source: string
  description: string
  icon: ComponentType<{ className?: string }>
}

const exportItems: ExportItem[] = [
  {
    name: 'Application',
    source: 'exjs-controllers/http/application',
    description: '`createApplication()` factory returning the typed `Application` wrapper around Express.',
    icon: Cube
  },
  {
    name: 'Configuration',
    source: 'exjs-controllers/config/configureApplication',
    description: '`configureApplication(app, options)` wires controllers, middlewares, auth, logging, OpenAPI and Scalar.',
    icon: ArrowsClockwise
  },
  {
    name: 'Decorators',
    source: 'exjs-controllers/decorators/*',
    description: 'Controllers, routes, params, DI, authorization, use cases and tracing decorators.',
    icon: Sparkle
  },
  {
    name: 'Schemas',
    source: 'exjs-controllers/schemas/BaseSchema',
    description: '`BaseSchema` base class plus `@Field` for declarative Zod-backed DTOs.',
    icon: BracketsCurly
  },
  {
    name: 'Authentication',
    source: 'exjs-controllers/core/authentication',
    description: 'Auth types, principal kinds, `UnauthorizedError` / `ForbiddenError` and middleware factory.',
    icon: Lock
  },
  {
    name: 'OpenAPI',
    source: 'exjs-controllers/openapi/generateOpenApiDocument',
    description: 'Programmatic OpenAPI 3.1 document generation from controller metadata.',
    icon: Files
  },
  {
    name: 'Observability',
    source: 'exjs-controllers/observability/tracing',
    description: '`runWithSpan` / `runWithControllerSpan` helpers backed by `@opentelemetry/api`.',
    icon: Waveform
  },
  {
    name: 'Logging',
    source: 'exjs-controllers/logging/*',
    description: 'Pino-based HTTP logger middleware with correlation IDs and async-local request context.',
    icon: TerminalWindow
  }
]

export function ExportGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 not-prose">
      {exportItems.map(({ name, source, description, icon: Icon }) => (
        <div
          key={source}
          className="rounded-2xl border bg-fd-card p-5 shadow-sm">
          <div className="mb-3 inline-flex rounded-xl border bg-fd-secondary p-2 text-fd-primary">
            <Icon className="size-5" />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-base font-semibold text-fd-foreground">
              {name}
            </h3>
            <code className="rounded-md bg-fd-secondary px-2 py-1 text-xs">
              {source}
            </code>
          </div>
          <p className="text-sm leading-6 text-fd-muted-foreground">
            {description}
          </p>
        </div>
      ))}
    </div>
  )
}

export function SetupSteps() {
  return (
    <div className="grid gap-4 md:grid-cols-3 not-prose">
      <div className="rounded-2xl border bg-fd-card p-5 shadow-sm">
        <span className="mb-3 inline-flex size-8 items-center justify-center rounded-full border text-sm font-semibold text-fd-primary">
          1
        </span>
        <h3 className="mb-2 text-base font-semibold">Install</h3>
        <p className="text-sm leading-6 text-fd-muted-foreground">
          Add `exjs-controllers` to your project alongside its peers `express ^5`, `zod ^4` and Node.js `{'>=20'}`.
        </p>
      </div>
      <div className="rounded-2xl border bg-fd-card p-5 shadow-sm">
        <span className="mb-3 inline-flex size-8 items-center justify-center rounded-full border text-sm font-semibold text-fd-primary">
          2
        </span>
        <h3 className="mb-2 text-base font-semibold">Declare</h3>
        <p className="text-sm leading-6 text-fd-muted-foreground">
          Write `@Controller` classes, declare DTOs that extend `BaseSchema` and annotate fields with `@Field(z....)`.
        </p>
      </div>
      <div className="rounded-2xl border bg-fd-card p-5 shadow-sm">
        <span className="mb-3 inline-flex size-8 items-center justify-center rounded-full border text-sm font-semibold text-fd-primary">
          3
        </span>
        <h3 className="mb-2 text-base font-semibold">Bootstrap</h3>
        <p className="text-sm leading-6 text-fd-muted-foreground">
          Call `configureApplication(app, options)` to register controllers, expose OpenAPI and (optionally) mount Scalar.
        </p>
      </div>
    </div>
  )
}

type FeatureItem = {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
}

const featureItems: FeatureItem[] = [
  {
    title: 'Dependency Injection',
    description:
      'Singleton-by-default container with `@Injectable` and constructor `@Inject(token)` parameters.',
    icon: Cube
  },
  {
    title: 'Use Cases',
    description:
      '`@DefineUseCase` traces and validates `execute(input)` so controllers can dispatch business logic with confidence.',
    icon: Lightning
  },
  {
    title: 'OpenAPI From Metadata',
    description:
      '`inputClass` and `outputClass` on routes produce request/response schemas in the generated spec.',
    icon: Files
  },
  {
    title: 'Tracing With OpenTelemetry',
    description:
      'Controller handlers and `@DefineUseCase` calls run inside spans; `@TraceSpan` wraps any method.',
    icon: Waveform
  }
]

export function FeatureGrid() {
  return (
    <Cards>
      {featureItems.map(({ title, description, icon: Icon }) => (
        <Card
          key={title}
          icon={<Icon className="size-5" />}
          title={title}
          description={description}
        />
      ))}
    </Cards>
  )
}
