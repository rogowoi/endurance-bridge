import crypto from "node:crypto";

import { database } from "./database.js";
import type { Provider } from "./types.js";

export type HistoryRequestStatus = "pending" | "processing" | "completed" | "failed";

export interface HistoryRequest {
  id: string;
  userId: string;
  displayName?: string;
  provider: Provider;
  providerUserId: string;
  from: string;
  to: string;
  resources: string[];
  status: HistoryRequestStatus;
  createdAt: string;
  updatedAt: string;
}

let schemaReady: Promise<void> | undefined;

async function ensureHistorySchema() {
  schemaReady ??= (async () => {
    const sql = database();
    await sql`
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
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS endurance_history_request_owner_idx
      ON endurance_history_request (status, created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS endurance_history_request_user_idx
      ON endurance_history_request (user_id, provider, from_time, to_time)
    `;
  })();
  try {
    await schemaReady;
  } catch (error) {
    schemaReady = undefined;
    throw error;
  }
}

function rowToRequest(row: Record<string, unknown>): HistoryRequest {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    displayName: row.display_name ? String(row.display_name) : undefined,
    provider: row.provider as Provider,
    providerUserId: String(row.provider_user_id),
    from: new Date(row.from_time as string).toISOString(),
    to: new Date(row.to_time as string).toISOString(),
    resources: Array.isArray(row.resources) ? row.resources.map(String) : [],
    status: row.status as HistoryRequestStatus,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString()
  };
}

export async function requestHistory(input: {
  userId: string;
  provider: Provider;
  providerUserId: string;
  from: Date;
  to: Date;
  resources: string[];
}) {
  await ensureHistorySchema();
  const sql = database();
  const existing = await sql`
    SELECT * FROM endurance_history_request
    WHERE user_id = ${input.userId}
      AND provider = ${input.provider}
      AND from_time <= ${input.from.toISOString()}
      AND to_time >= ${input.to.toISOString()}
      AND status IN ('pending', 'processing', 'completed')
    ORDER BY CASE status WHEN 'completed' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
             created_at DESC
    LIMIT 1
  `;
  if (existing[0]) return rowToRequest(existing[0] as Record<string, unknown>);

  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO endurance_history_request (
      id, user_id, provider, provider_user_id, from_time, to_time, resources
    ) VALUES (
      ${id}, ${input.userId}, ${input.provider}, ${input.providerUserId},
      ${input.from.toISOString()}, ${input.to.toISOString()},
      ${JSON.stringify(input.resources)}::jsonb
    )
    RETURNING *
  `;
  return rowToRequest(rows[0] as Record<string, unknown>);
}

export async function historyState(input: {
  userId: string;
  provider: Provider;
  from: Date;
  to: Date;
}) {
  await ensureHistorySchema();
  const sql = database();
  const rows = await sql`
    SELECT * FROM endurance_history_request
    WHERE user_id = ${input.userId}
      AND provider = ${input.provider}
      AND from_time <= ${input.from.toISOString()}
      AND to_time >= ${input.to.toISOString()}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ? rowToRequest(rows[0] as Record<string, unknown>) : undefined;
}

export async function latestHistoryRequest(userId: string, provider: Provider) {
  await ensureHistorySchema();
  const sql = database();
  const rows = await sql`
    SELECT * FROM endurance_history_request
    WHERE user_id = ${userId} AND provider = ${provider}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ? rowToRequest(rows[0] as Record<string, unknown>) : undefined;
}

export async function listHistoryRequests() {
  await ensureHistorySchema();
  const sql = database();
  const rows = await sql`
    SELECT r.*, u.display_name
    FROM endurance_history_request r
    JOIN endurance_user u ON u.id = r.user_id
    ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
             r.created_at DESC
    LIMIT 100
  `;
  return rows.map((row) => rowToRequest(row as Record<string, unknown>));
}

export async function updateHistoryRequest(
  id: string,
  status: HistoryRequestStatus
) {
  await ensureHistorySchema();
  const sql = database();
  const rows = await sql`
    UPDATE endurance_history_request
    SET status = ${status}, updated_at = now(),
        completed_at = CASE WHEN ${status} = 'completed' THEN now() ELSE completed_at END
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? rowToRequest(rows[0] as Record<string, unknown>) : undefined;
}
