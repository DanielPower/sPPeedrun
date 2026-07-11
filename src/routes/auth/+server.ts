import type { RequestHandler } from "./$types"
import { error, redirect } from "@sveltejs/kit"
import { exchangeCodeForToken, fetchMe } from "$lib/server/osu"
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  createSession,
  upsertUser,
} from "$lib/server/session"

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const expectedState = cookies.get(OAUTH_STATE_COOKIE)

  if (url.searchParams.get("error")) {
    // User denied the authorization prompt.
    redirect(302, "/")
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    error(400, "Invalid OAuth state. Please try signing in again.")
  }
  cookies.delete(OAUTH_STATE_COOKIE, { path: "/" })

  const token = await exchangeCodeForToken(code)
  const me = await fetchMe(token.access_token)
  const user = await upsertUser(me)

  const sessionToken = await createSession(user.id)
  cookies.set(SESSION_COOKIE, sessionToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })

  redirect(302, `/users/${user.id}`)
}
