// Persistence for the best-play-per-beatmap model, plus the profile and
// leaderboard read queries.
import { sql } from "./db"
import { weightedTotal } from "../pp"

// Postgres NOTIFY channel used to push live updates from the worker (which
// ingests scores) to the web server (which streams them to browsers via SSE).
export const SCORES_CHANNEL = "scores_updated"

/** Announce that `userId` just got a new best play, for live UI updates. */
export async function notifyScoreUpdate(userId: number): Promise<void> {
  await sql.notify(SCORES_CHANNEL, String(userId))
}

export interface BeatmapInput {
  id: number
  title: string | null
  artist: string | null
  version: string | null
  difficulty_rating: number | null
  cover_url: string | null
}

export interface BestPlayInput {
  user_id: number
  beatmap_id: number
  score_id: number
  pp: number
  accuracy: number | null
  mods: unknown[]
  rank: string | null
  ruleset_id: number
  ended_at: string | null
}

export interface ProfileScore {
  beatmap_id: number
  score_id: number
  pp: number
  accuracy: number | null
  mods: string[]
  rank: string | null
  ended_at: string | null
  title: string | null
  artist: string | null
  version: string | null
  difficulty_rating: number | null
  cover_url: string | null
}

export interface LeaderboardRow {
  id: number
  username: string
  avatar_url: string | null
  total_pp: number
  play_count: number
}

export async function upsertBeatmap(bm: BeatmapInput): Promise<void> {
  await sql`
    INSERT INTO beatmaps (id, title, artist, version, difficulty_rating, cover_url, updated_at)
    VALUES (${bm.id}, ${bm.title}, ${bm.artist}, ${bm.version}, ${bm.difficulty_rating}, ${bm.cover_url}, now())
    ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          artist = EXCLUDED.artist,
          version = EXCLUDED.version,
          difficulty_rating = EXCLUDED.difficulty_rating,
          cover_url = EXCLUDED.cover_url,
          updated_at = now()
  `
}

/**
 * Store a play as the user's best on that beatmap, but only when it beats the
 * currently stored pp. Returns true when a row was inserted or updated.
 */
export async function upsertBestPlay(play: BestPlayInput): Promise<boolean> {
  const rows = await sql`
    INSERT INTO scores (user_id, beatmap_id, score_id, pp, accuracy, mods, rank, ruleset_id, ended_at)
    VALUES (
      ${play.user_id}, ${play.beatmap_id}, ${play.score_id}, ${play.pp},
      ${play.accuracy}, ${sql.json(play.mods as Parameters<typeof sql.json>[0])}, ${play.rank}, ${play.ruleset_id}, ${play.ended_at}
    )
    ON CONFLICT (user_id, beatmap_id) DO UPDATE
      SET score_id = EXCLUDED.score_id,
          pp = EXCLUDED.pp,
          accuracy = EXCLUDED.accuracy,
          mods = EXCLUDED.mods,
          rank = EXCLUDED.rank,
          ruleset_id = EXCLUDED.ruleset_id,
          ended_at = EXCLUDED.ended_at
      WHERE EXCLUDED.pp > scores.pp
    RETURNING beatmap_id
  `
  return rows.length > 0
}

/** Insert an id-only beatmap row if absent, without clobbering existing metadata. */
export async function ensureBeatmapPlaceholder(id: number): Promise<void> {
  await sql`INSERT INTO beatmaps (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`
}

export async function resetScores(userId: number): Promise<void> {
  await sql`DELETE FROM scores WHERE user_id = ${userId}`
}

export async function getProfileScores(
  userId: number,
): Promise<ProfileScore[]> {
  return sql<ProfileScore[]>`
    SELECT s.beatmap_id, s.score_id, s.pp, s.accuracy, s.mods, s.rank, s.ended_at,
           b.title, b.artist, b.version, b.difficulty_rating, b.cover_url
    FROM scores s
    JOIN beatmaps b ON b.id = s.beatmap_id
    WHERE s.user_id = ${userId}
    ORDER BY s.pp DESC
  `
}

/** Total pp for a set of profile scores, using the shared osu! weighting. */
export function totalPp(scores: { pp: number }[]): number {
  return weightedTotal(scores.map((s) => s.pp))
}

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  // Weighted total computed in SQL to match weightedTotal(): the nth-best play
  // (per user, by pp) is worth pp * 0.95^(n-1).
  return sql<LeaderboardRow[]>`
    SELECT u.id, u.username, u.avatar_url,
           COALESCE(SUM(ranked.pp * power(0.95, ranked.rn - 1)), 0)::float8 AS total_pp,
           COUNT(ranked.beatmap_id)::int AS play_count
    FROM users u
    LEFT JOIN (
      SELECT user_id, beatmap_id, pp,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY pp DESC) AS rn
      FROM scores
    ) ranked ON ranked.user_id = u.id
    GROUP BY u.id
    ORDER BY total_pp DESC, u.username ASC
  `
}
