import {
  INJECTABLE_METADATA,
  type InjectableMeta,
  type InjectionToken,
} from '#exjs-controllers/metadata/symbols'
import {
  legacyInjectableMap,
  legacyInjectionMap,
} from '#exjs-controllers/metadata/legacyStorage'

export interface InjectableOptions {
  /*
   * Define se a classe deve ser tratada como singleton. O padrão é `true`, ou seja, uma única instância será criada e compartilhada.
   * Se definido como `false`, uma nova instância será criada cada vez que a classe for injetada.
   */
  singleton?: boolean
}

export function Injectable(options: InjectableOptions = {}) {
  const singleton = options.singleton ?? true

  return function (
    target: new (...args: any[]) => object,
    ctxOrUndefined?: ClassDecoratorContext,
  ): void {
    const injectableMeta: InjectableMeta = { singleton, target }

    if (
      ctxOrUndefined &&
      typeof ctxOrUndefined === 'object' &&
      'metadata' in ctxOrUndefined
    ) {
      const meta = ctxOrUndefined.metadata as Record<symbol, unknown>
      meta[INJECTABLE_METADATA] = injectableMeta
      return
    }

    legacyInjectableMap.set(target, injectableMeta)
  }
}

export function Inject(token: InjectionToken) {
  return function (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void {
    if (propertyKey !== undefined) {
      throw new Error(
        '[DependencyInjection] @Inject só pode ser usado em parâmetros do construtor.',
      )
    }

    const ctor = target as Function

    if (!legacyInjectionMap.has(ctor)) {
      legacyInjectionMap.set(ctor, new Map())
    }

    legacyInjectionMap.get(ctor)!.set(parameterIndex, token)
  }
}
