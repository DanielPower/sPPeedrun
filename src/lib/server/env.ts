// Runtime env access shared by the SvelteKit server and the standalone worker.
//
// These read process.env *at runtime, never at import/build* — the same
// semantics as SvelteKit's $env/dynamic/private, which for adapter-node is
// "equivalent to process.env". We can't use $env/dynamic/private directly here
// because these modules are also imported by the worker, which runs outside
// SvelteKit (via tsx) and can't resolve the $env virtual module. Reading at
// runtime means the app builds with no env present and secrets are never
// inlined into the build output.
//
// dotenv loads .env into process.env for local dev (neither Vite nor a bare
// node/tsx process does this on its own). In production the real environment
// wins — dotenv never overrides variables that are already set.
import "dotenv/config"

/**
 * Read a required private env var. Evaluated on use (runtime), so importing a
 * module that calls this does not require the variable to exist at build time.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
