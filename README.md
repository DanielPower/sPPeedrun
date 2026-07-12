# sPPeedrun

Sign in with osu!, and sPPeedrun tracks your best play (by pp) on every beatmap
in real time — racing your total weighted pp up a global leaderboard.

`Total pp = Σ pₙ · 0.95^(n-1)` (plays sorted by pp, highest first).

> [!WARNING]
> **Disclaimer:** This is just a fun AI slop project, built by an AI agent with
> little human oversight. Don't rely on it for anything, and don't expect the
> code to reflect careful human review.

## Stack

- **SvelteKit** (Svelte 5) + TypeScript, `@sveltejs/adapter-node`, runs on **port 3000**
- **Postgres** (local `psql-18` for dev, Docker `compose.yml` for prod), accessed with `postgres.js`
- A standalone **worker** that polls `GET /api/v2/scores` every 5s
- **Oxlint** / **Oxfmt** for linting / formatting

## How it works

- **Auth**: `/login` → osu! OAuth (authorization-code). The callback `/auth` upserts
  the user and creates a cookie session. Registered redirect URI is
  `http://localhost:3000/auth`.
- **Poller** (`src/worker/index.ts`): uses a client-credentials app token to follow
  the osu!standard scores feed via `cursor_string`. For each tracked user's passed
  score with pp, it keeps the best play per beatmap (`ON CONFLICT ... WHERE
  EXCLUDED.pp > scores.pp`). The feed doesn't embed beatmap metadata, so each new
  map is enriched once via `GET /api/v2/beatmaps/{id}`.
- **Profile** (`/users/[id]`): best plays highest-pp first + total weighted pp. The
  owner sees a **Reset** button that deletes all their scores.
- **Live updates**: when the worker stores a new best it issues a Postgres
  `NOTIFY` (`notifyScoreUpdate`). The web server holds a single `LISTEN`
  (`$lib/server/events.ts`) and fans updates out to browsers over **Server-Sent
  Events** at `/api/events`. The leaderboard and profile pages open an
  `EventSource` (`$lib/live.ts`) and re-run their `load` via `invalidateAll()` on
  a relevant update — the leaderboard on any update, a profile only for its own
  user. No refresh needed. (SSE is used rather than WebSockets because the flow
  is one-directional and needs no changes to the dev/prod server bootstrap.)

## Setup

`.env` already contains the osu! OAuth credentials and `DATABASE_URL`.

```sh
pnpm install
pnpm db:migrate     # creates the `sppeedrun` database + tables
pnpm dev            # web (port 3000) + worker, concurrently
```

Open http://localhost:3000.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Web server + poller worker |
| `pnpm worker` | Poller only |
| `pnpm db:migrate` | Create DB (if needed) + apply `db/schema.sql` |
| `pnpm build` / `pnpm start` | Production build / run (server + worker) |
| `pnpm check` | Type-check (svelte-check) |
| `pnpm lint` / `pnpm format` | Oxlint / Oxfmt |
| `tsx scripts/verify.ts` | End-to-end check against the live osu! API + DB |

## Docker & deployment

The `Dockerfile` builds a single image that runs **either** process:

- **web** → `node build` (the default `CMD`)
- **worker** → `node --import tsx src/worker/index.ts` (command override)

`.github/workflows/docker-publish.yml` builds and pushes that image to **GHCR**
(`ghcr.io/<owner>/<repo>`) on pushes to `main` and on `v*` tags, using the
built-in `GITHUB_TOKEN` (no extra secrets needed — just ensure the repo allows
GitHub Actions to publish packages).

`compose.yml` is an example stack that runs everything from the published image:

- `db` — `postgres:18`
- `migrate` — applies `db/schema.sql` on startup
- `web` — the SvelteKit server on port 3000 (`ORIGIN` set for CSRF on form posts)
- `worker` — the poller, same image with the worker command

```sh
# Provide osu! creds in .env, then:
docker compose up -d
```

`DATABASE_URL` is overridden in compose to point at the `db` service (the value
in `.env` is for local dev). Note: the GHCR image name must be lowercase — the
workflow's metadata step handles that automatically.
