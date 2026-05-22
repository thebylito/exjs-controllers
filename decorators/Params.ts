import { legacyParamMap, type ParamType, type ParamMetadata } from '#exjs-controllers/metadata/legacyStorage'

function createParamDecorator(
  type: ParamType,
  name?: string,
  schemaClass?: new (...args: any[]) => object,
) {
  return function (target: object, propertyKey: string, parameterIndex: number): void {
    if (!legacyParamMap.has(target)) {
      legacyParamMap.set(target, new Map())
    }

    const methodMap = legacyParamMap.get(target)!
    if (!methodMap.has(propertyKey)) {
      methodMap.set(propertyKey, [])
    }

    const entry: ParamMetadata = { index: parameterIndex, type, name, schemaClass }
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
