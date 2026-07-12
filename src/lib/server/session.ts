// User persistence + cookie-backed sessions (random token -> user row).
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import type { OsuMe } from "./osu";

export const SESSION_COOKIE = "sppeedrun_session";
export const OAUTH_STATE_COOKIE = "sppeedrun_oauth_state";

export interface User {
  id: number;
  username: string;
  avatar_url: string | null;
  country_code: string | null;
}

export async function upsertUser(me: OsuMe): Promise<User> {
  const [user] = await sql<User[]>`
    INSERT INTO users (id, username, avatar_url, country_code)
    VALUES (${me.id}, ${me.username}, ${me.avatar_url}, ${me.country_code})
    ON CONFLICT (id) DO UPDATE
      SET username = EXCLUDED.username,
          avatar_url = EXCLUDED.avatar_url,
          country_code = EXCLUDED.country_code
    RETURNING id, username, avatar_url, country_code
  `;
  return user;
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await sql`INSERT INTO sessions (token, user_id) VALUES (${token}, ${userId})`;
  return token;
}

export async function getUserByToken(token: string | undefined): Promise<User | null> {
  if (!token) {
    return null;
  }
  const rows = await sql<User[]>`
    SELECT u.id, u.username, u.avatar_url, u.country_code
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token}
  `;
  return rows[0] ?? null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}
