import type { RequestHandler } from "./$types"
import { redirect } from "@sveltejs/kit"
import { randomBytes } from "node:crypto"
import { buildAuthorizeUrl } from "$lib/server/osu"
import { OAUTH_STATE_COOKIE } from "$lib/server/session"

export const GET: RequestHandler = ({ cookies }) => {
  const state = randomBytes(16).toString("hex")
  cookies.set(OAUTH_STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 10,
  })
  redirect(302, buildAuthorizeUrl(state))
}
