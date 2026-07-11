// Background poller: every 5s, pull the osu!standard scores feed, follow the
// cursor, and for every tracked user keep their best play per beatmap.
//
// Runs as its own process (tsx), independent of the web server. Imports use
// relative paths so no SvelteKit `$lib` alias resolution is required.
import { sql } from "../lib/server/db"
import {
  CursorTooOldError,
  fetchBeatmap,
  fetchScores,
  getAppToken,
  type OsuScore,
} from "../lib/server/osu"
import {
  ensureBeatmapPlaceholder,
  notifyScoreUpdate,
  upsertBeatmap,
  upsertBestPlay,
} from "../lib/server/scores"

const POLL_INTERVAL_MS = 5000
const USERS_REFRESH_MS = 30_000

let cursorString: string | null = null
let trackedUsers = new Set<number>()
let usersRefreshedAt = 0

// Beatmaps whose display metadata is already stored, so we fetch each map at
// most once per worker run (the /scores feed doesn't embed beatmap data).
const enrichedBeatmaps = new Set<number>()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function refreshTrackedUsers(): Promise<void> {
  const rows = await sql<{ id: number }[]>`SELECT id FROM users`
  trackedUsers = new Set(rows.map((r) => r.id))
  usersRefreshedAt = Date.now()
}

/**
 * Ensure a beatmap row with display metadata exists (FK target for scores).
 * Fetches /beatmaps/{id} once per map; on failure falls back to an id-only row
 * so the score can still be stored, and leaves the map un-enriched to retry.
 */
async function ensureBeatmap(beatmapId: number): Promise<void> {
  if (enrichedBeatmaps.has(beatmapId)) {
    return
  }
  try {
    const bm = await fetchBeatmap(beatmapId)
    const set = bm?.beatmapset
    const covers = set?.covers ?? {}
    await upsertBeatmap({
      id: beatmapId,
      title: set?.title ?? null,
      artist: set?.artist ?? null,
      version: bm?.version ?? null,
      difficulty_rating: bm?.difficulty_rating ?? null,
      cover_url: covers["cover@2x"] ?? covers.cover ?? covers.card ?? null,
    })
    enrichedBeatmaps.add(beatmapId)
  } catch (err) {
    console.warn(
      `[poll] beatmap ${beatmapId} enrich failed, storing id only:`,
      err instanceof Error ? err.message : err,
    )
    // Minimal row keeps the scores FK satisfied without clobbering any metadata
    // from a prior run; not marked enriched so we retry next time.
    await ensureBeatmapPlaceholder(beatmapId)
  }
}

/** Returns true when the score became the user's new best on that beatmap. */
async function handleScore(score: OsuScore): Promise<boolean> {
  if (score.pp == null || !score.passed) {
    return false
  }
  if (!trackedUsers.has(score.user_id)) {
    return false
  }

  // The beatmap row must exist before the score (FK), so ensure it first.
  await ensureBeatmap(score.beatmap_id)
  const updated = await upsertBestPlay({
    user_id: score.user_id,
    beatmap_id: score.beatmap_id,
    score_id: score.id,
    pp: score.pp,
    accuracy: score.accuracy ?? null,
    mods: score.mods ?? [],
    rank: score.rank ?? null,
    ruleset_id: score.ruleset_id,
    ended_at: score.ended_at ?? null,
  })
  if (updated) {
    console.log(
      `[poll] user ${score.user_id} new best on beatmap ${score.beatmap_id}: ${score.pp.toFixed(2)}pp`,
    )
    // Push a live update to any connected browsers via the web server.
    await notifyScoreUpdate(score.user_id)
  }
  return updated
}

async function tick(): Promise<void> {
  if (Date.now() - usersRefreshedAt > USERS_REFRESH_MS) {
    await refreshTrackedUsers()
  }

  let data
  try {
    data = await fetchScores(cursorString)
  } catch (err) {
    if (err instanceof CursorTooOldError) {
      console.warn("[poll] cursor too old, restarting from newest")
      cursorString = null
      return
    }
    throw err
  }

  let newBests = 0
  for (const score of data.scores) {
    try {
      if (await handleScore(score)) {
        newBests++
      }
    } catch (err) {
      // A single poison score must not stall the feed: log and move on so the
      // cursor still advances past it below.
      console.warn(
        `[poll] failed to store score ${score.id} (user ${score.user_id}, beatmap ${score.beatmap_id}):`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Advance regardless. The same cursor comes back when there are no new
  // scores, which is expected and simply yields empty ticks.
  cursorString = data.cursor_string

  console.log(
    `[poll] ${new Date().toISOString().slice(11, 19)} scanned ${data.scores.length} scores, ${newBests} new best(s), tracking ${trackedUsers.size} user(s)`,
  )
}

let running = true

// Graceful shutdown: stop the loop, close the DB pool, and exit 0 so a normal
// stop (Ctrl+C, `pnpm dev` teardown, container SIGTERM) isn't reported as a
// crash (exit 143).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[poll] received ${signal}, shutting down`)
    running = false
    sql
      .end({ timeout: 5 })
      .catch(() => {})
      .finally(() => process.exit(0))
  })
}

async function main(): Promise<void> {
  console.log("[poll] worker starting")
  await getAppToken() // fail fast if credentials are wrong
  await refreshTrackedUsers()
  console.log(`[poll] tracking ${trackedUsers.size} user(s)`)

  while (running) {
    try {
      await tick()
    } catch (err) {
      console.error(
        "[poll] tick failed:",
        err instanceof Error ? err.message : err,
      )
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

main().catch((err) => {
  console.error("[poll] fatal:", err)
  process.exit(1)
})
