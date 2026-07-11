// End-to-end verification against the real osu! API + local DB.
// Exercises: scores feed, beatmap enrichment, best-play upsert + pp guard,
// profile read, and weighted total pp. Uses a synthetic user and cleans up.
import { fetchBeatmap, fetchScores } from "../src/lib/server/osu"
import { sql } from "../src/lib/server/db"
import {
  getProfileScores,
  totalPp,
  upsertBeatmap,
  upsertBestPlay,
} from "../src/lib/server/scores"

const FAKE_USER = 90000001
let ok = true
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`)
  if (!cond) ok = false
}

async function main() {
  // --- Part A: real API smoke -------------------------------------------
  const { scores, cursor_string } = await fetchScores(null)
  check("scores feed returns scores", scores.length > 0)
  check("feed returns a cursor_string", typeof cursor_string === "string")
  const scored = scores.find((s) => s.pp != null && s.passed)
  check("feed has a passed score with pp", !!scored)
  if (!scored) return

  const bm = await fetchBeatmap(scored.beatmap_id)
  check("beatmap enrichment returns metadata", !!bm && !!bm.beatmapset?.title)
  console.log(
    `      -> ${bm?.beatmapset?.artist} - ${bm?.beatmapset?.title} [${bm?.version}] ★${bm?.difficulty_rating}`,
  )

  // --- Part B: data layer with a synthetic user -------------------------
  await sql`INSERT INTO users (id, username) VALUES (${FAKE_USER}, 'verify-bot')
            ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`

  // Two real beatmaps, enriched.
  const bm2Id =
    scores.find((s) => s.beatmap_id !== scored.beatmap_id)?.beatmap_id ??
    scored.beatmap_id + 1
  for (const id of [scored.beatmap_id, bm2Id]) {
    const meta = await fetchBeatmap(id).catch(() => null)
    await upsertBeatmap({
      id,
      title: meta?.beatmapset?.title ?? null,
      artist: meta?.beatmapset?.artist ?? null,
      version: meta?.version ?? null,
      difficulty_rating: meta?.difficulty_rating ?? null,
      cover_url: meta?.beatmapset?.covers?.cover ?? null,
    })
  }

  const play = (beatmap_id: number, pp: number) => ({
    user_id: FAKE_USER,
    beatmap_id,
    score_id: Math.floor(Math.random() * 1e9),
    pp,
    accuracy: 0.99,
    mods: [{ acronym: "HD" }],
    rank: "S",
    ruleset_id: 0,
    ended_at: new Date().toISOString(),
  })

  check("first play stored", await upsertBestPlay(play(scored.beatmap_id, 100)))
  check(
    "lower pp is rejected by guard",
    !(await upsertBestPlay(play(scored.beatmap_id, 50))),
  )
  check(
    "higher pp replaces",
    await upsertBestPlay(play(scored.beatmap_id, 150)),
  )
  if (bm2Id !== scored.beatmap_id) {
    check("second beatmap play stored", await upsertBestPlay(play(bm2Id, 80)))
  }

  const profile = await getProfileScores(FAKE_USER)
  check("profile ordered by pp desc", profile[0]?.pp === 150)
  const expected = bm2Id !== scored.beatmap_id ? 150 + 80 * 0.95 : 150
  const total = totalPp(profile)
  check(
    `weighted total pp = ${expected} (got ${total.toFixed(2)})`,
    Math.abs(total - expected) < 1e-6,
  )
  check(
    "profile rows carry beatmap title",
    profile.every((p) => p.title !== null),
  )

  // --- Cleanup ----------------------------------------------------------
  await sql`DELETE FROM users WHERE id = ${FAKE_USER}` // cascades scores
  const remaining = await sql`SELECT 1 FROM scores WHERE user_id = ${FAKE_USER}`
  check("cleanup removed synthetic scores", remaining.length === 0)
}

main()
  .then(async () => {
    await sql.end()
    console.log(ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED")
    process.exit(ok ? 0 : 1)
  })
  .catch(async (err) => {
    console.error(err)
    await sql.end()
    process.exit(1)
  })
