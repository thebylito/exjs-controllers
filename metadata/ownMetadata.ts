/**
 * Copy-on-write da metadata TC39. A metadata de uma subclasse é criada com
 * `Object.create(metadataDoPai)`, então `metadata[key]` resolve para a entrada
 * do pai. Mutá-la vazaria para a classe pai; por isso, se a chave não for
 * própria, a entrada herdada é clonada (ou criada) e gravada como própria.
 */
export function ownMetadataEntry<T>(
  metadata: Record<symbol, unknown>,
  key: symbol,
  create: () => T,
  clone: (inherited: T) => T,
): T {
  if (Object.hasOwn(metadata, key)) return metadata[key] as T
  const inherited = metadata[key] as T | undefined
  const own = inherited === undefined ? create() : clone(inherited)
  metadata[key] = own
  return own
}
