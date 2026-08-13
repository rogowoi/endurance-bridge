import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import {
  createEnduranceBridgeMcpServer,
  type McpDataSource
} from "../src/mcp.js";
import type { GarminApi, GarminApiRequest } from "../src/providers/garmin-api.js";

process.env.CONNECTION_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

function dataSource(): McpDataSource {
  return {
    async connection(provider) {
      if (provider !== "garmin") return undefined;
      return {
        provider: "garmin",
        providerUserId: "garmin-user",
        permissions: [
          "ACTIVITY_EXPORT",
          "HEALTH_EXPORT",
          "WORKOUT_IMPORT",
          "COURSE_IMPORT"
        ],
        connectedAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      };
    },
    async activities() {
      return [
        {
          provider: "garmin",
          event_type: "activities",
          external_id: "activity-1",
          started_at: "2026-08-13T06:00:00.000Z",
          received_at: "2026-08-13T07:00:00.000Z",
          payload: {
            activityName: "Morning run",
            activityType: "RUNNING",
            durationInSeconds: 1800,
            distanceInMeters: 5000
          }
        }
      ];
    },
    async activity(_userId, externalId) {
      return [
        {
          provider: "garmin",
          external_id: externalId,
          event_type: "activities",
          started_at: "2026-08-13T06:00:00.000Z",
          payload: { activityType: "RUNNING", durationInSeconds: 1800 }
        },
        {
          provider: "garmin",
          external_id: externalId,
          event_type: "activityDetails",
          started_at: "2026-08-13T06:00:00.000Z",
          payload: { summaryId: externalId, samples: [] }
        }
      ];
    },
    async events() {
      return [
        {
          provider: "garmin",
          event_type: "sleeps",
          external_id: "sleep-1",
          started_at: "2026-08-13T00:00:00.000Z",
          occurred_on: "2026-08-13",
          received_at: "2026-08-13T07:00:00.000Z",
          payload: { durationInSeconds: 28800 }
        }
      ];
    },
    async coverage() {
      return {
        earliest_started_at: "2026-08-01T06:00:00.000Z",
        latest_started_at: "2026-08-13T06:00:00.000Z",
        earliest_received_at: "2026-08-01T07:00:00.000Z",
        latest_received_at: "2026-08-13T07:00:00.000Z",
        record_count: 20
      };
    }
  };
}

function recordingApi() {
  const requests: GarminApiRequest[] = [];
  const api: GarminApi = {
    async request(input) {
      requests.push(input);
      return { accepted: true, id: 42 };
    }
  };
  return { api, requests };
}

async function connectedClient(source = dataSource(), api = recordingApi().api) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createEnduranceBridgeMcpServer(source, api, "test-user");
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

test("exposes only the provider-neutral endurance tool surface", async () => {
  const { client, server } = await connectedClient();
  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    [
      "endurance_apply_change",
      "endurance_get_activity",
      "endurance_get_calendar",
      "endurance_get_capabilities",
      "endurance_get_coverage",
      "endurance_get_health",
      "endurance_get_period",
      "endurance_get_routes",
      "endurance_get_workouts",
      "endurance_list_activities",
      "endurance_prepare_change",
      "endurance_sync"
    ]
  );
  assert.equal(listed.tools.some((tool) => tool.name.startsWith("garmin_")), false);
  await client.close();
  await server.close();
});

test("returns a complete canonical period bundle", async () => {
  const calendarApi: GarminApi = {
    async request() {
      return [
        {
          workoutScheduleId: 91,
          calendarDate: "2026-08-13",
          workoutName: "Easy run",
          sportType: "RUNNING"
        }
      ];
    }
  };
  const { client, server } = await connectedClient(dataSource(), calendarApi);
  const result = await client.callTool({
    name: "endurance_get_period",
    arguments: {
      from: "2026-08-11T00:00:00.000Z",
      to: "2026-08-18T00:00:00.000Z",
      timezone: "Europe/Warsaw"
    }
  });
  assert.equal(result.isError, undefined);
  const primary = (result.structuredContent as { primary: Record<string, unknown> }).primary;
  assert.equal(primary.status, "ready");
  assert.equal(
    (primary.totals as { activityCount: number }).activityCount,
    1
  );
  const groups = primary.activityGroups as Array<{
    primary: { id: string };
    detailStatus: string;
  }>;
  assert.equal(groups[0].primary.id, "garmin:activity-1");
  assert.equal(groups[0].detailStatus, "available");
  assert.equal((primary.health as unknown[]).length, 1);
  const planMatches = primary.planMatches as Array<{
    status: string;
    activity: { id: string } | null;
  }>;
  assert.equal(planMatches[0].status, "completed");
  assert.equal(planMatches[0].activity?.id, "garmin:activity-1");
  assert.equal((primary.unplannedActivities as unknown[]).length, 0);
  await client.close();
  await server.close();
});

