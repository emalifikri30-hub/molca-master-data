export async function resolve(specifier, context, nextResolve) {
  const local = specifier.startsWith("./") || specifier.startsWith("../");
  if (local && specifier.endsWith(".js")) {
    try {
      return await nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    } catch {
      return nextResolve(specifier, context);
    }
  }
  return nextResolve(specifier, context);
}
