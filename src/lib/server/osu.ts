// osu! API v2 helpers: OAuth (authorization-code for user login, client-
// credentials for the poller) plus typed access to the endpoints we use.
import { requireEnv } from "./env";

const OSU_BASE = "https://osu.ppy.sh";
const OAUTH_AUTHORIZE = `${OSU_BASE}/oauth/authorize`;
const OAUTH_TOKEN = `${OSU_BASE}/oauth/token`;
const API_BASE = `${OSU_BASE}/api/v2`;

export interface OsuTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
}

export interface OsuMe {
  id: number;
  username: string;
  avatar_url: string;
  country_code: string;
}

// The `/scores` feed embeds beatmap + beatmapset in each score.
export interface OsuBeatmapset {
  title?: string;
  artist?: string;
  covers?: Record<string, string>;
}

export interface OsuBeatmap {
  id: number;
  version?: string;
  difficulty_rating?: number;
  beatmapset?: OsuBeatmapset;
}

export interface OsuScore {
  id: number;
  user_id: number;
  beatmap_id: number;
  ruleset_id: number;
  pp: number | null;
  accuracy: number;
  mods: unknown[];
  passed: boolean;
  rank: string;
  ended_at: string;
  beatmap?: OsuBeatmap;
  beatmapset?: OsuBeatmapset;
}

export interface OsuScoresResponse {
  scores: OsuScore[];
  cursor_string: string | null;
}

// GET /beatmaps/{id} returns the beatmap with its beatmapset embedded. The
// /scores feed does NOT embed the beatmap, so this is how we get display data.
export interface OsuBeatmapFull {
  id: number;
  version?: string;
  difficulty_rating?: number;
  beatmapset?: OsuBeatmapset;
}

// --- User login (authorization-code grant) -------------------------------

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("OSU_CLIENT_ID"),
    redirect_uri: requireEnv("OSU_AUTH_CALLBACK_URL"),
    response_type: "code",
    scope: "identify public",
    state,
  });
  return `${OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<OsuTokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("OSU_CLIENT_ID"),
      client_secret: requireEnv("OSU_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: requireEnv("OSU_AUTH_CALLBACK_URL"),
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OsuTokenResponse;
}

export async function fetchMe(accessToken: string): Promise<OsuMe> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch /me: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OsuMe;
}

// --- App token (client-credentials grant, used by the poller) ------------

let appToken: string | null = null;
let appTokenExpiresAt = 0;

async function requestAppToken(): Promise<string> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("OSU_CLIENT_ID"),
      client_secret: requireEnv("OSU_CLIENT_SECRET"),
      grant_type: "client_credentials",
      scope: "public",
    }),
  });
  if (!res.ok) {
    throw new Error(`App token request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as OsuTokenResponse;
  appToken = data.access_token;
  // Refresh a minute early to avoid using a token that expires mid-request.
  appTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return appToken;
}

export async function getAppToken(forceRefresh = false): Promise<string> {
  if (forceRefresh || !appToken || Date.now() >= appTokenExpiresAt) {
    return requestAppToken();
  }
  return appToken;
}

/** HTTP 422 from the scores feed means the cursor is too old and must be dropped. */
export class CursorTooOldError extends Error {}

/** GET an authed API path with the app token, refreshing once on 401. */
async function authedGet(path: string): Promise<Response> {
  const request = (token: string) =>
    fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  const res = await request(await getAppToken());
  if (res.status === 401) {
    // Token likely expired/revoked; force a refresh and retry once.
    return request(await getAppToken(true));
  }
  return res;
}

export async function fetchScores(cursorString: string | null): Promise<OsuScoresResponse> {
  const params = new URLSearchParams({ ruleset: "osu" });
  if (cursorString) {
    params.set("cursor_string", cursorString);
  }

  const res = await authedGet(`/scores?${params.toString()}`);
  if (res.status === 422) {
    throw new CursorTooOldError(await res.text());
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch /scores: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OsuScoresResponse;
}

/** Fetch beatmap display metadata. Returns null on 404 (e.g. deleted map). */
export async function fetchBeatmap(id: number): Promise<OsuBeatmapFull | null> {
  const res = await authedGet(`/beatmaps/${id}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch /beatmaps/${id}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OsuBeatmapFull;
}