test("reports partial historical coverage for a newly connected account", async () => {
  const { client, server } = await connectedClient();
  const result = await client.callTool({
    name: "endurance_get_coverage",
    arguments: {
      provider: "garmin",
      resource: "activities",
      from: "2026-07-20T00:00:00.000Z",
      to: "2026-07-27T00:00:00.000Z"
    }
  });
  assert.equal(
    (result.structuredContent as { status: string }).status,
    "partial"
  );
  const sync = await client.callTool({
    name: "endurance_sync",
    arguments: {
      provider: "garmin",
      resource: "activities",
      from: "2026-07-20T00:00:00.000Z",
      to: "2026-07-27T00:00:00.000Z"
    }
  });
  assert.equal(
    (sync.structuredContent as { status: string }).status,
    "manual_action_required"
  );
  await client.close();
  await server.close();
});

test("prepares a generic change without calling the provider", async () => {
  const recorded = recordingApi();
  const { client, server } = await connectedClient(dataSource(), recorded.api);
  const result = await client.callTool({
    name: "endurance_prepare_change",
    arguments: {
      provider: "garmin",
      resource: "workout",
      operation: "create",
      payload: { workoutName: "Tempo" }
    }
  });
  assert.equal(result.isError, undefined);
  assert.equal(
    (result.structuredContent as { status: string }).status,
    "prepared"
  );
  assert.equal(recorded.requests.length, 0);
  await client.close();
  await server.close();
});

test("applies the exact prepared generic change", async () => {
  const recorded = recordingApi();
  const { client, server } = await connectedClient(dataSource(), recorded.api);
  const prepared = await client.callTool({
    name: "endurance_prepare_change",
    arguments: {
      provider: "garmin",
      resource: "route",
      operation: "create",
      payload: { courseName: "Morning route", distanceInMeters: 10000 }
    }
  });
  const changeToken = (prepared.structuredContent as { changeToken: string }).changeToken;
  const applied = await client.callTool({
    name: "endurance_apply_change",
    arguments: { changeToken, confirm: "APPLY_ENDURANCE_CHANGE" }
  });
  assert.equal((applied.structuredContent as { status: string }).status, "applied");
  assert.deepEqual(recorded.requests, [
    {
      method: "POST",
      path: "/training-api/courses/v1/course",
      body: { courseName: "Morning route", distanceInMeters: 10000 }
    }
  ]);
  await client.close();
  await server.close();
});

test("reads structured workouts through the generic contract", async () => {
  const recorded = recordingApi();
  const { client, server } = await connectedClient(dataSource(), recorded.api);
  const result = await client.callTool({
    name: "endurance_get_workouts",
    arguments: { workoutIds: [27] }
  });
  assert.equal((result.structuredContent as { status: string }).status, "ready");
  assert.deepEqual(recorded.requests, [
    { method: "GET", path: "/training-api/workout/v2/27" }
  ]);
  await client.close();
  await server.close();
});

test("rejects invalid or unapproved generic changes", async () => {
  const recorded = recordingApi();
  const { client, server } = await connectedClient(dataSource(), recorded.api);
  const mismatch = await client.callTool({
    name: "endurance_prepare_change",
    arguments: {
      provider: "garmin",
      resource: "workout",
      operation: "update",
      resourceId: "10",
      payload: { workoutId: 11, workoutName: "Mismatch" }
    }
  });
  assert.equal(mismatch.isError, true);

  const prepared = await client.callTool({
    name: "endurance_prepare_change",
    arguments: {
      resource: "route",
      operation: "delete",
      resourceId: "12"
    }
  });
  const changeToken = (prepared.structuredContent as { changeToken: string }).changeToken;
  const rejected = await client.callTool({
    name: "endurance_apply_change",
    arguments: { changeToken, confirm: "NO" }
  });
  assert.equal(rejected.isError, true);
  assert.equal(recorded.requests.length, 0);
  await client.close();
  await server.close();
});

test("reports unavailable capabilities for an unconnected account", async () => {
  const source = dataSource();
  source.connection = async () => undefined;
  const { client, server } = await connectedClient(source);
  const result = await client.callTool({
    name: "endurance_get_capabilities",
    arguments: {}
  });
  const providers = (result.structuredContent as {
    providers: Array<{ provider: string; connected: boolean }>;
  }).providers;
  assert.equal(providers.find((provider) => provider.provider === "garmin")?.connected, false);
  await client.close();
  await server.close();
});
