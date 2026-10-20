CREATE TABLE IF NOT EXISTS targets (
  key text PRIMARY KEY,
  target jsonb NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  report jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deliveries (
  key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  target_key text NOT NULL REFERENCES targets(key),
  kind text NOT NULL CHECK (kind IN ('review','ci','command')),
  body jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','running','ready','publishing','completed','superseded','failed')),
  due_at timestamptz NOT NULL,
  owner uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  result jsonb,
  diff jsonb,
  max_inline integer NOT NULL DEFAULT 5,
  command_result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs ((1)) WHERE state IN ('running','publishing');
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (due_at) WHERE state IN ('queued','ready');
CREATE INDEX IF NOT EXISTS jobs_target ON jobs (target_key, created_at DESC);
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY,
  target_key text NOT NULL REFERENCES targets(key),
  author text NOT NULL,
  rule text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by text,
  source_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS feedback_source ON feedback(source_key);
