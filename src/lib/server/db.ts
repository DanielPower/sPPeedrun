// Shared postgres.js client. A single connection pool is reused across the
// SvelteKit server and the worker process (each process gets its own pool).
import postgres from "postgres"
import { env } from "./env"

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  onnotice: () => {},
  types: {
    // postgres.js returns int8/BIGINT as strings by default (to avoid precision
    // loss). All our ids (osu! user/beatmap/score ids) fit comfortably within
    // Number.MAX_SAFE_INTEGER, so parse them as numbers. This keeps the `number`
    // types honest and, crucially, lets id comparisons against numeric values
    // from the osu! API (e.g. trackedUsers.has(score.user_id)) work.
    bigint: {
      to: 20,
      from: [20],
      serialize: (x: number | bigint) => x.toString(),
      parse: (x: string) => Number(x),
    },
  },
})

export type Sql = typeof sql
