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
