CREATE TABLE IF NOT EXISTS hexfront_rooms (
  code text PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hexfront_rooms_expiry ON hexfront_rooms(updated_at);
