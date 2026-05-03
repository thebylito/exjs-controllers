import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { ControllerDiscoveryOptions } from '#exjs-controllers/config/expressServerOptions'
import type { ControllerClass } from '#exjs-controllers/core/Router'
import { legacyControllerMap } from '#exjs-controllers/metadata/legacyStorage'
import { getControllerFromMeta } from '#exjs-controllers/metadata/symbols'

const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.cts'])
const BUILD_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])

export async function discoverControllers(
  options: ControllerDiscoveryOptions = {},
): Promise<ControllerClass[]> {
  const directories = await resolveDiscoveryDirectories(options)
  const controllerFiles = (
    await Promise.all(directories.map((directory) => walkControllerFiles(directory)))
  )
    .flat()
    .sort((left, right) => left.localeCompare(right))

  const controllers = new Set<ControllerClass>()

  for (const controllerFile of controllerFiles) {
    const moduleExports = await importControllerModule(controllerFile)

    for (const exportedValue of Object.values(moduleExports)) {
      if (isDecoratedController(exportedValue)) {
        controllers.add(exportedValue)
      }
    }
  }

  if (controllers.size > 0) {
    return [...controllers]
  }

  throw new Error(
    `[ControllerDiscovery] Nenhum controller decorado foi encontrado nos diretórios: ${directories.join(', ')}`,
  )
}

async function resolveDiscoveryDirectories(
  options: ControllerDiscoveryOptions,
): Promise<string[]> {
  const rootDir = options.rootDir ?? process.cwd()
  const directories = options.directories ?? ['src', 'dist/src']
  const resolvedDirectories = directories.map((directory) =>
    path.resolve(rootDir, directory),
  )
  const existingDirectories: string[] = []

  for (const directory of resolvedDirectories) {
    if (await pathExists(directory)) {
      existingDirectories.push(directory)
    }
  }

  if (existingDirectories.length > 0) {
    return existingDirectories
  }

  throw new Error(
    `[ControllerDiscovery] Nenhum diretório de busca foi encontrado a partir de ${rootDir}`,
  )
}

async function walkControllerFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await walkControllerFiles(fullPath)))
      continue
    }

    if (entry.isFile() && isControllerFile(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

function isControllerFile(fileName: string): boolean {
  const parsedPath = path.parse(fileName)
  return (
    parsedPath.name.endsWith('.controller') &&
    runtimeExtensions().has(parsedPath.ext)
  )
}

async function importControllerModule(
  controllerFile: string,
): Promise<Record<string, unknown>> {
  try {
    return (await import(pathToFileURL(controllerFile).href)) as Record<
      string,
      unknown
    >
  } catch (error) {
    throw new Error(
      `[ControllerDiscovery] Falha ao importar controller em ${controllerFile}`,
      { cause: error },
    )
  }
}

function isDecoratedController(value: unknown): value is ControllerClass {
  if (typeof value !== 'function') {
    return false
  }

  const metadata = (value as { [Symbol.metadata]?: DecoratorMetadata })[
    Symbol.metadata
  ]
  return Boolean(getControllerFromMeta(metadata) ?? legacyControllerMap.get(value))
}

function runtimeExtensions(): ReadonlySet<string> {
  return new Set([...SOURCE_EXTENSIONS, ...BUILD_EXTENSIONS])
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}
