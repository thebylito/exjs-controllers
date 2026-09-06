import { CONTROLLER_METADATA, type ControllerMeta } from '#exjs-controllers/metadata/symbols'
import { legacyControllerMap } from '#exjs-controllers/metadata/legacyStorage'

export interface ControllerOptions {
  /**
   * Grupo de documentação OpenAPI padrão para as rotas do controller. Só afeta
   * quais documentos incluem as rotas (ver `openapi.documents`); não muda o
   * roteamento. Rotas podem sobrescrever com `RouteOptions.group`.
   */
  group?: string
}

export function Controller(prefix: string, options?: ControllerOptions) {
  return createControllerDecorator(prefix, 'default', options)
}

export function JsonController(prefix: string, options?: ControllerOptions) {
  return createControllerDecorator(prefix, 'json', options)
}

function createControllerDecorator(
  prefix: string,
  responseMode: ControllerMeta['responseMode'],
  options: ControllerOptions = {},
) {
  return function (
    target: new (...args: any[]) => object,
    ctxOrUndefined?: ClassDecoratorContext,
  ): void {
    const controllerMeta: ControllerMeta = {
      prefix,
      responseMode,
      ...(options.group !== undefined ? { group: options.group } : {}),
      target,
    }

    if (ctxOrUndefined && typeof ctxOrUndefined === 'object' && 'metadata' in ctxOrUndefined) {
      const meta = ctxOrUndefined.metadata as Record<symbol, unknown>
      meta[CONTROLLER_METADATA] = controllerMeta
      return
    }

    legacyControllerMap.set(target, controllerMeta)
  }
}
