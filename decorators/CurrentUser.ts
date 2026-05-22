import {
  legacyParamMap,
  type ParamMetadata,
  type ParamType,
} from '#exjs-controllers/metadata/legacyStorage'

export type PrincipalDecoratorOptions = { optional?: boolean }

function createPrincipalDecorator(type: ParamType) {
  return function (options?: PrincipalDecoratorOptions) {
    return function (
      target: object,
      propertyKey: string,
      parameterIndex: number,
    ): void {
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
        optional: options?.optional,
      }
      methodMap.get(propertyKey)!.push(entry)
    }
  }
}

export const CurrentUser = createPrincipalDecorator('current-user')
export const CurrentApiKey = createPrincipalDecorator('current-api-key')
