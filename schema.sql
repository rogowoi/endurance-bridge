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
  provider text NOT NULL UNIQUE,
  provider_user_id text NOT NULL,
  encrypted_token text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS endurance_connection_provider_user_idx
  ON endurance_connection (provider, provider_user_id);

CREATE TABLE IF NOT EXISTS endurance_oauth_state (
  state_hash text PRIMARY KEY,
  provider text NOT NULL,
  encrypted_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS endurance_oauth_state_expiry_idx
  ON endurance_oauth_state (expires_at);
