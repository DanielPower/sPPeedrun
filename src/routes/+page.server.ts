import type { PageServerLoad } from "./$types"
import { getLeaderboard } from "$lib/server/scores"

export const load: PageServerLoad = async () => {
  const leaderboard = await getLeaderboard()
  return { leaderboard }
}
