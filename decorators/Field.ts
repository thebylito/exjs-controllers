import type { ZodType } from 'zod'
import { FIELD_METADATA } from '#exjs-controllers/metadata/symbols'
import { legacyFieldMap } from '#exjs-controllers/metadata/legacyStorage'

export function Field(schema: ZodType) {
  return function (
    targetOrValue: undefined | object,
    ctxOrKey: ClassFieldDecoratorContext | string,
  ): void {
    if (typeof ctxOrKey === 'object' && ctxOrKey !== null && 'metadata' in ctxOrKey) {
      const ctx = ctxOrKey as ClassFieldDecoratorContext
      const meta = ctx.metadata as Record<symbol, unknown>
      if (!meta) return
      if (!meta[FIELD_METADATA]) meta[FIELD_METADATA] = {} as Record<string, ZodType>
      ;(meta[FIELD_METADATA] as Record<string, ZodType>)[ctx.name as string] = schema
      return
    }

    const proto = targetOrValue as object
    const key = ctxOrKey as string
    if (!legacyFieldMap.has(proto)) legacyFieldMap.set(proto, {})
    legacyFieldMap.get(proto)![key] = schema
  }
}
