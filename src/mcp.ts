import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getConnection, type ProviderConnection } from "./connections.js";
import {
  activityGroup,
  aggregateActivities,
  asRecord,
  canonicalActivity,
  canonicalHealthEvent,
  HEALTH_EVENT_TYPES,
  type EnduranceProvider,
  type EnduranceResource
} from "./endurance-domain.js";
import {
  openEnduranceChange,
  prepareEnduranceChange,
  sealEnduranceChange
} from "./endurance-changes.js";
import {
  historyState,
  requestHistory,
  type HistoryRequest
} from "./history-requests.js";
import {
  createProductionGarminApi,
  type GarminApi,
  type GarminApiRequest
} from "./providers/garmin-api.js";
import {
  type EventQuery,
  queryEvents,
  queryGarminActivities,
  queryGarminActivity,
  queryProviderEventCoverage
} from "./store.js";
import type { Provider } from "./types.js";
import {
  isOwnerUser,
  recordToolUsage,
  usageReport
} from "./usage.js";

const PROVIDERS = ["garmin"] as const;
const RESOURCES = ["activities", "health", "workouts", "calendar", "routes"] as const;
const APPLY_CONFIRMATION = "APPLY_ENDURANCE_CHANGE";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

const OPEN_READ = { ...READ_ONLY, openWorldHint: true } as const;
const APPLY_CHANGE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true
} as const;

const providerSchema = z.enum(PROVIDERS);
const resourceSchema = z.enum(RESOURCES);
const periodResourceSchema = z.enum(["activities", "health", "calendar"]);
const idSchema = z.union([z.string().min(1), z.number().int().nonnegative()]);
const payloadSchema = z.record(z.string(), z.unknown());

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>
  };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function parseRange(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime()) ||
    fromDate >= toDate
  ) {
    throw new Error("from and to must be valid ISO timestamps with from earlier than to");
  }
  return { from: fromDate, to: toDate };
}

function parseOptionalRange(
  from?: string,
  to?: string
): { from?: Date; to?: Date } {
  if (Boolean(from) !== Boolean(to)) throw new Error("from and to must be provided together");
  return from && to ? parseRange(from, to) : {};
}

