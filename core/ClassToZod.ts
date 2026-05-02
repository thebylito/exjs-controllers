import { z, type ZodRawShape } from 'zod'
import { getFieldsFromMeta } from '#exjs-controllers/metadata/symbols'
import { legacyFieldMap } from '#exjs-controllers/metadata/legacyStorage'

export function classToZod(Cls: new (...args: any[]) => object): z.ZodObject<ZodRawShape> {
  // Collect fields walking up the prototype chain so inherited @Field decorators
  // are included. Parent fields are collected first; child fields override them.
  const ancestors: Function[] = []
  let current: Function | null = Cls
  while (current && current !== Object && current !== Function) {
    ancestors.unshift(current)
    current = Object.getPrototypeOf(current) as Function | null
  }

  const allFields: ZodRawShape = {}
  for (const ancestor of ancestors) {
    const meta = (ancestor as unknown as { [Symbol.metadata]?: DecoratorMetadata })[
      Symbol.metadata
    ]
    const fields = getFieldsFromMeta(meta)
    Object.assign(allFields, fields)

    const legacyFields = legacyFieldMap.get(ancestor.prototype as object)
    if (legacyFields) {
      Object.assign(allFields, legacyFields)
    }
  }

  return z.object(allFields)
}

export function classToZodOrUndefined(
  Cls: (new (...args: any[]) => object) | undefined,
): z.ZodObject<ZodRawShape> | undefined {
  if (!Cls) return undefined
  const schema = classToZod(Cls)
  return Object.keys(schema.shape).length > 0 ? schema : undefined
}

export type InferOutput<_T extends new (...args: any[]) => object> = z.infer<z.ZodObject<ZodRawShape>>
