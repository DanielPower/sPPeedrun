// End-to-end verification against the real osu! API + local DB, for the lobby
// model. Exercises: scores feed + beatmap enrichment, lobby create/start,
// lobby-scoped best-play upsert + pp guard, lobby leaderboard/user scores +
// weighted total, and both end conditions (pp limit + time deadline). Uses a
// synthetic user and cleans up.
import { fetchBeatmap, fetchScores } from "../src/lib/server/osu";
import { sql } from "../src/lib/server/db";
import {
  getLobbyLeaderboard,
  getLobbyUserScores,
  totalPp,
  upsertBeatmap,
  upsertBestPlay,
} from "../src/lib/server/scores";
import {
  createLobby,
  finishExpiredLobbies,
  finishLobby,
  getActivePpLobbies,
  getLobby,
  startLobby,
} from "../src/lib/server/lobbies";

const FAKE_USER = 90000001;
let ok = true;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

async function main() {
  // --- Part A: real API smoke -------------------------------------------
  const { scores, cursor_string } = await fetchScores(null);
  check("scores feed returns scores", scores.length > 0);
  check("feed returns a cursor_string", typeof cursor_string === "string");
  const scored = scores.find((s) => s.pp != null && s.passed);
  check("feed has a passed score with pp", !!scored);
  if (!scored) return;

  const bm = await fetchBeatmap(scored.beatmap_id);
  check("beatmap enrichment returns metadata", !!bm && !!bm.beatmapset?.title);

  // --- Part B: lobby data layer -----------------------------------------
  await sql`INSERT INTO users (id, username) VALUES (${FAKE_USER}, 'verify-bot')
            ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`;

  // Two real beatmaps, enriched, for FK targets.
  const bm2Id =
    scores.find((s) => s.beatmap_id !== scored.beatmap_id)?.beatmap_id ?? scored.beatmap_id + 1;
  for (const id of [scored.beatmap_id, bm2Id]) {
    const meta = await fetchBeatmap(id).catch(() => null);
    await upsertBeatmap({
      id,
      title: meta?.beatmapset?.title ?? null,
      artist: meta?.beatmapset?.artist ?? null,
      version: meta?.version ?? null,
      difficulty_rating: meta?.difficulty_rating ?? null,
      cover_url: meta?.beatmapset?.covers?.cover ?? null,
    });
  }

  // Create a pp-limit lobby (creator auto-joins) and start it.
  const { id: ppLobby } = await createLobby({
    name: "verify pp lobby",
    userId: FAKE_USER,
    end_condition: "pp_limit",
    pp_limit: 200,
  });
  const created = await getLobby(ppLobby);
  check("lobby created in pending state", created?.state === "pending");
  check("start transitions pending -> active", await startLobby(ppLobby, FAKE_USER));
  check("non-creator cannot start (already active)", !(await startLobby(ppLobby, 123)));

  const play = (beatmap_id: number, pp: number) => ({
    lobby_id: ppLobby,
    user_id: FAKE_USER,
    beatmap_id,
    score_id: Math.floor(Math.random() * 1e9),
    pp,
    accuracy: 0.99,
    mods: [{ acronym: "HD" }],
    rank: "S",
    ruleset_id: 0,
    ended_at: new Date().toISOString(),
  });

  check("first play stored", await upsertBestPlay(play(scored.beatmap_id, 100)));
  check("lower pp rejected by guard", !(await upsertBestPlay(play(scored.beatmap_id, 50))));
  check("higher pp replaces", await upsertBestPlay(play(scored.beatmap_id, 150)));
  check("second beatmap play stored", await upsertBestPlay(play(bm2Id, 80)));

  const userScores = await getLobbyUserScores(ppLobby, FAKE_USER);
  check("lobby user scores ordered by pp desc", userScores[0]?.pp === 150);
  const expected = 150 + 80 * 0.95;
  check(
    `weighted total = ${expected} (got ${totalPp(userScores).toFixed(2)})`,
    Math.abs(totalPp(userScores) - expected) < 1e-6,
  );

  const board = await getLobbyLeaderboard(ppLobby);
  check(
    "leaderboard has the member with weighted total",
    Math.abs((board[0]?.total_pp ?? 0) - expected) < 1e-6,
  );

  // pp end condition: top total (226) >= 200 -> finish (mirrors worker logic).
  const ppActive = await getActivePpLobbies();
  const target = ppActive.find((l) => l.id === ppLobby);
  check("lobby listed as active pp-limit lobby", !!target);
  if (target && (await getLobbyLeaderboard(ppLobby))[0].total_pp >= target.pp_limit) {
    await finishLobby(ppLobby);
  }
  check("pp-limit lobby is finished", (await getLobby(ppLobby))?.state === "finished");

  // --- Part C: time deadline finish -------------------------------------
  const { id: timeLobby } = await createLobby({
    name: "verify time lobby",
    userId: FAKE_USER,
    end_condition: "time_limit",
    duration_seconds: 3600,
  });
  await startLobby(timeLobby, FAKE_USER);
  // Force the deadline into the past, then let the worker's finisher run.
  await sql`UPDATE lobbies SET ends_at = now() - interval '1 second' WHERE id = ${timeLobby}`;
  const finished = await finishExpiredLobbies();
  check("finishExpiredLobbies returns the expired lobby", finished.includes(timeLobby));
  check("time-limit lobby is finished", (await getLobby(timeLobby))?.state === "finished");

  // --- Cleanup ----------------------------------------------------------
  await sql`DELETE FROM lobbies WHERE id IN (${ppLobby}, ${timeLobby})`; // cascades members + scores
  await sql`DELETE FROM users WHERE id = ${FAKE_USER}`;
  const remaining = await sql`SELECT 1 FROM scores WHERE user_id = ${FAKE_USER}`;
  check("cleanup removed synthetic data", remaining.length === 0);
}

main()
  .then(async () => {
    await sql.end();
    console.log(ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
    process.exit(ok ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    await sql.end();
    process.exit(1);
  });
