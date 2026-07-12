import type { Actions, PageServerLoad } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { createLobby, listLobbies, type EndCondition } from "$lib/server/lobbies";

export const load: PageServerLoad = async () => {
  return { lobbies: await listLobbies() };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { error: "Sign in to create a lobby." });
    }
    const form = await request.formData();
    const name = String(form.get("name") ?? "");
    const end_condition = String(form.get("end_condition") ?? "") as EndCondition;

    let duration_seconds: number | null = null;
    let endDate: string | null = null;
    let pp_limit: number | null = null;
    if (end_condition === "time_limit") {
      const amount = Number(form.get("duration_amount"));
      const unit = String(form.get("duration_unit") ?? "minutes");
      const mult = unit === "days" ? 86400 : unit === "hours" ? 3600 : 60;
      duration_seconds = amount * mult;
    } else if (end_condition === "end_date") {
      endDate = String(form.get("end_date") ?? "");
    } else if (end_condition === "pp_limit") {
      pp_limit = Number(form.get("pp_limit"));
    }

    let id: number;
    try {
      ({ id } = await createLobby({
        name,
        userId: locals.user.id,
        end_condition,
        duration_seconds,
        endDate,
        pp_limit,
      }));
    } catch (err) {
      return fail(400, {
        error: err instanceof Error ? err.message : "Could not create lobby.",
        name,
      });
    }
    redirect(303, `/lobbies/${id}`);
  },
};
