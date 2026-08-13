import crypto from "node:crypto";

import { neon } from "@neondatabase/serverless";

import type { EnduranceEvent, Provider } from "./types.js";

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return neon(url);
}

export async function upsertEvents(events: EnduranceEvent[]): Promise<void> {
  const sql = database();
  for (const event of events) {
    const id = crypto
      .createHash("sha256")
      .update(`${event.provider}:${event.providerUserId}:${event.eventType}:${event.externalId}`)
      .digest("hex");
    await sql`
      INSERT INTO endurance_event (
        id, provider, provider_user_id, event_type, external_id,
        started_at, occurred_on, payload
      ) VALUES (
        ${id}, ${event.provider}, ${event.providerUserId}, ${event.eventType},
        ${event.externalId}, ${event.startedAt?.toISOString() ?? null},
        ${event.occurredOn}, ${JSON.stringify(event.payload)}::jsonb
      )
      ON CONFLICT (provider, provider_user_id, event_type, external_id)
      DO UPDATE SET
        started_at = EXCLUDED.started_at,
        occurred_on = EXCLUDED.occurred_on,
        payload = EXCLUDED.payload,
        received_at = now(),
        updated_at = now()
    `;
  }
}

export async function deleteProviderUser(
  provider: Provider,
  providerUserId: string
): Promise<void> {
  const sql = database();
  await sql`
    DELETE FROM endurance_event
    WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
  `;
}

export interface EventQuery {
  provider: Provider;
  providerUserId: string;
  eventType?: string;
  from?: Date;
  to?: Date;
  limit: number;
}

export async function queryEvents(query: EventQuery) {
  const sql = database();
  const rows = query.eventType && query.from && query.to
    ? await sql`
        SELECT provider, provider_user_id, event_type, external_id,
               started_at, occurred_on, payload, received_at
        FROM endurance_event
        WHERE provider = ${query.provider}
          AND provider_user_id = ${query.providerUserId}
          AND event_type = ${query.eventType}
          AND started_at >= ${query.from.toISOString()}
          AND started_at < ${query.to.toISOString()}
        ORDER BY started_at ASC, received_at ASC
        LIMIT ${query.limit}
      `
    : query.eventType
      ? await sql`
          SELECT provider, provider_user_id, event_type, external_id,
                 started_at, occurred_on, payload, received_at
          FROM endurance_event
          WHERE provider = ${query.provider}
            AND provider_user_id = ${query.providerUserId}
            AND event_type = ${query.eventType}
        ORDER BY started_at ASC NULLS LAST, received_at ASC
        LIMIT ${query.limit}
      `
      : query.from && query.to
        ? await sql`
            SELECT provider, provider_user_id, event_type, external_id,
                   started_at, occurred_on, payload, received_at
            FROM endurance_event
            WHERE provider = ${query.provider}
              AND provider_user_id = ${query.providerUserId}
              AND started_at >= ${query.from.toISOString()}
              AND started_at < ${query.to.toISOString()}
            ORDER BY started_at ASC, received_at ASC
            LIMIT ${query.limit}
          `
      : await sql`
          SELECT provider, provider_user_id, event_type, external_id,
                 started_at, occurred_on, payload, received_at
          FROM endurance_event
          WHERE provider = ${query.provider}
            AND provider_user_id = ${query.providerUserId}
          ORDER BY started_at ASC NULLS LAST, received_at ASC
          LIMIT ${query.limit}
        `;
  return rows;
}
