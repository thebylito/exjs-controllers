import { z, type ZodRawShape } from 'zod'
import { classToZod } from '#exjs-controllers/core/ClassToZod'
import { TraceSpan } from '#exjs-controllers/decorators/TraceSpan'

type NonFunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? never : K
}[keyof T]

type BaseSchemaData<T> = Pick<T, NonFunctionPropertyNames<T>>
type BaseSchemaMergeData<T> = Partial<BaseSchemaData<T>>

// Chaves que nunca podem ser copiadas de dados externos para o DTO: prototype
// pollution e sombreamento do protótipo da instância. Compartilhada com o
// filtro de @Body em core/Router.ts para que todo ingresso de DTO aplique o
// mesmo invariante.
export const FORBIDDEN_INGRESS_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

// True quando `key` resolve para um método (propriedade de dados cujo valor é
// função) na cadeia de protótipos — inspecionando descriptors, sem invocar
// getters de acessores (que podem exigir estado ainda não inicializado).
// Acessores (get/set) não são métodos: a atribuição via [[Set]] chama o setter,
// como o Object.assign sempre fez.
export function resolvesToFunctionMember(instance: object, key: PropertyKey): boolean {
  for (
    let current: object | null = instance;
    current;
    current = Object.getPrototypeOf(current)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor) {
      return typeof descriptor.value === 'function'
    }
  }

  return false
}

// Copia só chaves próprias enumeráveis (string e symbol, como o Object.assign),
// por atribuição simples: nunca Object.assign com dados crus (Object.assign usa
// [[Set]] e um `__proto__` próprio substitui o protótipo da instância). Chaves
// que resolvem para métodos na instância (`validate`, `merge`, `toString`,
// `hasOwnProperty`...) também ficam de fora.
function applyIngressData(
  instance: Record<PropertyKey, unknown>,
  data: Record<PropertyKey, unknown>,
): void {
  for (const key of Reflect.ownKeys(data)) {
    if (!Object.prototype.propertyIsEnumerable.call(data, key)) continue
    if (typeof key === 'string' && FORBIDDEN_INGRESS_KEYS.has(key)) continue
    if (resolvesToFunctionMember(instance, key)) continue
    instance[key] = data[key]
  }
}

export abstract class BaseSchema {
  static toZod<T extends typeof BaseSchema>(this: T): z.ZodObject<ZodRawShape> {
    return classToZod(this as unknown as new (...args: unknown[]) => object)
  }

  static create<T extends typeof BaseSchema>(
    this: T,
    data?: BaseSchemaData<InstanceType<T>> | undefined,
  ): InstanceType<T> {
    const SchemaClass = this as unknown as new () => InstanceType<T>
    const instance = new SchemaClass() as unknown as Record<PropertyKey, unknown>

    applyIngressData(instance, (data ?? {}) as Record<PropertyKey, unknown>)

    return instance as InstanceType<T>
  }

  merge<T extends BaseSchema, TData extends object>(
    this: T,
    data: TData & BaseSchemaMergeData<T>,
  ): T & TData {
    applyIngressData(this as unknown as Record<PropertyKey, unknown>, data as Record<PropertyKey, unknown>)

    return this as T & TData
  }

  @TraceSpan('BaseSchema.validate')
  validate(): void {
    const SchemaClass = this.constructor as typeof BaseSchema & {
      toZod(): z.ZodObject<ZodRawShape>
    }
    // Aplica transforms/defaults/coerções na instância; chaves fora do schema
    // (ex.: via merge()) são preservadas.
    const parsed = SchemaClass.toZod().parse(this)
    Object.assign(this, parsed)
  }
}
