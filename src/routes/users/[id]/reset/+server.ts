import type { RequestHandler } from "./$types"
import { error, redirect } from "@sveltejs/kit"
import { resetScores } from "$lib/server/scores"

export const POST: RequestHandler = async ({ params, locals }) => {
  const id = Number(params.id)
  if (!locals.user || locals.user.id !== id) {
    error(403, "You can only reset your own scores.")
  }
  await resetScores(id)
  redirect(302, `/users/${id}`)
}
