import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getConnection, type ProviderConnection } from "./connections.js";
import {
  productionGarminApi,
  type GarminApi,
  type GarminApiRequest
} from "./providers/garmin-api.js";
import {
  type EventQuery,
  queryEvents,
  queryGarminActivities,
  queryGarminActivity
} from "./store.js";

const CONFIRMATION = "WRITE_TO_GARMIN";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

const GARMIN_READ = { ...READ_ONLY, openWorldHint: true } as const;

const CREATE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true
} as const;

const MUTATE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true
} as const;

const idSchema = z
  .union([z.string().min(1), z.number().int().nonnegative()])
  .describe("Garmin resource ID");

const payloadSchema = z
  .record(z.string(), z.unknown())
  .describe("Full Garmin resource JSON object");

const writeControlSchema = {
  dryRun: z
    .boolean()
    .default(true)
    .describe("Preview the exact Garmin request without sending it"),
  confirm: z
    .string()
    .optional()
    .describe(`Required as ${CONFIRMATION} when dryRun is false`)
};

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}

function dateRange(from?: string, to?: string) {
  if (Boolean(from) !== Boolean(to)) {
    throw new Error("from and to must be provided together");
  }
  if (!from || !to) return {};
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

function scheduleRange(startDate: string, endDate: string) {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(startDate) || !pattern.test(endDate) || startDate > endDate) {
    throw new Error(
      "startDate and endDate must be YYYY-MM-DD values with startDate no later than endDate"
    );
  }
  return new URLSearchParams({ startDate, endDate }).toString();
}

function assertCreateIdAbsent(
  payload: Record<string, unknown>,
  field: string
) {
  if (payload[field] !== undefined && payload[field] !== null) {
    throw new Error(`${field} must be omitted when creating this Garmin resource`);
  }
}

function assertUpdateIdMatches(
  payload: Record<string, unknown>,
  field: string,
  id: string | number
) {
  if (
    payload[field] !== undefined &&
    payload[field] !== null &&
    String(payload[field]) !== String(id)
  ) {
    throw new Error(`${field} in the payload must match the resource ID in the tool input`);
  }
}

export interface McpDataSource {
  connection(provider: "garmin"): Promise<ProviderConnection | undefined>;
  events(query: EventQuery): Promise<unknown[]>;
  activities(
    providerUserId: string,
    from: Date | undefined,
    to: Date | undefined,
    limit: number
  ): Promise<unknown[]>;
  activity(providerUserId: string, externalId: string): Promise<unknown[]>;
}

const productionDataSource: McpDataSource = {
  connection: getConnection,
  events: queryEvents,
  activities: queryGarminActivities,
  activity: queryGarminActivity
};

async function liveRead(api: GarminApi, request: GarminApiRequest) {
  try {
    const result = await api.request(request);
    return textResult({ result });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "Garmin API request failed");
  }
}

async function writeGarmin(input: {
  dataSource: McpDataSource;
  api: GarminApi;
  permission: "WORKOUT_IMPORT" | "COURSE_IMPORT";
  request: GarminApiRequest;
  dryRun: boolean;
  confirm?: string;
}) {
  const connection = await input.dataSource.connection("garmin");
  if (!connection) return errorResult("Garmin is not connected.");
  if (!connection.permissions.includes(input.permission)) {
    return errorResult(`Garmin permission ${input.permission} is not granted.`);
  }
  const preview = {
    provider: "garmin",
    method: input.request.method,
    path: input.request.path,
    payload: input.request.body ?? null
  };
  if (input.dryRun) {
    return textResult({ dryRun: true, willExecute: preview });
  }
  if (input.confirm !== CONFIRMATION) {
    return errorResult(
      `Set confirm to ${CONFIRMATION} to execute this exact Garmin mutation.`
    );
  }
  try {
    const result = await input.api.request(input.request);
    return textResult({ dryRun: false, executed: preview, result });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "Garmin API request failed");
  }
}

