export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\/.*\.js$/.test(specifier)) {
      return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
    }
    throw err;
  }
}
