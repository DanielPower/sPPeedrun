import type { Handle } from "@sveltejs/kit";
import { SESSION_COOKIE, getUserByToken } from "$lib/server/session";

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(SESSION_COOKIE);
  event.locals.user = await getUserByToken(token);
  return resolve(event);
};
