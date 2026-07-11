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

-- One row per (user, beatmap): the user's best play on that map by pp.
CREATE TABLE IF NOT EXISTS scores (
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beatmap_id BIGINT      NOT NULL REFERENCES beatmaps(id),
  score_id   BIGINT      NOT NULL,
  pp         REAL        NOT NULL,
  accuracy   REAL,
  mods       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  rank       TEXT,
  ruleset_id INT         NOT NULL DEFAULT 0,
  ended_at   TIMESTAMPTZ,
  PRIMARY KEY (user_id, beatmap_id)
);

-- Fast ordering + total-pp tally per user.
CREATE INDEX IF NOT EXISTS scores_user_pp_idx ON scores (user_id, pp DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
