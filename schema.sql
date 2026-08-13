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
