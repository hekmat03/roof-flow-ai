/**
 * Minimal ESM resolve hook so the check scripts can import the app's
 * TypeScript sources directly under `node --experimental-strip-types`.
 *
 * Handles the two styles this repo mixes:
 *   - `./foo.js`      → `./foo.ts`   (TS-style ESM specifiers)
 *   - `./foo`         → `./foo.ts`   (extensionless, as used by src/utils/*)
 *   - `./dir`         → `./dir/index.ts`
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function tryVariant(specifier, context) {
  const candidates = [];
  if (/^\.{1,2}\/.*\.js$/.test(specifier)) {
    candidates.push(specifier.replace(/\.js$/, '.ts'));
  } else if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    candidates.push(`${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`, `${specifier}/index.tsx`);
  }
  return candidates;
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      for (const candidate of tryVariant(specifier, context)) {
        try {
          return await nextResolve(candidate, context);
        } catch {
          // try the next candidate
        }
      }
      // Last resort: if a real file exists at the parent-relative path, hand
      // Node the file URL directly.
      if (/^\.{1,2}\//.test(specifier) && context?.parentURL) {
        const url = new URL(specifier, context.parentURL);
        const path = fileURLToPath(url);
        for (const candidate of [`${path}.ts`, `${path}.tsx`]) {
          if (existsSync(candidate)) return { url: new URL(`file://${candidate}`).href, shortCircuit: true };
        }
      }
    }
    throw err;
  }
}
