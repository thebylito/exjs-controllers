import { z, type ZodRawShape } from 'zod'
import { getFieldsFromMeta } from '#exjs-controllers/metadata/symbols'
import { legacyFieldMap } from '#exjs-controllers/metadata/legacyStorage'

export function classToZod(Cls: new (...args: any[]) => object): z.ZodObject<ZodRawShape> {
  const meta = (Cls as unknown as { [Symbol.metadata]?: DecoratorMetadata })[Symbol.metadata]
  const fields = getFieldsFromMeta(meta)

  if (Object.keys(fields).length > 0) {
    return z.object(fields as ZodRawShape)
  }

  const legacyFields = legacyFieldMap.get(Cls.prototype)
  if (legacyFields && Object.keys(legacyFields).length > 0) {
    return z.object(legacyFields as ZodRawShape)
  }

  return z.object({})
}

export function classToZodOrUndefined(
  Cls: (new (...args: any[]) => object) | undefined,
): z.ZodObject<ZodRawShape> | undefined {
  if (!Cls) return undefined
  const schema = classToZod(Cls)
  return Object.keys(schema.shape).length > 0 ? schema : undefined
}

export type InferOutput<_T extends new (...args: any[]) => object> = z.infer<z.ZodObject<ZodRawShape>>
