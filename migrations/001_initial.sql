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
-- Databases created before command_result existed lack the column; keep this idempotent.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS command_result jsonb;
-- Model review time feeds the estimate shown when the next review starts.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS review_seconds integer;
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
CREATE TABLE IF NOT EXISTS mattermost_notifications (
  key text PRIMARY KEY,
  target jsonb NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','sent','failed','uncertain')),
  owner uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mattermost_notifications_due ON mattermost_notifications(due_at) WHERE state='queued';
-- Publishing an error notice is not a successful question generation.
UPDATE jobs SET state='failed' WHERE kind='review' AND state='completed' AND result->>'state'='failed';
