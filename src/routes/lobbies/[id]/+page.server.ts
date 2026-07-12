import type { Actions, PageServerLoad } from "./$types";
import { error, fail } from "@sveltejs/kit";
import { getLobby, isMember, joinLobby, startLobby } from "$lib/server/lobbies";
import { getLobbyBestScores, getLobbyLeaderboard } from "$lib/server/scores";

export const load: PageServerLoad = async ({ params, locals }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    error(404, "Lobby not found");
  }
  const lobby = await getLobby(id);
  if (!lobby) {
    error(404, "Lobby not found");
  }

  const [leaderboard, bestScores] = await Promise.all([
    getLobbyLeaderboard(id),
    getLobbyBestScores(id),
  ]);
  const member = locals.user ? await isMember(id, locals.user.id) : false;
  const isCreator = locals.user?.id === lobby.created_by;

  return { lobby, leaderboard, bestScores, member, isCreator };
};

export const actions: Actions = {
  join: async ({ params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: "Sign in to join a lobby." });
    }
    await joinLobby(Number(params.id), locals.user.id);
    return { joined: true };
  },
  start: async ({ params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: "Sign in to start a lobby." });
    }
    const started = await startLobby(Number(params.id), locals.user.id);
    if (!started) {
      return fail(400, {
        error: "Could not start (not the creator, or already started).",
      });
    }
    return { started: true };
  },
};
