import { CONTROLLER_METADATA, type ControllerMeta } from '#exjs-controllers/metadata/symbols'
import { legacyControllerMap } from '#exjs-controllers/metadata/legacyStorage'

export function Controller(prefix: string) {
  return createControllerDecorator(prefix, 'default')
}

export function JsonController(prefix: string) {
  return createControllerDecorator(prefix, 'json')
}

function createControllerDecorator(
  prefix: string,
  responseMode: ControllerMeta['responseMode'],
) {
  return function (
    target: new (...args: any[]) => object,
    ctxOrUndefined?: ClassDecoratorContext,
  ): void {
    if (ctxOrUndefined && typeof ctxOrUndefined === 'object' && 'metadata' in ctxOrUndefined) {
      const meta = ctxOrUndefined.metadata as Record<symbol, unknown>
      meta[CONTROLLER_METADATA] = { prefix, responseMode, target } satisfies ControllerMeta
      return
    }

    legacyControllerMap.set(target, { prefix, responseMode, target })
  }
}
