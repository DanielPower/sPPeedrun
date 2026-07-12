// Lobby lifecycle + membership. A lobby is one speedrun: pending -> active ->
// finished, with one end condition (time_limit / end_date / pp_limit).
import { sql } from "./db";

// Postgres NOTIFY channel for lobby changes (create/join/start/finish). Both
// the web server (SSE) and the worker (membership refresh) LISTEN on it.
export const LOBBIES_CHANNEL = "lobbies_updated";

export async function notifyLobbiesUpdate(lobbyId: number): Promise<void> {
  await sql.notify(LOBBIES_CHANNEL, String(lobbyId));
}

export type LobbyState = "pending" | "active" | "finished";
export type EndCondition = "time_limit" | "end_date" | "pp_limit";

export interface LobbyListItem {
  id: number;
  name: string;
  state: LobbyState;
  end_condition: EndCondition;
  duration_seconds: number | null;
  pp_limit: number | null;
  ends_at: string | null;
  creator: string;
  member_count: number;
}

export interface Lobby {
  id: number;
  name: string;
  created_by: number;
  creator: string;
  created_at: string;
  state: LobbyState;
  end_condition: EndCondition;
  duration_seconds: number | null;
  pp_limit: number | null;
  ends_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface CreateLobbyInput {
  name: string;
  userId: number;
  end_condition: EndCondition;
  duration_seconds?: number | null; // time_limit
  endDate?: string | null; // end_date (ISO / datetime-local)
  pp_limit?: number | null; // pp_limit
}

interface ConditionColumns {
  duration_seconds: number | null;
  pp_limit: number | null;
  ends_at: string | null;
}

/** Validate & normalise the chosen end condition. Throws on invalid input. */
function validateCondition(input: CreateLobbyInput): ConditionColumns {
  switch (input.end_condition) {
    case "time_limit": {
      const d = input.duration_seconds;
      if (!d || !Number.isFinite(d) || d <= 0) {
        throw new Error("Time limit must be a positive duration.");
      }
      return { duration_seconds: Math.floor(d), pp_limit: null, ends_at: null };
    }
    case "end_date": {
      const t = input.endDate ? Date.parse(input.endDate) : NaN;
      if (!Number.isFinite(t)) {
        throw new Error("Invalid end date.");
      }
      if (t <= Date.now()) {
        throw new Error("End date must be in the future.");
      }
      return {
        duration_seconds: null,
        pp_limit: null,
        ends_at: new Date(t).toISOString(),
      };
    }
    case "pp_limit": {
      const p = input.pp_limit;
      if (!p || !Number.isFinite(p) || p <= 0) {
        throw new Error("PP limit must be a positive number.");
      }
      return { duration_seconds: null, pp_limit: p, ends_at: null };
    }
    default:
      throw new Error("Choose an end condition.");
  }
}

export async function createLobby(input: CreateLobbyInput): Promise<{ id: number }> {
  const name = input.name?.trim();
  if (!name) {
    throw new Error("Lobby name is required.");
  }
  if (name.length > 100) {
    throw new Error("Lobby name is too long.");
  }
  const cols = validateCondition(input);

  const id = await sql.begin(async (tx) => {
    const [lobby] = await tx<{ id: number }[]>`
      INSERT INTO lobbies (name, created_by, end_condition, duration_seconds, pp_limit, ends_at)
      VALUES (${name}, ${input.userId}, ${input.end_condition}, ${cols.duration_seconds}, ${cols.pp_limit}, ${cols.ends_at})
      RETURNING id
    `;
    await tx`INSERT INTO lobby_members (lobby_id, user_id) VALUES (${lobby.id}, ${input.userId})`;
    return lobby.id;
  });

  await notifyLobbiesUpdate(id);
  return { id };
}

/** Start a pending lobby (creator only). Returns true if it transitioned. */
export async function startLobby(lobbyId: number, userId: number): Promise<boolean> {
  const rows = await sql`
    UPDATE lobbies
    SET state = 'active',
        started_at = now(),
        ends_at = CASE WHEN end_condition = 'time_limit'
                       THEN now() + make_interval(secs => duration_seconds)
                       ELSE ends_at END
    WHERE id = ${lobbyId} AND created_by = ${userId} AND state = 'pending'
    RETURNING id
  `;
  if (rows.length > 0) {
    await notifyLobbiesUpdate(lobbyId);
    return true;
  }
  return false;
}

/** Join a lobby unless it is finished. Returns true if newly joined. */
export async function joinLobby(lobbyId: number, userId: number): Promise<boolean> {
  const rows = await sql`
    INSERT INTO lobby_members (lobby_id, user_id)
    SELECT ${lobbyId}, ${userId}
    WHERE EXISTS (SELECT 1 FROM lobbies WHERE id = ${lobbyId} AND state <> 'finished')
    ON CONFLICT (lobby_id, user_id) DO NOTHING
    RETURNING lobby_id
  `;
  if (rows.length > 0) {
    await notifyLobbiesUpdate(lobbyId);
    return true;
  }
  return false;
}

export async function listLobbies(): Promise<LobbyListItem[]> {
  return sql<LobbyListItem[]>`
    SELECT l.id, l.name, l.state, l.end_condition, l.duration_seconds, l.pp_limit, l.ends_at,
           u.username AS creator,
           COUNT(m.user_id)::int AS member_count
    FROM lobbies l
    JOIN users u ON u.id = l.created_by
    LEFT JOIN lobby_members m ON m.lobby_id = l.id
    GROUP BY l.id, u.username
    ORDER BY l.created_at DESC
  `;
}

export async function getLobby(lobbyId: number): Promise<Lobby | null> {
  const [lobby] = await sql<Lobby[]>`
    SELECT l.id, l.name, l.created_by, u.username AS creator, l.created_at,
           l.state, l.end_condition, l.duration_seconds, l.pp_limit, l.ends_at,
           l.started_at, l.finished_at
    FROM lobbies l
    JOIN users u ON u.id = l.created_by
    WHERE l.id = ${lobbyId}
  `;
  return lobby ?? null;
}

export async function isMember(lobbyId: number, userId: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM lobby_members WHERE lobby_id = ${lobbyId} AND user_id = ${userId}
  `;
  return rows.length > 0;
}

/** Finish active lobbies whose time/date deadline has passed. Returns their ids. */
export async function finishExpiredLobbies(): Promise<number[]> {
  const rows = await sql<{ id: number }[]>`
    UPDATE lobbies SET state = 'finished', finished_at = now()
    WHERE state = 'active' AND ends_at IS NOT NULL AND now() >= ends_at
    RETURNING id
  `;
  return rows.map((r) => r.id);
}

/** Active lobbies with a pp-based end condition (for the worker's pp check). */
export async function getActivePpLobbies(): Promise<
  {
    id: number;
    pp_limit: number;
  }[]
> {
  return sql<{ id: number; pp_limit: number }[]>`
    SELECT id, pp_limit FROM lobbies WHERE state = 'active' AND pp_limit IS NOT NULL
  `;
}

export async function finishLobby(lobbyId: number): Promise<void> {
  await sql`
    UPDATE lobbies SET state = 'finished', finished_at = now()
    WHERE id = ${lobbyId} AND state = 'active'
  `;
}
