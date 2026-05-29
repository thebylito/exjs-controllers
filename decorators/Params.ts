import {
  legacyParamMap,
  type ParamType,
  type ParamMetadata,
  type UploadOptions,
} from '#exjs-controllers/metadata/legacyStorage'

export type {
  UploadOptions,
  MulterUploadOptions,
  UploadedFileInfo,
} from '#exjs-controllers/metadata/legacyStorage'

function createParamDecorator(
  type: ParamType,
  name?: string,
  schemaClass?: new (...args: any[]) => object,
  uploadOptions?: UploadOptions,
) {
  return function (target: object, propertyKey: string, parameterIndex: number): void {
    if (!legacyParamMap.has(target)) {
      legacyParamMap.set(target, new Map())
    }

    const methodMap = legacyParamMap.get(target)!
    if (!methodMap.has(propertyKey)) {
      methodMap.set(propertyKey, [])
    }

    const entry: ParamMetadata = {
      index: parameterIndex,
      type,
      name,
      schemaClass,
      uploadOptions,
    }
    methodMap.get(propertyKey)!.push(entry)
  }
}

export function Body(schemaClass?: new (...args: any[]) => object) {
  return createParamDecorator('body', undefined, schemaClass)
}

export function Param(name: string) {
  return createParamDecorator('param', name)
}

export function QueryParam(name: string) {
  return createParamDecorator('query', name)
}

export function QueryParams() {
  return createParamDecorator('query-all')
}

export function HeaderParam(name: string) {
  return createParamDecorator('header', name)
}

export function Req() {
  return createParamDecorator('req')
}

export function Res() {
  return createParamDecorator('res')
}

// Injeta um único arquivo enviado em multipart/form-data no campo `name`
// (via multer). Em `options` dá para passar opções do multer (storage,
// limits, fileFilter). Sem options, usa memoryStorage (arquivo em `buffer`).
export function UploadedFile(name: string, options?: UploadOptions) {
  return createParamDecorator('uploaded-file', name, undefined, options)
}

// Injeta todos os arquivos enviados no campo `name` (array). Mesmas opções
// do @UploadedFile.
export function UploadedFiles(name: string, options?: UploadOptions) {
  return createParamDecorator('uploaded-files', name, undefined, options)
}
