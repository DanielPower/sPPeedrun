// Persistence for the best-play-per-beatmap model (scoped per lobby), plus the
// lobby leaderboard and per-user read queries.
import { sql } from "./db";
import { weightedTotal } from "../pp";

// Postgres NOTIFY channel used to push live score updates from the worker (which
// ingests scores) to the web server (which streams them to browsers via SSE).
export const SCORES_CHANNEL = "scores_updated";

/** Announce a new best play in a lobby, for live UI updates. */
export async function notifyScoreUpdate(lobbyId: number, userId: number): Promise<void> {
  await sql.notify(SCORES_CHANNEL, JSON.stringify({ lobbyId, userId }));
}

export interface BeatmapInput {
  id: number;
  title: string | null;
  artist: string | null;
  version: string | null;
  difficulty_rating: number | null;
  cover_url: string | null;
}

export interface BestPlayInput {
  lobby_id: number;
  user_id: number;
  beatmap_id: number;
  score_id: number;
  pp: number;
  accuracy: number | null;
  mods: unknown[];
  rank: string | null;
  ruleset_id: number;
  ended_at: string | null;
}

export interface ProfileScore {
  beatmap_id: number;
  score_id: number;
  pp: number;
  accuracy: number | null;
  mods: string[];
  rank: string | null;
  ended_at: string | null;
  title: string | null;
  artist: string | null;
  version: string | null;
  difficulty_rating: number | null;
  cover_url: string | null;
}

export interface LeaderboardRow {
  id: number;
  username: string;
  avatar_url: string | null;
  total_pp: number;
  play_count: number;
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
  `;
}

/**
 * Store a play as the user's best on that beatmap in a lobby, but only when it
 * beats the currently stored pp. Returns true when a row was inserted/updated.
 */
export async function upsertBestPlay(play: BestPlayInput): Promise<boolean> {
  const rows = await sql`
    INSERT INTO scores (lobby_id, user_id, beatmap_id, score_id, pp, accuracy, mods, rank, ruleset_id, ended_at)
    VALUES (
      ${play.lobby_id}, ${play.user_id}, ${play.beatmap_id}, ${play.score_id}, ${play.pp},
      ${play.accuracy}, ${sql.json(play.mods as Parameters<typeof sql.json>[0])}, ${play.rank}, ${play.ruleset_id}, ${play.ended_at}
    )
    ON CONFLICT (lobby_id, user_id, beatmap_id) DO UPDATE
      SET score_id = EXCLUDED.score_id,
          pp = EXCLUDED.pp,
          accuracy = EXCLUDED.accuracy,
          mods = EXCLUDED.mods,
          rank = EXCLUDED.rank,
          ruleset_id = EXCLUDED.ruleset_id,
          ended_at = EXCLUDED.ended_at
      WHERE EXCLUDED.pp > scores.pp
    RETURNING beatmap_id
  `;
  return rows.length > 0;
}

/** Insert an id-only beatmap row if absent, without clobbering existing metadata. */
export async function ensureBeatmapPlaceholder(id: number): Promise<void> {
  await sql`INSERT INTO beatmaps (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`;
}

export async function getLobbyUserScores(lobbyId: number, userId: number): Promise<ProfileScore[]> {
  return sql<ProfileScore[]>`
    SELECT s.beatmap_id, s.score_id, s.pp, s.accuracy, s.mods, s.rank, s.ended_at,
           b.title, b.artist, b.version, b.difficulty_rating, b.cover_url
    FROM scores s
    JOIN beatmaps b ON b.id = s.beatmap_id
    WHERE s.lobby_id = ${lobbyId} AND s.user_id = ${userId}
    ORDER BY s.pp DESC
  `;
}

/** Total pp for a set of profile scores, using the shared osu! weighting. */
export function totalPp(scores: { pp: number }[]): number {
  return weightedTotal(scores.map((s) => s.pp));
}

export async function getLobbyLeaderboard(lobbyId: number): Promise<LeaderboardRow[]> {
  // All lobby members (including 0-play ones at 0pp), ranked by weighted total.
  // The nth-best play (per user, by pp) is worth pp * 0.95^(n-1).
  return sql<LeaderboardRow[]>`
    SELECT u.id, u.username, u.avatar_url,
           COALESCE(SUM(ranked.pp * power(0.95, ranked.rn - 1)), 0)::float8 AS total_pp,
           COUNT(ranked.beatmap_id)::int AS play_count
    FROM lobby_members mem
    JOIN users u ON u.id = mem.user_id
    LEFT JOIN (
      SELECT user_id, beatmap_id, pp,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY pp DESC) AS rn
      FROM scores
      WHERE lobby_id = ${lobbyId}
    ) ranked ON ranked.user_id = u.id
    WHERE mem.lobby_id = ${lobbyId}
    GROUP BY u.id
    ORDER BY total_pp DESC, u.username ASC
  `;
}
