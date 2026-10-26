/**
 * load-env.ts — startup secret loader for the published site.
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * The owner saved SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the platform
 * Secrets panel, but they never appeared in this process's environment (checked
 * across restarts 5 days apart, and in every shell). The documented workaround
 * is to read a file in the site directory at startup, so the values live next to
 * the app that needs them.
 *
 * HOW IT BEHAVES
 *  - Reads `<siteDir>/.env.local`, then `<siteDir>/.env` (first one wins).
 *  - NEVER overrides a value already present in process.env, so real platform
 *    injection always takes precedence over the file.
 *  - Logs ONLY the variable NAMES it loaded — never a value, not even a prefix.
 *  - Missing file is normal, not an error: the site must still boot.
 *
 * IMPORTANT: this file must be imported BEFORE any module that reads
 * process.env at module scope. ES module evaluation follows import order, so
 * keeping `import "./load-env.ts";` as the first import in serve.ts is what
 * makes that guarantee hold.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE_DIR = import.meta.dir;
const FILES = [".env.local", ".env"];

/** Minimal dotenv parser: KEY=VALUE per line, # comments, optional quotes. */
const parse = (raw: string): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.push([key, value]);
  }
  return out;
};

const loaded: string[] = [];

for (const file of FILES) {
  const path = join(SITE_DIR, file);
  if (!existsSync(path)) continue;
  let parsed: Array<[string, string]>;
  try {
    parsed = parse(readFileSync(path, "utf8"));
  } catch {
    console.warn(`[env] could not read ${file}`);
    continue;
  }
  for (const [key, value] of parsed) {
    // Empty values are placeholders, not settings — skip them so a blank
    // template line can never shadow a real platform-injected value.
    if (value === "") continue;
    if (process.env[key] !== undefined) continue; // platform injection wins
    process.env[key] = value;
    loaded.push(key);
  }
}

if (loaded.length > 0) {
  // Names only. Never values.
  console.log(`[env] loaded from file: ${[...new Set(loaded)].sort().join(", ")}`);
}