export function createEnduranceBridgeMcpServer(
  dataSource: McpDataSource = productionDataSource,
  garminApi: GarminApi = productionGarminApi
) {
  const server = new McpServer(
    { name: "endurance-bridge", version: "0.3.0" },
    {
      instructions:
        "Endurance Bridge exposes private Garmin activity data and the complete Garmin Training and Courses resource operations. Treat activity, health, location, routes, workouts, and routine data as sensitive. Reads execute immediately. Before every create, update, schedule, or delete operation, call the same tool with dryRun=true, show the exact request to the user, obtain immediate approval, then call it once with dryRun=false and confirm=WRITE_TO_GARMIN. Never reuse a confirmation. Missing feed data does not prove that no training occurred."
    }
  );

  server.registerTool(
    "garmin_connection_status",
    {
      title: "Garmin connection status",
      description:
        "Check whether Garmin is connected and list the permissions granted to Endurance Bridge.",
      inputSchema: z.object({}),
      annotations: READ_ONLY
    },
    async () => {
      const connection = await dataSource.connection("garmin");
      return textResult({
        connected: Boolean(connection),
        provider: "garmin",
        permissions: connection?.permissions ?? [],
        connectedAt: connection?.connectedAt ?? null,
        adapters: {
          garmin: "active",
          strava: "planned",
          trainingpeaks: "planned"
        }
      });
    }
  );

  server.registerTool(
    "garmin_list_activities",
    {
      title: "List Garmin activities",
      description:
        "List completed Garmin activities. Optionally restrict results to an ISO timestamp range.",
      inputSchema: z.object({
        from: z.string().optional().describe("Inclusive ISO timestamp"),
        to: z.string().optional().describe("Exclusive ISO timestamp"),
        limit: z.number().int().min(1).max(200).default(50)
      }),
      annotations: READ_ONLY
    },
    async ({ from, to, limit }) => {
      const connection = await dataSource.connection("garmin");
      if (!connection) return errorResult("Garmin is not connected.");
      try {
        const range = dateRange(from, to);
        const activities = await dataSource.activities(
          connection.providerUserId,
          range.from,
          range.to,
          limit
        );
        return textResult({ count: activities.length, activities });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid activity query");
      }
    }
  );

  server.registerTool(
    "garmin_get_activity",
    {
      title: "Get Garmin activity",
      description:
        "Retrieve every stored Garmin summary or detail record matching an activity summary ID.",
      inputSchema: z.object({
        summaryId: z.string().min(1).describe("The summary ID returned by garmin_list_activities")
      }),
      annotations: READ_ONLY
    },
    async ({ summaryId }) => {
      const connection = await dataSource.connection("garmin");
      if (!connection) return errorResult("Garmin is not connected.");
      const records = await dataSource.activity(connection.providerUserId, summaryId);
      return textResult({ count: records.length, records });
    }
  );

  server.registerTool(
    "garmin_list_events",
    {
      title: "List Garmin feed events",
      description:
        "Inspect raw normalized Garmin feed events, including health, activity, women's health, lifecycle, and permission events received by this bridge.",
      inputSchema: z.object({
        type: z.string().optional().describe("Optional Garmin event type"),
        from: z.string().optional().describe("Inclusive ISO timestamp"),
        to: z.string().optional().describe("Exclusive ISO timestamp"),
        limit: z.number().int().min(1).max(200).default(50)
      }),
      annotations: READ_ONLY
    },
    async ({ type, from, to, limit }) => {
      const connection = await dataSource.connection("garmin");
      if (!connection) return errorResult("Garmin is not connected.");
      try {
        const range = dateRange(from, to);
        const events = await dataSource.events({
          provider: "garmin",
          providerUserId: connection.providerUserId,
          eventType: type,
          from: range.from,
          to: range.to,
          limit
        });
        return textResult({ count: events.length, events });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid event query");
      }
    }
  );

  server.registerTool(
    "garmin_get_workout",
    {
      title: "Get Garmin workout",
      description: "Retrieve one structured workout directly from Garmin.",
      inputSchema: z.object({ workoutId: idSchema }),
      annotations: GARMIN_READ
    },
    async ({ workoutId }) =>
      liveRead(garminApi, {
        method: "GET",
        path: `/training-api/workout/v2/${encodeURIComponent(String(workoutId))}`
      })
  );

  server.registerTool(
    "garmin_create_workout",
    {
      title: "Create Garmin workout",
      description: "Preview or create a structured workout in Garmin.",
      inputSchema: z.object({ payload: payloadSchema, ...writeControlSchema }),
      annotations: CREATE
    },
    async ({ payload, dryRun, confirm }) => {
      try {
        assertCreateIdAbsent(payload, "workoutId");
        return writeGarmin({
          dataSource,
          api: garminApi,
          permission: "WORKOUT_IMPORT",
          request: { method: "POST", path: "/workoutportal/workout/v2", body: payload },
          dryRun,
          confirm
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid workout payload");
      }
    }
  );

  server.registerTool(
    "garmin_update_workout",
    {
      title: "Update Garmin workout",
      description: "Preview or replace a Garmin structured workout with a full resource payload.",
      inputSchema: z.object({ workoutId: idSchema, payload: payloadSchema, ...writeControlSchema }),
      annotations: MUTATE
    },
    async ({ workoutId, payload, dryRun, confirm }) => {
      try {
        assertUpdateIdMatches(payload, "workoutId", workoutId);
        return writeGarmin({
          dataSource,
          api: garminApi,
          permission: "WORKOUT_IMPORT",
          request: {
            method: "PUT",
            path: `/training-api/workout/v2/${encodeURIComponent(String(workoutId))}`,
            body: payload
          },
          dryRun,
          confirm
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid workout payload");
      }
    }
  );

  server.registerTool(
    "garmin_delete_workout",
    {
      title: "Delete Garmin workout",
      description: "Preview or permanently delete a structured workout from Garmin.",
      inputSchema: z.object({ workoutId: idSchema, ...writeControlSchema }),
      annotations: MUTATE
    },
    async ({ workoutId, dryRun, confirm }) =>
      writeGarmin({
        dataSource,
        api: garminApi,
        permission: "WORKOUT_IMPORT",
        request: {
          method: "DELETE",
          path: `/training-api/workout/v2/${encodeURIComponent(String(workoutId))}`
        },
        dryRun,
        confirm
      })
  );

  server.registerTool(
    "garmin_list_schedules",
    {
      title: "List Garmin workout schedules",
      description: "Retrieve scheduled Garmin workouts within an inclusive calendar-date range.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date as YYYY-MM-DD"),
        endDate: z.string().describe("End date as YYYY-MM-DD")
      }),
      annotations: GARMIN_READ
    },
    async ({ startDate, endDate }) => {
      try {
        const query = scheduleRange(startDate, endDate);
        return liveRead(garminApi, {
          method: "GET",
          path: `/training-api/schedule?${query}`
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid schedule range");
      }
    }
  );

  server.registerTool(
    "garmin_get_schedule",
    {
      title: "Get Garmin workout schedule",
      description: "Retrieve one scheduled workout directly from Garmin.",
      inputSchema: z.object({ workoutScheduleId: idSchema }),
      annotations: GARMIN_READ
    },
    async ({ workoutScheduleId }) =>
      liveRead(garminApi, {
        method: "GET",
        path: `/training-api/schedule/${encodeURIComponent(String(workoutScheduleId))}`
      })
  );

  server.registerTool(
    "garmin_create_schedule",
    {
      title: "Schedule Garmin workout",
      description: "Preview or create a Garmin workout schedule.",
      inputSchema: z.object({ payload: payloadSchema, ...writeControlSchema }),
      annotations: CREATE
    },
    async ({ payload, dryRun, confirm }) => {
      try {
        assertCreateIdAbsent(payload, "scheduleId");
        return writeGarmin({
          dataSource,
          api: garminApi,
          permission: "WORKOUT_IMPORT",
          request: { method: "POST", path: "/training-api/schedule/", body: payload },
          dryRun,
          confirm
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid schedule payload");
      }
    }
  );

  server.registerTool(
    "garmin_update_schedule",
    {
      title: "Update Garmin workout schedule",
      description: "Preview or replace a Garmin workout schedule with a full resource payload.",
      inputSchema: z.object({
        workoutScheduleId: idSchema,
        payload: payloadSchema,
        ...writeControlSchema
      }),
      annotations: MUTATE
    },
    async ({ workoutScheduleId, payload, dryRun, confirm }) => {
      try {
        assertUpdateIdMatches(payload, "scheduleId", workoutScheduleId);
        return writeGarmin({
          dataSource,
          api: garminApi,
          permission: "WORKOUT_IMPORT",
          request: {
            method: "PUT",
            path: `/training-api/schedule/${encodeURIComponent(String(workoutScheduleId))}`,
            body: payload
          },
          dryRun,
          confirm
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid schedule payload");
      }
    }
  );

  server.registerTool(
    "garmin_delete_schedule",
    {
      title: "Delete Garmin workout schedule",
      description: "Preview or permanently delete a scheduled workout from Garmin.",
      inputSchema: z.object({ workoutScheduleId: idSchema, ...writeControlSchema }),
      annotations: MUTATE
    },
    async ({ workoutScheduleId, dryRun, confirm }) =>
      writeGarmin({
        dataSource,
        api: garminApi,
        permission: "WORKOUT_IMPORT",
        request: {
          method: "DELETE",
          path: `/training-api/schedule/${encodeURIComponent(String(workoutScheduleId))}`
        },
        dryRun,
        confirm
      })
  );

  server.registerTool(
    "garmin_get_course",
    {
      title: "Get Garmin course",
      description: "Retrieve one course or route directly from Garmin.",
      inputSchema: z.object({ courseId: idSchema }),
      annotations: GARMIN_READ
    },
    async ({ courseId }) =>
      liveRead(garminApi, {
        method: "GET",
        path: `/training-api/courses/v1/course/${encodeURIComponent(String(courseId))}`
      })
  );

  server.registerTool(
    "garmin_create_course",
    {
      title: "Create Garmin course",
      description: "Preview or create a course or route in Garmin.",
      inputSchema: z.object({ payload: payloadSchema, ...writeControlSchema }),
      annotations: CREATE
    },
    async ({ payload, dryRun, confirm }) => {
      try {
        assertCreateIdAbsent(payload, "courseId");
        return writeGarmin({
          dataSource,
          api: garminApi,
          permission: "COURSE_IMPORT",
          request: {
            method: "POST",
            path: "/training-api/courses/v1/course",
            body: payload
          },
          dryRun,
          confirm
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid course payload");
      }
    }
  );

  server.registerTool(
    "garmin_update_course",
    {
      title: "Update Garmin course",
      description: "Preview or replace a Garmin course or route with a full resource payload.",
      inputSchema: z.object({ courseId: idSchema, payload: payloadSchema, ...writeControlSchema }),
      annotations: MUTATE
    },
    async ({ courseId, payload, dryRun, confirm }) => {
      try {
        assertUpdateIdMatches(payload, "courseId", courseId);
        return writeGarmin({
          dataSource,
          api: garminApi,
          permission: "COURSE_IMPORT",
          request: {
            method: "PUT",
            path: `/training-api/courses/v1/course/${encodeURIComponent(String(courseId))}`,
            body: payload
          },
          dryRun,
          confirm
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Invalid course payload");
      }
    }
  );

  server.registerTool(
    "garmin_delete_course",
    {
      title: "Delete Garmin course",
      description: "Preview or permanently delete a course or route from Garmin.",
      inputSchema: z.object({ courseId: idSchema, ...writeControlSchema }),
      annotations: MUTATE
    },
    async ({ courseId, dryRun, confirm }) =>
      writeGarmin({
        dataSource,
        api: garminApi,
        permission: "COURSE_IMPORT",
        request: {
          method: "DELETE",
          path: `/training-api/courses/v1/course/${encodeURIComponent(String(courseId))}`
        },
        dryRun,
        confirm
      })
  );

  return server;
}
