import type { MulterUploadOptions } from '#exjs-controllers/metadata/legacyStorage'

export type UploadLimits = NonNullable<MulterUploadOptions['limits']>

// Limites padrão do multer aplicados a toda rota de upload. O consumidor
// sobrescreve só as chaves que informar em `options.limits`. `files` vale por
// requisição (não por campo).
export const DEFAULT_UPLOAD_LIMITS: Readonly<Required<UploadLimits>> = Object.freeze({
  fileSize: 16 * 1024 * 1024,
  files: 10,
  fields: 100,
  parts: 200,
  fieldNameSize: 100,
  fieldSize: 1024 * 1024,
  headerPairs: 2000,
  fieldNestingDepth: 5,
  fieldArrayIndexLimit: 100,
})

export function resolveUploadLimits(limits: UploadLimits | undefined): Required<UploadLimits> {
  const resolved: Required<UploadLimits> = { ...DEFAULT_UPLOAD_LIMITS }
  if (limits) {
    for (const key of Object.keys(limits) as (keyof UploadLimits)[]) {
      const value = limits[key]
      if (value !== undefined) {
        resolved[key] = value
      }
    }
  }
  return resolved
}
