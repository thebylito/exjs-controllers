import type { ZodType } from 'zod'
import { FIELD_METADATA } from '#exjs-controllers/metadata/symbols'
import { ownMetadataEntry } from '#exjs-controllers/metadata/ownMetadata'
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
      const fields = ownMetadataEntry<Record<string, ZodType>>(
        meta,
        FIELD_METADATA,
        () => ({}),
        (inherited) => ({ ...inherited }),
      )
      fields[ctx.name as string] = schema
      return
    }

    const proto = targetOrValue as object
    const key = ctxOrKey as string
    if (!legacyFieldMap.has(proto)) legacyFieldMap.set(proto, {})
    legacyFieldMap.get(proto)![key] = schema
  }
}
