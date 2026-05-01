import {
  legacyInjectableMap,
  legacyInjectionMap,
} from '#exjs-controllers/metadata/legacyStorage'
import {
  getInjectableFromMeta,
  type InjectableMeta,
  type InjectionToken,
} from '#exjs-controllers/metadata/symbols'

type ResolvableClass<T = unknown> = new (...args: any[]) => T

const singletonInstances = new Map<InjectionToken, unknown>()

export function resetDependencyContainerForTests(): void {
  singletonInstances.clear()
}

export function resolveDependency<T>(token: InjectionToken<T>): T {
  return resolveClass(token, [])
}

function resolveClass<T>(target: ResolvableClass<T>, resolutionPath: Function[]): T {
  if (resolutionPath.includes(target)) {
    const cycle = [...resolutionPath, target].map((entry) => entry.name).join(' -> ')
    throw new Error(`[DependencyInjection] Dependência circular detectada: ${cycle}`)
  }

  const injectableMeta = getInjectableMeta(target)

  if (injectableMeta?.singleton && singletonInstances.has(target)) {
    return singletonInstances.get(target) as T
  }

  const injections = legacyInjectionMap.get(target)
  const args = buildConstructorArgs(injections, [...resolutionPath, target])
  const instance = new target(...args)

  if (injectableMeta?.singleton) {
    singletonInstances.set(target, instance)
  }

  return instance
}

function buildConstructorArgs(
  injections: Map<number, InjectionToken> | undefined,
  resolutionPath: Function[],
): unknown[] {
  if (!injections || injections.size === 0) {
    return []
  }

  const lastIndex = Math.max(...injections.keys())
  const args = new Array(lastIndex + 1).fill(undefined)

  for (const [index, token] of injections.entries()) {
    args[index] = resolveClass(token, resolutionPath)
  }

  return args
}

function getInjectableMeta(target: Function): InjectableMeta | undefined {
  const meta = (target as { [Symbol.metadata]?: DecoratorMetadata })[Symbol.metadata]
  return getInjectableFromMeta(meta) ?? legacyInjectableMap.get(target)
}
