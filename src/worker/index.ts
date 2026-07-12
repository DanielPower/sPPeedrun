// Background poller: every 5s, pull the osu!standard scores feed, follow the
// cursor, and for every member of an ACTIVE lobby keep their best play per
// beatmap (scoped to that lobby). Also evaluates lobby end conditions.
//
// Runs as its own process (tsx), independent of the web server. Imports use
// relative paths so no SvelteKit `$lib` alias resolution is required.
import { sql } from "../lib/server/db";
import {
  CursorTooOldError,
  fetchBeatmap,
  fetchScores,
  getAppToken,
  type OsuScore,
} from "../lib/server/osu";
import {
  ensureBeatmapPlaceholder,
  getLobbyLeaderboard,
  notifyScoreUpdate,
  upsertBeatmap,
  upsertBestPlay,
} from "../lib/server/scores";
import {
  finishExpiredLobbies,
  finishLobby,
  getActivePpLobbies,
  LOBBIES_CHANNEL,
  notifyLobbiesUpdate,
} from "../lib/server/lobbies";

const POLL_INTERVAL_MS = 5000;
const MEMBERSHIPS_REFRESH_MS = 30_000;

let cursorString: string | null = null;
// userId -> lobbyIds the user actively participates in (active lobbies only).
let memberships = new Map<number, number[]>();
let membershipsRefreshedAt = 0;
let membershipsStale = true;

// Beatmaps whose display metadata is already stored, so we fetch each map at
// most once per worker run (the /scores feed doesn't embed beatmap data).
const enrichedBeatmaps = new Set<number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function refreshMemberships(): Promise<void> {
  const rows = await sql<{ user_id: number; lobby_id: number }[]>`
    SELECT m.user_id, m.lobby_id
    FROM lobby_members m
    JOIN lobbies l ON l.id = m.lobby_id
    WHERE l.state = 'active'
  `;
  const next = new Map<number, number[]>();
  for (const { user_id, lobby_id } of rows) {
    const list = next.get(user_id);
    if (list) {
      list.push(lobby_id);
    } else {
      next.set(user_id, [lobby_id]);
    }
  }
  memberships = next;
  membershipsRefreshedAt = Date.now();
  membershipsStale = false;
}

/** Remove a finished lobby from the in-memory map so no more scores land in it. */
function dropLobby(lobbyId: number): void {
  for (const [userId, lobbies] of memberships) {
    const filtered = lobbies.filter((id) => id !== lobbyId);
    if (filtered.length === 0) {
      memberships.delete(userId);
    } else {
      memberships.set(userId, filtered);
    }
  }
}

/**
 * Ensure a beatmap row with display metadata exists (FK target for scores).
 * Fetches /beatmaps/{id} once per map; on failure falls back to an id-only row
 * so the score can still be stored, and leaves the map un-enriched to retry.
 */
async function ensureBeatmap(beatmapId: number): Promise<void> {
  if (enrichedBeatmaps.has(beatmapId)) {
    return;
  }
  try {
    const bm = await fetchBeatmap(beatmapId);
    const set = bm?.beatmapset;
    const covers = set?.covers ?? {};
    await upsertBeatmap({
      id: beatmapId,
      title: set?.title ?? null,
      artist: set?.artist ?? null,
      version: bm?.version ?? null,
      difficulty_rating: bm?.difficulty_rating ?? null,
      cover_url: covers["cover@2x"] ?? covers.cover ?? covers.card ?? null,
    });
    enrichedBeatmaps.add(beatmapId);
  } catch (err) {
    console.warn(
      `[poll] beatmap ${beatmapId} enrich failed, storing id only:`,
      err instanceof Error ? err.message : err,
    );
    // Minimal row keeps the scores FK satisfied without clobbering any metadata
    // from a prior run; not marked enriched so we retry next time.
    await ensureBeatmapPlaceholder(beatmapId);
  }
}

/**
 * Record a score as the user's best per beatmap in each active lobby they're
 * in. Adds any lobby that got a new best to `updatedLobbies`.
 */