function calendarDate(date: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

function dateString(date: Date, timezone: string) {
  const parts = calendarDate(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function schedulePath(from: Date, to: Date, timezone: string) {
  const startDate = dateString(from, timezone);
  const endDate = dateString(new Date(to.getTime() - 1), timezone);
  return `/training-api/schedule?${new URLSearchParams({ startDate, endDate })}`;
}

function rowValue(row: unknown, key: string) {
  return typeof row === "object" && row !== null
    ? (row as Record<string, unknown>)[key]
    : undefined;
}

function isoValue(value: unknown) {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calendarRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["workoutSchedules", "schedules", "items", "data", "results"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return Object.keys(record).some((key) =>
    ["workoutScheduleId", "scheduleId", "calendarDate", "scheduledDate"].includes(key)
  )
    ? [record]
    : [];
}

function canonicalCalendarItem(value: unknown) {
  const record = asRecord(value);
  const workout = asRecord(record.workout);
  const sourceId = String(
    record.workoutScheduleId ?? record.scheduleId ?? record.id ?? "unknown"
  );
  return {
    id: `garmin:${sourceId}`,
    provider: "garmin" as const,
    sourceId,
    date: String(
      record.calendarDate ??
        record.scheduledDate ??
        record.startDate ??
        record.date ??
        ""
    ).slice(0, 10) || null,
    name:
      record.workoutName ?? record.name ?? workout.workoutName ?? workout.name ?? null,
    sport:
      record.sportType ??
      record.activityType ??
      record.workoutType ??
      workout.sportType ??
      workout.activityType ??
      null,
    data: record,
    provenance: { provider: "garmin", delivery: "live" }
  };
}

function sportFamily(value: unknown) {
  const type = String(value ?? "").toLowerCase();
  if (type.includes("run")) return "running";
  if (type.includes("cycl") || type.includes("bike")) return "cycling";
  if (type.includes("swim")) return "swimming";
  if (type.includes("walk") || type.includes("hik")) return "walking";
  if (type.includes("strength") || type.includes("gym")) return "strength";
  return type || null;
}

function matchPlan(
  calendarItems: Array<ReturnType<typeof canonicalCalendarItem>>,
  activityGroups: Awaited<ReturnType<typeof detailedActivities>>,
  timezone: string
) {
  const unused = new Set(activityGroups.map((group) => group.id));
  const matches = calendarItems.map((planned) => {
    const plannedSport = sportFamily(planned.sport);
    const candidates = activityGroups.filter((group) => {
      if (!unused.has(group.id) || !group.primary.startTime || !planned.date) return false;
      const activityDate = dateString(new Date(group.primary.startTime), timezone);
      if (activityDate !== planned.date) return false;
      const activitySport = sportFamily(group.primary.type);
      return !plannedSport || !activitySport || plannedSport === activitySport;
    });
    const matched = candidates[0];
    if (matched) unused.delete(matched.id);
    return {
      status: matched ? "completed" : "planned",
      planned,
      activity: matched?.primary ?? null,
      basis: matched ? "same_local_date_and_sport" : null
    };
  });
  return {
    matches,
    unplannedActivities: activityGroups
      .filter((group) => unused.has(group.id))
      .map((group) => group.primary)
  };
}

const ACTIVITY_TYPES = ["activities", "activityDetails", "manuallyUpdatedActivities"];

export interface McpDataSource {
  connection(provider: Provider): Promise<ProviderConnection | undefined>;
  events(query: EventQuery): Promise<unknown[]>;
  activities(
    providerUserId: string,
    from: Date | undefined,
    to: Date | undefined,
    limit: number
  ): Promise<unknown[]>;
  activity(providerUserId: string, externalId: string): Promise<unknown[]>;
  coverage(
    provider: Provider,
    providerUserId: string,
    eventTypes: string[]
  ): Promise<unknown>;
  historyState(
    provider: Provider,
    from: Date,
    to: Date
  ): Promise<HistoryRequest | undefined>;
  requestHistory(
    provider: Provider,
    providerUserId: string,
    from: Date,
    to: Date,
    resources: string[]
  ): Promise<HistoryRequest>;
}

function productionDataSource(userId: string): McpDataSource {
  return {
    connection: (provider) => getConnection(userId, provider),
    events: queryEvents,
    activities: queryGarminActivities,
    activity: queryGarminActivity,
    coverage: queryProviderEventCoverage,
    historyState: (provider, from, to) =>
      historyState({ userId, provider, from, to }),
    requestHistory: (provider, providerUserId, from, to, resources) =>
      requestHistory({ userId, provider, providerUserId, from, to, resources })
  };
}

function permissionsForResource(resource: EnduranceResource) {
  if (resource === "activities") return "ACTIVITY_EXPORT";
  if (resource === "health") return "HEALTH_EXPORT";
  if (resource === "routes") return "COURSE_IMPORT";
  return "WORKOUT_IMPORT";
}

function providerCapabilities(
  provider: EnduranceProvider,
  connection: ProviderConnection | undefined
) {
  const granted = new Set(connection?.permissions ?? []);
  const resource = (permission: string, delivery: string, operations: string[]) => ({
    available: Boolean(connection) && granted.has(permission),
    permission,
    delivery,
    operations
  });
  return {
    provider,
    status: connection ? "active" : "not_connected",
    connected: Boolean(connection),
    connectedAt: connection?.connectedAt ?? null,
    permissions: connection?.permissions ?? [],
    resources: {
      activities: resource("ACTIVITY_EXPORT", "push_mirror", ["list", "get", "period"]),
      health: resource("HEALTH_EXPORT", "push_mirror", ["query", "period"]),
      workouts: resource("WORKOUT_IMPORT", "live", ["get", "create", "update", "delete"]),
      calendar: resource("WORKOUT_IMPORT", "live", ["query", "create", "update", "delete"]),
      routes: resource("COURSE_IMPORT", "live", ["get", "create", "update", "delete"])
    }
  };
}

async function coverageFor(
  dataSource: McpDataSource,
  provider: EnduranceProvider,
  resource: EnduranceResource,
  connection: ProviderConnection | undefined,
  from?: Date,
  to?: Date
) {
  if (provider !== "garmin") {
    return { provider, resource, status: "unavailable", reason: "adapter_unavailable" };
  }
  if (!connection) return { provider, resource, status: "unavailable", reason: "not_connected" };
  const permission = permissionsForResource(resource);
  if (!connection.permissions.includes(permission)) {
    return { provider, resource, status: "unavailable", reason: "permission_missing", permission };
  }
  if (["workouts", "calendar", "routes"].includes(resource)) {
    return { provider, resource, status: "ready", delivery: "live", requested: from && to ? { from, to } : null };
  }

  const eventTypes = resource === "activities" ? ACTIVITY_TYPES : [...HEALTH_EVENT_TYPES];
  const observed = (await dataSource.coverage(
    provider,
    connection.providerUserId,
    eventTypes
  )) as Record<string, unknown>;
  const connectedAt = new Date(connection.connectedAt);
  const startsBeforeConnection = Boolean(from && from < connectedAt);
  const history = startsBeforeConnection && from && to
    ? await dataSource.historyState(provider, from, to)
    : undefined;
  const historyReady = history?.status === "completed";
  const historyLoading = history?.status === "pending" || history?.status === "processing";
  return {
    provider,
    resource,
    status: startsBeforeConnection
      ? historyReady
        ? "ready"
        : historyLoading
          ? "loading"
          : "partial"
      : "ready",
    delivery: "push_mirror",
    connectedAt: connection.connectedAt,
    requested: from && to ? { from: from.toISOString(), to: to.toISOString() } : null,
    historyBeforeConnection: startsBeforeConnection
      ? history?.status ?? "not_requested"
      : "not_requested",
    historyRequestId: history?.id ?? null,
    observed: {
      earliestStartedAt: isoValue(observed.earliest_started_at),
      latestStartedAt: isoValue(observed.latest_started_at),
      earliestReceivedAt: isoValue(observed.earliest_received_at),
      latestReceivedAt: isoValue(observed.latest_received_at),
      recordCount: Number(observed.record_count ?? 0)
    },
    assurance:
        "Ready means this range is available under the provider delivery model. Loading means the bridge operator is preparing historical data."
  };
}

async function apiRead(api: GarminApi, request: GarminApiRequest) {
  try {
    return { ok: true as const, result: await api.request(request) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Provider request failed"
    };
  }
}

async function detailedActivities(
  dataSource: McpDataSource,
  connection: ProviderConnection,
  from: Date,
  to: Date,
  limit: number
) {
  const rows = await dataSource.activities(connection.providerUserId, from, to, limit);
  return Promise.all(
    rows.map(async (row) => {
      const activity = canonicalActivity(row);
      const records = await dataSource.activity(connection.providerUserId, activity.sourceId);
      return {
        ...activityGroup(activity),
        detailStatus: records.some(
          (record) => rowValue(record, "event_type") === "activityDetails"
        )
          ? "available"
          : "summary_only",
        records
      };
    })
  );
}

async function buildPeriod(input: {
  dataSource: McpDataSource;
  garminApi: GarminApi;
  from: Date;
  to: Date;
  timezone: string;
  include: Array<"activities" | "health" | "calendar">;
}) {
  const connection = await input.dataSource.connection("garmin");
  if (connection && input.from < new Date(connection.connectedAt)) {
    const resources = input.include.filter(
      (resource): resource is "activities" | "health" =>
        resource === "activities" || resource === "health"
    );
    if (resources.length > 0) {
      await input.dataSource.requestHistory(
        "garmin",
        connection.providerUserId,
        input.from,
        input.to,
        resources
      );
    }
  }
  const coverage = await Promise.all(
    input.include.map((resource) =>
      coverageFor(input.dataSource, "garmin", resource, connection, input.from, input.to)
    )
  );
  const missing: Array<Record<string, unknown>> = [];
  let activityGroups: Awaited<ReturnType<typeof detailedActivities>> = [];
  let health: unknown[] = [];
  let calendar: unknown = null;
  let calendarItems: Array<ReturnType<typeof canonicalCalendarItem>> = [];

  if (connection && input.include.includes("activities")) {
    activityGroups = await detailedActivities(input.dataSource, connection, input.from, input.to, 200);
  }
  if (connection && input.include.includes("health")) {
    const rows = await input.dataSource.events({
      provider: "garmin",
      providerUserId: connection.providerUserId,
      from: input.from,
      to: input.to,
      limit: 2000
    });
    health = rows
      .filter((row) => HEALTH_EVENT_TYPES.has(String(rowValue(row, "event_type"))))
      .map(canonicalHealthEvent);
  }
  if (connection && input.include.includes("calendar")) {
    if (connection.permissions.includes("WORKOUT_IMPORT")) {
      const result = await apiRead(input.garminApi, {
        method: "GET",
        path: schedulePath(input.from, input.to, input.timezone)
      });
      if (result.ok) {
        calendarItems = calendarRows(result.result).map(canonicalCalendarItem);
        calendar = {
          provider: "garmin",
          status: "ready",
          items: calendarItems,
          raw: result.result
        };
      } else {
        missing.push({ resource: "calendar", reason: result.error });
      }
    } else {
      missing.push({ resource: "calendar", reason: "permission_missing" });
    }
  }

  const activities = activityGroups.map((group) => group.primary);
  const plan = matchPlan(calendarItems, activityGroups, input.timezone);
  const loading = coverage.some((item) => item.status === "loading");
  const partial = coverage.some((item) => item.status !== "ready") || missing.length > 0;
  return {
    status: loading ? "history_loading" : partial ? "partial" : "ready",
    userMessage: loading
      ? "Recent Garmin history is being prepared by Endurance Bridge. New sessions are live now; retry this period shortly."
      : null,
    period: {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      timezone: input.timezone
    },
    coverage,
    totals: aggregateActivities(activities),
    activityGroups,
    health,
    calendar,
    planMatches: plan.matches,
    unplannedActivities: plan.unplannedActivities,
    missing,
    provenance: {
      activities: "provider_push_mirror",
      health: "provider_push_mirror",
      calendar: "provider_live"
    }
  };
}

export function createEnduranceBridgeMcpServer(
  dataSource?: McpDataSource,
  garminApi?: GarminApi,
  userId = "owner"
) {
  const source = dataSource ?? productionDataSource(userId);
  const providerApi = garminApi ?? createProductionGarminApi(userId);
  const telemetryEnabled = dataSource === undefined;
  const server = new McpServer(
    { name: "endurance-bridge", version: "1.2.0" },
    {
      instructions:
        "For requests about training, workouts, sessions, exercise, recovery, or endurance periods, call endurance_get_period directly before considering calendars or unrelated personal-data tools. Do not call endurance_get_capabilities first unless the user asks about setup or provider status. Every result includes coverage and provenance; never interpret partial data as zero training. If status is history_loading, say only that Endurance Bridge is preparing recent history and suggest retrying shortly; never send the user to provider developer tools. Before changing workouts, calendar items, or routes, call endurance_prepare_change, show its exact preview, obtain immediate approval, then call endurance_apply_change once with confirm=APPLY_ENDURANCE_CHANGE."
    }
  );

  const originalRegisterTool = server.registerTool.bind(server);
  const registerTool = (
    name: string,
    config: unknown,
    handler: (input: any) => Promise<any>
  ) => (originalRegisterTool as any)(
    name,
    config,
    async (input: any) => {
      const started = Date.now();
      try {
        const result = await handler(input);
        const structured = result.structuredContent as Record<string, unknown> | undefined;
        const primary = structured?.primary as Record<string, unknown> | undefined;
        const resultStatus = String(
          primary?.status ?? structured?.status ?? (result.isError ? "error" : "success")
        );
        if (telemetryEnabled) {
          await recordToolUsage({
            userId,
            toolName: name,
            request: input,
            outcome: result.isError ? "error" : "success",
            resultStatus,
            durationMs: Date.now() - started
          }).catch(() => undefined);
        }
        return result;
      } catch (error) {
        if (telemetryEnabled) {
          await recordToolUsage({
            userId,
            toolName: name,
            request: input,
            outcome: "error",
            resultStatus: "exception",
            durationMs: Date.now() - started
          }).catch(() => undefined);
        }
        throw error;
      }
    }
  );

  registerTool(
    "endurance_get_capabilities",
    {
      title: "Get endurance provider capabilities",
      description: "List active connected provider adapters and their read, write, delivery, and permission capabilities. Use only for setup or status questions.",
      inputSchema: z.object({}),
      annotations: READ_ONLY
    },
    async () => {
      const connections = await Promise.all(
        PROVIDERS.map(async (provider) => [provider, await source.connection(provider)] as const)
      );
      return textResult({
        providers: connections.map(([provider, connection]) =>
          providerCapabilities(provider, connection)
        )
      });
    }
  );

  registerTool(
    "endurance_get_coverage",
    {
      title: "Get endurance data coverage",
      description: "Explain whether a provider/resource/date range is ready, partial, live, mirrored, or unavailable.",
      inputSchema: z.object({
        provider: providerSchema.default("garmin"),
        resource: resourceSchema,
        from: z.string().optional(),
        to: z.string().optional()
      }),
      annotations: READ_ONLY
    },
    async ({ provider, resource, from, to }) => {
      try {
        const range = parseOptionalRange(from, to);
        const connection = await source.connection(provider);
        return textResult(
          await coverageFor(source, provider, resource, connection, range.from, range.to)
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid coverage request");
      }
    }
  );

  registerTool(
    "endurance_sync",
    {
      title: "Synchronize endurance data",
      description: "Return or initiate the supported synchronization path for a provider resource and date range.",
      inputSchema: z.object({
        provider: providerSchema.default("garmin"),
        resource: resourceSchema,
        from: z.string(),
        to: z.string()
      }),
      annotations: OPEN_READ
    },
    async ({ provider, resource, from, to }) => {
      try {
        const range = parseRange(from, to);
        const connection = await source.connection(provider);
        const coverage = await coverageFor(source, provider, resource, connection, range.from, range.to);
        if (!connection) return textResult({ status: "unavailable", coverage });
        if (["workouts", "calendar", "routes"].includes(resource)) {
          return textResult({ status: "not_required", reason: "resource_is_read_live", coverage });
        }
        if (range.from >= new Date(connection.connectedAt)) {
          return textResult({
            status: "monitoring_active",
            delivery: "push_mirror",
            nextAction: "Sync the Garmin device with Garmin Connect; new summaries are delivered automatically.",
            coverage
          });
        }
        const history = await source.requestHistory(
          provider,
          connection.providerUserId,
          range.from,
          range.to,
          [resource]
        );
        return textResult({
          status: history.status === "completed" ? "ready" : "history_loading",
          message:
            history.status === "completed"
              ? "Historical data is ready."
              : "Endurance Bridge is preparing this historical range. Retry shortly.",
          requestId: history.id,
          coverage: await coverageFor(
            source,
            provider,
            resource,
            connection,
            range.from,
            range.to
          )
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid sync request");
      }
    }
  );

  registerTool(
    "endurance_get_period",
    {
      title: "Get a complete endurance training period",
      description: "Return activities, details, health context, calendar, deterministic totals, provenance, and coverage for any period. Use this for session, week, block, and comparison discussions.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        timezone: z.string().default("UTC"),
        include: z
          .array(periodResourceSchema)
          .default(["activities", "health", "calendar"]),
        compareTo: z
          .object({ from: z.string(), to: z.string() })
          .optional()
      }),
      annotations: OPEN_READ
    },
    async ({ from, to, timezone, include, compareTo }) => {
      try {
        const range = parseRange(from, to);
        const primary = await buildPeriod({
          dataSource: source,
          garminApi: providerApi,
          ...range,
          timezone,
          include
        });
        const comparison = compareTo
          ? await buildPeriod({
              dataSource: source,
              garminApi: providerApi,
              ...parseRange(compareTo.from, compareTo.to),
              timezone,
              include
            })
          : null;
        return textResult({ primary, comparison });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid period request");
      }
    }
  );

  registerTool(
    "endurance_list_activities",
    {
      title: "List endurance activities",
      description: "List canonical activity groups for a date range with totals, source identity, deduplication keys, and coverage.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        providers: z.array(providerSchema).default(["garmin"]),
        limit: z.number().int().min(1).max(200).default(100)
      }),
      annotations: READ_ONLY
    },
    async ({ from, to, providers, limit }) => {
      try {
        const range = parseRange(from, to);
        const groups: unknown[] = [];
        const coverage: unknown[] = [];
        for (const provider of providers) {
          const connection = await source.connection(provider);
          coverage.push(
            await coverageFor(source, provider, "activities", connection, range.from, range.to)
          );
          if (provider === "garmin" && connection) {
            groups.push(...(await detailedActivities(source, connection, range.from, range.to, limit)));
          }
        }
        const activities = groups.map((group) =>
          (group as { primary: ReturnType<typeof canonicalActivity> }).primary
        );
        return textResult({
          status: (coverage as Array<{ status?: string }>).every((item) => item.status === "ready")
            ? "ready"
            : "partial",
          coverage,
          totals: aggregateActivities(activities),
          activityGroups: groups
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid activity query");
      }
    }
  );

  registerTool(
    "endurance_get_activity",
    {
      title: "Get an endurance activity",
      description: "Retrieve one canonical activity and every available provider detail record.",
      inputSchema: z.object({ activityId: z.string().min(1) }),
      annotations: READ_ONLY
    },
    async ({ activityId }) => {
      const [provider, ...idParts] = activityId.split(":");
      const sourceId = idParts.join(":");
      if (provider !== "garmin" || !sourceId) {
        return errorResult("activityId must be a canonical ID returned by endurance_list_activities");
      }
      const connection = await source.connection(provider);
      if (!connection) return errorResult("Provider is not connected");
      const records = await source.activity(connection.providerUserId, sourceId);
      if (!records[0]) return errorResult("Activity is not available in this account's coverage");
      const summary =
        records.find((record) => rowValue(record, "event_type") !== "activityDetails") ??
        records[0];
      return textResult({
        activity: canonicalActivity(summary),
        detailStatus: records.some((record) => rowValue(record, "event_type") === "activityDetails")
          ? "available"
          : "summary_only",
        records
      });
    }
  );

  registerTool(
    "endurance_get_health",
    {
      title: "Get endurance health and recovery data",
      description: "Retrieve canonical health and recovery summaries received from connected providers for a period.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        types: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(2000).default(1000)
      }),
      annotations: READ_ONLY
    },
    async ({ from, to, types, limit }) => {
      try {
        const range = parseRange(from, to);
        const connection = await source.connection("garmin");
        const coverage = await coverageFor(source, "garmin", "health", connection, range.from, range.to);
        if (!connection) return textResult({ status: "unavailable", coverage, events: [] });
        const rows = await source.events({
          provider: "garmin",
          providerUserId: connection.providerUserId,
          from: range.from,
          to: range.to,
          limit
        });
        const events = rows
          .filter((row) => {
            const type = String(rowValue(row, "event_type"));
            return HEALTH_EVENT_TYPES.has(type) && (!types || types.includes(type));
          })
          .map(canonicalHealthEvent);
        return textResult({ status: coverage.status, coverage, count: events.length, events });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid health query");
      }
    }
  );

  registerTool(
    "endurance_get_workouts",
    {
      title: "Get endurance workouts",
      description: "Retrieve structured workouts by provider ID from connected providers.",
      inputSchema: z.object({
        provider: providerSchema.default("garmin"),
        workoutIds: z.array(idSchema).min(1).max(50)
      }),
      annotations: OPEN_READ
    },
    async ({ provider, workoutIds }) => {
      const connection = await source.connection(provider);
      if (provider !== "garmin" || !connection) {
        return textResult({ status: "unavailable", provider, workouts: [] });
      }
      const workouts = await Promise.all(
        workoutIds.map(async (workoutId: string | number) => ({
          id: `${provider}:${workoutId}`,
          provider,
          sourceId: String(workoutId),
          response: await apiRead(providerApi, {
            method: "GET",
            path: `/training-api/workout/v2/${encodeURIComponent(String(workoutId))}`
          })
        }))
      );
      return textResult({ status: "ready", workouts });
    }
  );

  registerTool(
    "endurance_get_calendar",
    {
      title: "Get endurance training calendar",
      description: "Retrieve planned training calendar items live from connected providers.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        timezone: z.string().default("UTC"),
        providers: z.array(providerSchema).default(["garmin"])
      }),
      annotations: OPEN_READ
    },
    async ({ from, to, timezone, providers }) => {
      try {
        const range = parseRange(from, to);
        const results: Record<string, unknown> = {};
        for (const provider of providers) {
          const connection = await source.connection(provider);
          if (provider !== "garmin" || !connection) {
            results[provider] = { status: "unavailable" };
            continue;
          }
          if (!connection.permissions.includes("WORKOUT_IMPORT")) {
            results[provider] = {
              status: "unavailable",
              reason: "permission_missing"
            };
            continue;
          }
          const response = await apiRead(providerApi, {
            method: "GET",
            path: schedulePath(range.from, range.to, timezone)
          });
          results[provider] = response.ok
            ? {
                status: "ready",
                items: calendarRows(response.result).map(canonicalCalendarItem),
                raw: response.result
              }
            : response;
        }
        return textResult({ period: { from, to, timezone }, providers: results });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid calendar query");
      }
    }
  );

  registerTool(
    "endurance_get_routes",
    {
      title: "Get endurance routes",
      description: "Retrieve routes by canonical or provider IDs from connected providers.",
      inputSchema: z.object({
        provider: providerSchema.default("garmin"),
        routeIds: z.array(idSchema).min(1).max(50)
      }),
      annotations: OPEN_READ
    },
    async ({ provider, routeIds }) => {
      const connection = await source.connection(provider);
      if (provider !== "garmin" || !connection) {
        return textResult({ status: "unavailable", provider, routes: [] });
      }
      const routes = await Promise.all(
        routeIds.map(async (routeId: string | number) => ({
          id: `${provider}:${routeId}`,
          provider,
          sourceId: String(routeId),
          response: await apiRead(providerApi, {
            method: "GET",
            path: `/training-api/courses/v1/course/${encodeURIComponent(String(routeId))}`
          })
        }))
      );
      return textResult({ status: "ready", routes });
    }
  );

  registerTool(
    "endurance_prepare_change",
    {
      title: "Prepare an endurance change",
      description: "Validate and preview a provider-neutral create, update, or delete operation for a workout, calendar item, or route without executing it.",
      inputSchema: z.object({
        provider: z.literal("garmin").default("garmin"),
        resource: z.enum(["workout", "calendar_item", "route"]),
        operation: z.enum(["create", "update", "delete"]),
        resourceId: z.string().optional(),
        payload: payloadSchema.optional()
      }),
      annotations: READ_ONLY
    },
    async ({ provider, resource, operation, resourceId, payload }) => {
      try {
        const connection = await source.connection(provider);
        if (!connection) return errorResult("Target provider is not connected");
        const change = prepareEnduranceChange({
          userId,
          provider,
          resource,
          operation,
          resourceId,
          payload
        });
        if (!connection.permissions.includes(change.permission)) {
          return errorResult(`Provider permission ${change.permission} is not granted`);
        }
        return textResult({
          status: "prepared",
          preview: {
            provider,
            resource,
            operation,
            resourceId: resourceId ?? null,
            method: change.request.method,
            path: change.request.path,
            payload: change.request.body ?? null,
            expiresAt: change.expiresAt
          },
          changeToken: sealEnduranceChange(change),
          applyWith: { tool: "endurance_apply_change", confirm: APPLY_CONFIRMATION }
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid change");
      }
    }
  );

  registerTool(
    "endurance_apply_change",
    {
      title: "Apply a prepared endurance change",
      description: "Execute one unexpired prepared change after the user approves its exact preview.",
      inputSchema: z.object({
        changeToken: z.string().min(1),
        confirm: z.string().describe(`Must equal ${APPLY_CONFIRMATION}`)
      }),
      annotations: APPLY_CHANGE
    },
    async ({ changeToken, confirm }) => {
      if (confirm !== APPLY_CONFIRMATION) {
        return errorResult(`Set confirm to ${APPLY_CONFIRMATION} after approval`);
      }
      try {
        const change = openEnduranceChange(changeToken, userId);
        const connection = await source.connection(change.provider);
        if (!connection) return errorResult("Target provider is not connected");
        if (!connection.permissions.includes(change.permission)) {
          return errorResult(`Provider permission ${change.permission} is not granted`);
        }
        const result = await providerApi.request(change.request);
        return textResult({
          status: "applied",
          change: {
            provider: change.provider,
            resource: change.resource,
            operation: change.operation,
            resourceId: change.resourceId ?? null
          },
          result
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Change failed");
      }
    }
  );

  registerTool(
    "endurance_get_usage_report",
    {
      title: "Get Endurance Bridge usage report",
      description: "Owner-only operational report of active users, tool intent, result states, latency, and recent problems. Does not contain training payloads, credentials, or original natural-language prompts.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).default(7)
      }),
      annotations: READ_ONLY
    },
    async ({ days }) => {
      if (!(await isOwnerUser(userId))) return errorResult("Owner access required");
      return textResult(await usageReport(days));
    }
  );

  return server;
}
