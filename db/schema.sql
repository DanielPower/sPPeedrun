-- sPPeedrun schema. Idempotent so `db:migrate` can be re-run safely.

CREATE TABLE IF NOT EXISTS users (
  id           BIGINT PRIMARY KEY,          -- osu! user id
  username     TEXT        NOT NULL,
  avatar_url   TEXT,
  country_code TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Denormalised display cache for beatmaps we've seen, so profiles never have
-- to call the osu! API to render.
CREATE TABLE IF NOT EXISTS beatmaps (
  id                BIGINT PRIMARY KEY,      -- osu! beatmap id
  title             TEXT,
  artist            TEXT,
  version           TEXT,                    -- difficulty name
  difficulty_rating REAL,
  cover_url         TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A lobby is one speedrun with its own leaderboard and lifecycle.
--   pending  -> created, not yet recording scores (players joining)
--   active   -> recording new best plays (creator has started it)
--   finished -> end condition reached, no longer recording
-- Exactly one end condition is set per lobby:
--   time_limit -> duration_seconds (ends_at computed at start)
--   end_date   -> ends_at (absolute, set at creation)
--   pp_limit   -> pp_limit (finishes when a member's total weighted pp reaches it)
CREATE TABLE IF NOT EXISTS lobbies (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT        NOT NULL,
  created_by       BIGINT      NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  state            TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (state IN ('pending', 'active', 'finished')),
  end_condition    TEXT        NOT NULL
                     CHECK (end_condition IN ('time_limit', 'end_date', 'pp_limit')),
  duration_seconds INT,        -- time_limit
  pp_limit         REAL,       -- pp_limit
  ends_at          TIMESTAMPTZ,-- end_date (at creation) or time_limit (at start)
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS lobby_members (
  lobby_id  BIGINT      NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id   BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lobby_id, user_id)
);

-- One row per (lobby, user, beatmap): the user's best play on that map by pp,
-- within that lobby. Scores are derived from the live feed and disposable.
CREATE TABLE IF NOT EXISTS scores (
  lobby_id   BIGINT      NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beatmap_id BIGINT      NOT NULL REFERENCES beatmaps(id),
  score_id   BIGINT      NOT NULL,
  pp         REAL        NOT NULL,
  accuracy   REAL,
  mods       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rank       TEXT,
  ruleset_id INT         NOT NULL DEFAULT 0,
  ended_at   TIMESTAMPTZ,
  PRIMARY KEY (lobby_id, user_id, beatmap_id)
);

-- Fast per-lobby ordering + total-pp tally per user.
CREATE INDEX IF NOT EXISTS scores_lobby_user_pp_idx ON scores (lobby_id, user_id, pp DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
