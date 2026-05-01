import { z, type ZodRawShape } from 'zod'
import { classToZod } from '#exjs-controllers/core/ClassToZod'
import { TraceSpan } from '#exjs-controllers/decorators/TraceSpan'

type NonFunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? never : K
}[keyof T]

type BaseEntityData<T> = Pick<T, NonFunctionPropertyNames<T>>
type BaseEntityMergeData<T> = Partial<BaseEntityData<T>>

export abstract class BaseEntity {
  #originalValues?: Record<string, unknown>

  static toZod<T extends typeof BaseEntity>(this: T): z.ZodObject<ZodRawShape> {
    return classToZod(this as unknown as new (...args: unknown[]) => object)
  }

  static create<T extends typeof BaseEntity>(
    this: T,
    data?: BaseEntityData<InstanceType<T>> | undefined,
  ): InstanceType<T> {
    const EntityClass = this as unknown as new () => InstanceType<T>
    const entity = Object.assign(new EntityClass(), data ?? {}) as InstanceType<T> &
      BaseEntity

    entity.captureOriginalValuesIfPersisted()

    return entity as InstanceType<T>
  }

  merge<T extends BaseEntity, TData extends object>(
    this: T,
    data: TData & BaseEntityMergeData<T>,
  ): T & TData {
    Object.assign(this, data)
    this.captureOriginalValuesIfPersisted()

    return this as T & TData
  }

  @TraceSpan('BaseEntity.validate')
  validate(): void {
    const EntityClass = this.constructor as typeof BaseEntity & {
      toZod(): z.ZodObject<ZodRawShape>
    }

    EntityClass.toZod().parse(this)
  }

  getUpdateDiff(): Record<string, { oldValue: unknown; newValue: unknown }> {
    if (!this.hasPersistedId() || !this.#originalValues) {
      return {}
    }

    const currentValues = this.getComparableValues()
    const keys = new Set([
      ...Object.keys(this.#originalValues),
      ...Object.keys(currentValues),
    ])
    const diff: Record<string, { oldValue: unknown; newValue: unknown }> = {}

    for (const key of keys) {
      const oldValue = this.#originalValues[key]
      const newValue = currentValues[key]

      if (!Object.is(oldValue, newValue)) {
        diff[key] = { oldValue, newValue }
      }
    }

    return diff
  }

  markAsPersisted(persistedId?: string): this {
    const id =
      persistedId ??
      (this as Record<string, unknown>)._id ??
      (this as Record<string, unknown>).id

    if (id !== undefined && id !== null) {
      Object.defineProperty(this, '_id', {
        value: id,
        writable: true,
        configurable: true,
        enumerable: false,
      })
    }

    this.#originalValues = this.getComparableValues()

    return this
  }

  private hasPersistedId(): boolean {
    const id = (this as Record<string, unknown>)._id

    return id !== undefined && id !== null
  }

  private captureOriginalValuesIfPersisted(): void {
    if (!this.hasPersistedId() || this.#originalValues) {
      return
    }

    this.markAsPersisted()
  }

  private getComparableValues(): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(this).filter(([, value]) => typeof value !== 'function'),
    )
  }
}
