import type { PageServerLoad } from "./$types"
import { error } from "@sveltejs/kit"
import { sql } from "$lib/server/db"
import { getProfileScores, totalPp } from "$lib/server/scores"
import type { User } from "$lib/server/session"

export const load: PageServerLoad = async ({ params, locals }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) {
    error(404, "Player not found")
  }

  const [profile] = await sql<User[]>`
    SELECT id, username, avatar_url, country_code FROM users WHERE id = ${id}
  `
  if (!profile) {
    error(404, "Player not found")
  }

  const scores = await getProfileScores(id)
  return {
    profile,
    scores,
    totalPp: totalPp(scores),
    isOwner: locals.user?.id === id,
  }
}
