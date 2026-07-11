// Shared postgres.js client (one pool per process: web server and worker).
import postgres from "postgres"
import { requireEnv } from "./env"

export type Sql = ReturnType<typeof postgres>

// The pool is created lazily on first use. Merely importing this module — as
// SvelteKit's build-time route analysis does — must not require DATABASE_URL;
// only actually querying does. This reads env at runtime, matching
// $env/dynamic/private semantics, and lets the app build with no env present.
let pool: Sql | undefined
function getPool(): Sql {
  if (!pool) {
    pool = postgres(requireEnv("DATABASE_URL"), {
      max: 10,
      onnotice: () => {},
      types: {
        // postgres.js returns int8/BIGINT as strings by default (to avoid
        // precision loss). All our ids (osu! user/beatmap/score ids) fit
        // comfortably within Number.MAX_SAFE_INTEGER, so parse them as numbers.
        // This keeps the `number` types honest and, crucially, lets id
        // comparisons against numeric values from the osu! API (e.g.
        // trackedUsers.has(score.user_id)) work.
        bigint: {
          to: 20,
          from: [20],
          serialize: (x: number | bigint) => x.toString(),
          parse: (x: string) => Number(x),
        },
      },
    })
  }
  return pool
}

// Callable + property-forwarding proxy so existing call sites (sql`...`,
// sql.json, sql.notify, sql.listen, sql.end, ...) work unchanged while the
// underlying pool stays lazy. Any first use instantiates the pool, validating
// DATABASE_URL at runtime with a clear error.
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getPool() as unknown as (...a: unknown[]) => unknown)(...args)
  },
  get(_target, prop: string | symbol) {
    const value = (getPool() as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === "function" ? value.bind(getPool()) : value
  },
}) as Sql
