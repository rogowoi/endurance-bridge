import crypto from "node:crypto";

import { database } from "./database.js";

let schemaReady: Promise<void> | undefined;

async function ensureUsageSchema() {
  schemaReady ??= (async () => {
    const sql = database();
    await sql`
      CREATE TABLE IF NOT EXISTS endurance_usage_event (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES endurance_user(id) ON DELETE CASCADE,
        tool_name text NOT NULL,
        request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        outcome text NOT NULL,
        result_status text,
        duration_ms integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS endurance_usage_event_created_idx
      ON endurance_usage_event (created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS endurance_usage_event_user_created_idx
      ON endurance_usage_event (user_id, created_at DESC)
    `;
  })();
  try {
    await schemaReady;
  } catch (error) {
    schemaReady = undefined;
    throw error;
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function summarizeToolRequest(value: unknown) {
  const input = record(value);
  const summary: Record<string, unknown> = {};
  for (const key of ["provider", "resource", "operation", "from", "to", "timezone", "limit"]) {
    if (["string", "number", "boolean"].includes(typeof input[key])) summary[key] = input[key];
  }
  for (const key of ["include", "providers", "types"]) {
    if (Array.isArray(input[key])) summary[key] = (input[key] as unknown[]).map(String).slice(0, 20);
  }
  const compare = record(input.compareTo);
  if (compare.from || compare.to) summary.compareTo = { from: compare.from, to: compare.to };
  if (Array.isArray(input.workoutIds)) summary.workoutCount = input.workoutIds.length;
  if (Array.isArray(input.routeIds)) summary.routeCount = input.routeIds.length;
  return summary;
}

export async function recordToolUsage(input: {
  userId: string;
  toolName: string;
  request: unknown;
  outcome: "success" | "error";
  resultStatus?: string | null;
  durationMs: number;
}) {
  await ensureUsageSchema();
  const sql = database();
  await sql`
    INSERT INTO endurance_usage_event (
      id, user_id, tool_name, request_summary, outcome, result_status, duration_ms
    ) VALUES (
      ${crypto.randomUUID()}, ${input.userId}, ${input.toolName},
      ${JSON.stringify(summarizeToolRequest(input.request))}::jsonb,
      ${input.outcome}, ${input.resultStatus ?? null}, ${Math.max(0, Math.round(input.durationMs))}
    )
  `;
}

export async function isOwnerUser(userId: string) {
  const sql = database();
  const rows = await sql`SELECT is_owner FROM endurance_user WHERE id = ${userId} LIMIT 1`;
  return Boolean(rows[0]?.is_owner);
}

export async function usageReport(days = 7) {
  await ensureUsageSchema();
  const sql = database();
  const safeDays = Math.min(90, Math.max(1, Math.round(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const [overview, tools, statuses, users, recentProblems] = await Promise.all([
    sql`
      SELECT count(*)::int AS calls,
             count(DISTINCT user_id)::int AS active_users,
             count(*) FILTER (WHERE outcome = 'error')::int AS errors,
             round(avg(duration_ms))::int AS avg_duration_ms,
             round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95_duration_ms
      FROM endurance_usage_event WHERE created_at >= ${since}
        AND tool_name <> 'endurance_get_usage_report'
    `,
    sql`
      SELECT tool_name, count(*)::int AS calls,
             count(*) FILTER (WHERE outcome = 'error')::int AS errors,
             round(avg(duration_ms))::int AS avg_duration_ms
      FROM endurance_usage_event WHERE created_at >= ${since}
        AND tool_name <> 'endurance_get_usage_report'
      GROUP BY tool_name ORDER BY calls DESC
    `,
    sql`
      SELECT coalesce(result_status, outcome) AS status, count(*)::int AS calls
      FROM endurance_usage_event WHERE created_at >= ${since}
        AND tool_name <> 'endurance_get_usage_report'
      GROUP BY coalesce(result_status, outcome) ORDER BY calls DESC
    `,
    sql`
      SELECT u.display_name, count(*)::int AS calls,
             max(e.created_at) AS last_used_at
      FROM endurance_usage_event e JOIN endurance_user u ON u.id = e.user_id
      WHERE e.created_at >= ${since} AND e.tool_name <> 'endurance_get_usage_report'
      GROUP BY u.id, u.display_name ORDER BY calls DESC
    `,
    sql`
      SELECT u.display_name, e.tool_name, e.request_summary, e.outcome,
             e.result_status, e.duration_ms, e.created_at
      FROM endurance_usage_event e JOIN endurance_user u ON u.id = e.user_id
      WHERE e.created_at >= ${since}
        AND (e.outcome = 'error' OR e.result_status IN ('partial', 'history_loading', 'unavailable'))
      ORDER BY e.created_at DESC LIMIT 25
    `
  ]);
  return { days: safeDays, since, overview: overview[0] ?? {}, tools, statuses, users, recentProblems };
}
