import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { sql } from "$lib/server/db";
import { getLobby } from "$lib/server/lobbies";
import { getLobbyUserScores, totalPp } from "$lib/server/scores";
import type { User } from "$lib/server/session";

export const load: PageServerLoad = async ({ params }) => {
  const lobbyId = Number(params.id);
  const userId = Number(params.userId);
  if (!Number.isInteger(lobbyId) || !Number.isInteger(userId)) {
    error(404, "Not found");
  }

  const lobby = await getLobby(lobbyId);
  if (!lobby) {
    error(404, "Lobby not found");
  }

  const [profile] = await sql<User[]>`
    SELECT id, username, avatar_url, country_code FROM users WHERE id = ${userId}
  `;
  if (!profile) {
    error(404, "Player not found");
  }

  const scores = await getLobbyUserScores(lobbyId, userId);
  return { lobby, profile, scores, totalPp: totalPp(scores) };
};
