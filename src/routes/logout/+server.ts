import type { RequestHandler } from "./$types";
import { redirect } from "@sveltejs/kit";
import { SESSION_COOKIE, destroySession } from "$lib/server/session";

export const POST: RequestHandler = async ({ cookies }) => {
  const token = cookies.get(SESSION_COOKIE);
  await destroySession(token);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  redirect(302, "/");
};
