import { z, type ZodRawShape } from 'zod'
import { classToZod } from '#exjs-controllers/core/ClassToZod'
import { TraceSpan } from '#exjs-controllers/decorators/TraceSpan.js'

type NonFunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? never : K
}[keyof T]

type BaseSchemaData<T> = Pick<T, NonFunctionPropertyNames<T>>
type BaseSchemaMergeData<T> = Partial<BaseSchemaData<T>>

export abstract class BaseSchema {
  static toZod<T extends typeof BaseSchema>(this: T): z.ZodObject<ZodRawShape> {
    return classToZod(this as unknown as new (...args: unknown[]) => object)
  }

  static create<T extends typeof BaseSchema>(
    this: T,
    data?: BaseSchemaData<InstanceType<T>> | undefined,
  ): InstanceType<T> {
    const SchemaClass = this as unknown as new () => InstanceType<T>

    return Object.assign(new SchemaClass(), data ?? {}) as InstanceType<T>
  }

  merge<T extends BaseSchema, TData extends object>(
    this: T,
    data: TData & BaseSchemaMergeData<T>,
  ): T & TData {
    Object.assign(this, data)

    return this as T & TData
  }

  @TraceSpan('BaseSchema.validate')
  validate(): void {
    const SchemaClass = this.constructor as typeof BaseSchema & {
      toZod(): z.ZodObject<ZodRawShape>
    }
    SchemaClass.toZod().parse(this)
  }
}
