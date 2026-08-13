CREATE TABLE IF NOT EXISTS endurance_user (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO endurance_user (id, display_name, is_owner)
VALUES ('owner', 'Owner', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS endurance_event (
  id text PRIMARY KEY,
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  event_type text NOT NULL,
  external_id text NOT NULL,
  started_at timestamptz,
  occurred_on date,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id, event_type, external_id)
);

CREATE INDEX IF NOT EXISTS endurance_event_provider_user_started_idx
  ON endurance_event (provider, provider_user_id, started_at);

CREATE INDEX IF NOT EXISTS endurance_event_type_received_idx
  ON endurance_event (event_type, received_at DESC);

CREATE TABLE IF NOT EXISTS endurance_connection (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES endurance_user(id) ON DELETE CASCADE DEFAULT 'owner',
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  encrypted_token text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE endurance_connection
  ADD COLUMN IF NOT EXISTS user_id text REFERENCES endurance_user(id) ON DELETE CASCADE DEFAULT 'owner';
UPDATE endurance_connection SET user_id = 'owner' WHERE user_id IS NULL;
ALTER TABLE endurance_connection ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE endurance_connection DROP CONSTRAINT IF EXISTS endurance_connection_provider_key;

CREATE UNIQUE INDEX IF NOT EXISTS endurance_connection_user_provider_idx
  ON endurance_connection (user_id, provider);

CREATE UNIQUE INDEX IF NOT EXISTS endurance_connection_provider_identity_idx
  ON endurance_connection (provider, provider_user_id);

CREATE INDEX IF NOT EXISTS endurance_connection_provider_user_idx
  ON endurance_connection (provider, provider_user_id);

CREATE TABLE IF NOT EXISTS endurance_oauth_state (
  state_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES endurance_user(id) ON DELETE CASCADE DEFAULT 'owner',
  provider text NOT NULL,
  encrypted_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE endurance_oauth_state
  ADD COLUMN IF NOT EXISTS user_id text REFERENCES endurance_user(id) ON DELETE CASCADE DEFAULT 'owner';
UPDATE endurance_oauth_state SET user_id = 'owner' WHERE user_id IS NULL;
ALTER TABLE endurance_oauth_state ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS endurance_oauth_state_expiry_idx
  ON endurance_oauth_state (expires_at);

CREATE TABLE IF NOT EXISTS endurance_access_key (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES endurance_user(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT 'MCP',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS endurance_access_key_user_idx
  ON endurance_access_key (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS endurance_session (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES endurance_user(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS endurance_session_expiry_idx
  ON endurance_session (expires_at);

CREATE TABLE IF NOT EXISTS endurance_invite (
  token_hash text PRIMARY KEY,
  created_by text NOT NULL REFERENCES endurance_user(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_by text REFERENCES endurance_user(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS endurance_invite_expiry_idx
  ON endurance_invite (expires_at);

CREATE TABLE IF NOT EXISTS endurance_history_request (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES endurance_user(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  from_time timestamptz NOT NULL,
  to_time timestamptz NOT NULL,
  resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS endurance_history_request_owner_idx
  ON endurance_history_request (status, created_at DESC);

CREATE INDEX IF NOT EXISTS endurance_history_request_user_idx
  ON endurance_history_request (user_id, provider, from_time, to_time);

INSERT INTO endurance_history_request (
  id, user_id, provider, provider_user_id, from_time, to_time, resources
)
SELECT
  md5(random()::text || clock_timestamp()::text || c.user_id),
  c.user_id,
  c.provider,
  c.provider_user_id,
  now() - interval '90 days',
  now(),
  '["activities", "health"]'::jsonb
FROM endurance_connection c
WHERE c.provider = 'garmin'
  AND NOT EXISTS (
    SELECT 1 FROM endurance_history_request r
    WHERE r.user_id = c.user_id
      AND r.provider = c.provider
      AND r.status IN ('pending', 'processing', 'completed')
  );

CREATE TABLE IF NOT EXISTS endurance_usage_event (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES endurance_user(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL,
  result_status text,
  duration_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS endurance_usage_event_created_idx
  ON endurance_usage_event (created_at DESC);

CREATE INDEX IF NOT EXISTS endurance_usage_event_user_created_idx
  ON endurance_usage_event (user_id, created_at DESC);
