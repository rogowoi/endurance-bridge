import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getConnection, type ProviderConnection } from "./connections.js";
import {
  type EventQuery,
  queryEvents,
  queryGarminActivities,
  queryGarminActivity
} from "./store.js";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

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

export function createEnduranceBridgeMcpServer(
  dataSource: McpDataSource = productionDataSource
) {
  const server = new McpServer(
    { name: "endurance-bridge", version: "0.2.0" },
    {
      instructions:
        "Endurance Bridge exposes private endurance-sport data through read-only tools. Treat activity, health, location, and routine data as sensitive. Never infer that missing data means no training occurred; provider feeds may be delayed or connected after an activity was uploaded. This server never writes to Garmin."
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
        "Inspect raw normalized Garmin feed events, including lifecycle and permission changes.",
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

  return server;
}