async function handleScore(score: OsuScore, updatedLobbies: Set<number>): Promise<void> {
  if (score.pp == null || !score.passed) {
    return;
  }
  const lobbies = memberships.get(score.user_id);
  if (!lobbies || lobbies.length === 0) {
    return;
  }

  // The beatmap row must exist before the score (FK), so ensure it once.
  await ensureBeatmap(score.beatmap_id);

  for (const lobbyId of lobbies) {
    const updated = await upsertBestPlay({
      lobby_id: lobbyId,
      user_id: score.user_id,
      beatmap_id: score.beatmap_id,
      score_id: score.id,
      pp: score.pp,
      accuracy: score.accuracy ?? null,
      mods: score.mods ?? [],
      rank: score.rank ?? null,
      ruleset_id: score.ruleset_id,
      ended_at: score.ended_at ?? null,
    });
    if (updated) {
      console.log(
        `[poll] lobby ${lobbyId} user ${score.user_id} new best on beatmap ${score.beatmap_id}: ${score.pp.toFixed(2)}pp`,
      );
      updatedLobbies.add(lobbyId);
      await notifyScoreUpdate(lobbyId, score.user_id);
    }
  }
}

/** Finish any active pp-limit lobbies whose top member has reached the target. */
async function checkPpLimits(candidateLobbies: Set<number>): Promise<void> {
  if (candidateLobbies.size === 0) {
    return;
  }
  const ppLobbies = await getActivePpLobbies();
  for (const { id, pp_limit } of ppLobbies) {
    if (!candidateLobbies.has(id)) {
      continue;
    }
    const leaderboard = await getLobbyLeaderboard(id);
    if ((leaderboard[0]?.total_pp ?? 0) >= pp_limit) {
      await finishLobby(id);
      dropLobby(id);
      await notifyLobbiesUpdate(id);
      console.log(`[poll] lobby ${id} finished: reached ${pp_limit}pp`);
    }
  }
}

async function tick(): Promise<void> {
  if (membershipsStale || Date.now() - membershipsRefreshedAt > MEMBERSHIPS_REFRESH_MS) {
    await refreshMemberships();
  }

  // Finish time/date-based lobbies whose deadline has passed (even with no new
  // scores), and stop recording for them.
  const expired = await finishExpiredLobbies();
  for (const id of expired) {
    dropLobby(id);
    await notifyLobbiesUpdate(id);
    console.log(`[poll] lobby ${id} finished: reached its deadline`);
  }

  let data;
  try {
    data = await fetchScores(cursorString);
  } catch (err) {
    if (err instanceof CursorTooOldError) {
      console.warn("[poll] cursor too old, restarting from newest");
      cursorString = null;
      return;
    }
    throw err;
  }

  const updatedLobbies = new Set<number>();
  let newBests = 0;
  for (const score of data.scores) {
    try {
      const before = updatedLobbies.size;
      await handleScore(score, updatedLobbies);
      newBests += updatedLobbies.size - before;
    } catch (err) {
      // A single poison score must not stall the feed: log and move on so the
      // cursor still advances past it below.
      console.warn(
        `[poll] failed to store score ${score.id} (user ${score.user_id}, beatmap ${score.beatmap_id}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  await checkPpLimits(updatedLobbies);

  // Advance regardless. The same cursor comes back when there are no new
  // scores, which is expected and simply yields empty ticks.
  cursorString = data.cursor_string;

  console.log(
    `[poll] ${new Date().toISOString().slice(11, 19)} scanned ${data.scores.length} scores, ${newBests} new best(s), tracking ${memberships.size} member(s)`,
  );
}

let running = true;

// Graceful shutdown: stop the loop, close the DB pool, and exit 0 so a normal
// stop (Ctrl+C, `pnpm dev` teardown, container SIGTERM) isn't reported as a
// crash (exit 143).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[poll] received ${signal}, shutting down`);
    running = false;
    sql
      .end({ timeout: 5 })
      .catch(() => {})
      .finally(() => process.exit(0));
  });
}

async function main(): Promise<void> {
  console.log("[poll] worker starting");
  await getAppToken(); // fail fast if credentials are wrong

  // Refresh memberships promptly when lobbies change (create/join/start/finish)
  // instead of only every 30s, so starting a lobby records scores right away.
  await sql.listen(LOBBIES_CHANNEL, () => {
    membershipsStale = true;
  });

  await refreshMemberships();
  console.log(`[poll] tracking ${memberships.size} member(s)`);

  while (running) {
    try {
      await tick();
    } catch (err) {
      console.error("[poll] tick failed:", err instanceof Error ? err.message : err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error("[poll] fatal:", err);
  process.exit(1);
});
