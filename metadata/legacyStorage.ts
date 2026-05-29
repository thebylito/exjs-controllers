import type { ZodType } from 'zod'
import type {
  RouteMetadata,
  ControllerMeta,
  InjectableMeta,
  InjectionToken,
  AuthorizationMetadata,
} from '#exjs-controllers/metadata/symbols'

export const legacyFieldMap = new WeakMap<object, Record<string, ZodType>>()
export const legacyRouteMap = new WeakMap<object, RouteMetadata[]>()
export const legacyControllerMap = new WeakMap<Function, ControllerMeta>()
export const legacyInjectableMap = new WeakMap<Function, InjectableMeta>()
export const legacyAuthorizationMap = new WeakMap<
  object,
  Map<string | symbol, AuthorizationMetadata>
>()

export type ParamType =
  | 'body'
  | 'param'
  | 'query'
  | 'query-all'
  | 'header'
  | 'req'
  | 'res'
  | 'current-user'
  | 'current-api-key'
  | 'uploaded-file'
  | 'uploaded-files'

// Subconjunto estrutural das opções do multer. Tipado aqui (sem importar de
// `multer`) porque @types/multer é devDependency da lib — referenciar os
// tipos do multer na API pública quebraria o typecheck de quem consome a lib
// sem esses types. `storage` fica como unknown: passa multer.diskStorage(...)
// / memoryStorage() direto, resolvido em runtime.
export interface MulterUploadOptions {
  dest?: string
  preservePath?: boolean
  storage?: unknown
  limits?: {
    fieldNameSize?: number
    fieldSize?: number
    fields?: number
    fileSize?: number
    files?: number
    parts?: number
    headerPairs?: number
  }
  fileFilter?: (
    req: unknown,
    file: unknown,
    callback: (error: Error | null, acceptFile?: boolean) => void,
  ) => void
}

export interface UploadOptions {
  // Opções repassadas ao multer nesta rota. Pode ser o objeto direto ou uma
  // factory (avaliada no registro da rota). Sem isso, usa memoryStorage do
  // multer (o arquivo fica em `buffer`).
  options?: MulterUploadOptions | (() => MulterUploadOptions)
}

// Formato do arquivo injetado por @UploadedFile/@UploadedFiles (espelha o
// Express.Multer.File, mas auto-contido para não exigir @types/multer no
// consumidor). Com memoryStorage, `buffer` está presente; com diskStorage,
// `path`/`filename`/`destination`.
export interface UploadedFileInfo {
  fieldname: string
  originalname: string
  encoding: string
  mimetype: string
  size: number
  buffer: Buffer
  destination?: string
  filename?: string
  path?: string
}

export interface ParamMetadata {
  index: number
  type: ParamType
  name?: string
  schemaClass?: new (...args: any[]) => object
  optional?: boolean
  uploadOptions?: UploadOptions
}

export const legacyParamMap = new WeakMap<object, Map<string, ParamMetadata[]>>()
export const legacyInjectionMap = new WeakMap<
  Function,
  Map<number, InjectionToken>
>()
