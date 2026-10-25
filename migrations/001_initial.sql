CREATE TABLE IF NOT EXISTS targets (
  key text PRIMARY KEY,
  target jsonb NOT NULL,
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

-- Retire command-only state on both existing and fresh databases.
ALTER TABLE targets DROP COLUMN IF EXISTS paused;
DROP TABLE IF EXISTS feedback;

-- Remote IDs keep retired bot questions recognizable after GitLab moves their author to ghost.
CREATE TABLE IF NOT EXISTS bot_comment_history (
  target_key text NOT NULL REFERENCES targets(key),
  surface text NOT NULL CHECK (surface IN ('issue','review','note')),
  comment_id text NOT NULL,
  bot_login text NOT NULL,
  PRIMARY KEY(target_key,surface,comment_id)
);

-- n8n owns phase ordering; jobs keep durable phase/lease checkpoints across restarts.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS workflow_step text CHECK (workflow_step IN ('prepare','generate','validate','publish','gate','notify','command','complete'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS workflow_status text CHECK (workflow_status IN ('pending','running'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS workflow_owner uuid;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS workflow_data jsonb NOT NULL DEFAULT '{}';
