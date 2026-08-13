import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import {
  createEnduranceBridgeMcpServer,
  type McpDataSource
} from "../src/mcp.js";
import type {
  GarminApi,
  GarminApiRequest
} from "../src/providers/garmin-api.js";

function dataSource(): McpDataSource {
  return {
    async connection() {
      return {
        provider: "garmin",
        providerUserId: "garmin-user",
        permissions: ["ACTIVITY_EXPORT", "WORKOUT_IMPORT", "COURSE_IMPORT"],
        connectedAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z"
      };
    },
    async activities() {
      return [
        {
          event_type: "activities",
          external_id: "activity-1",
          started_at: "2026-08-13T06:00:00.000Z",
          payload: { activityType: "RUNNING", distanceInMeters: 5000 }
        }
      ];
    },
    async activity(_userId, externalId) {
      return [{ external_id: externalId, event_type: "activities" }];
    },
    async events() {
      return [];
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
  const server = createEnduranceBridgeMcpServer(source, api);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

test("exposes Garmin activity, workout, schedule, and course tools", async () => {
  const { client, server } = await connectedClient();
  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    [
      "garmin_connection_status",
      "garmin_create_course",
      "garmin_create_schedule",
      "garmin_create_workout",
      "garmin_delete_course",
      "garmin_delete_schedule",
      "garmin_delete_workout",
      "garmin_get_activity",
      "garmin_get_course",
      "garmin_get_schedule",
      "garmin_get_workout",
      "garmin_list_activities",
      "garmin_list_events",
      "garmin_list_schedules",
      "garmin_update_course",
      "garmin_update_schedule",
      "garmin_update_workout"
    ]
  );
  assert.equal(
    listed.tools.find((tool) => tool.name === "garmin_create_workout")?.annotations
      ?.readOnlyHint,
    false
  );
  assert.equal(
    listed.tools.find((tool) => tool.name === "garmin_delete_course")?.annotations
      ?.destructiveHint,
    true
  );

  const result = await client.callTool({
    name: "garmin_list_activities",
    arguments: { limit: 10 }
  });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as { count: number }).count, 1);
  assert.equal(
    (result.structuredContent as { source: string }).source,
    "endurance_bridge_push_store"
  );
  assert.equal(
    (result.structuredContent as { liveGarminQuery: boolean }).liveGarminQuery,
    false
  );

  await client.close();
  await server.close();
});

test("previews mutations without calling Garmin", async () => {
  const recorded = recordingApi();
  const { client, server } = await connectedClient(dataSource(), recorded.api);
  const result = await client.callTool({
    name: "garmin_create_workout",
    arguments: { payload: { workoutName: "Tempo" } }
  });
  assert.equal(result.isError, undefined);
  assert.equal(
    (result.structuredContent as { dryRun: boolean }).dryRun,
    true
  );
  assert.equal(recorded.requests.length, 0);
  await client.close();
  await server.close();
});

test("rejects a live mutation without exact confirmation", async () => {
  const recorded = recordingApi();
  const { client, server } = await connectedClient(dataSource(), recorded.api);
  const result = await client.callTool({
    name: "garmin_delete_course",
    arguments: { courseId: 12, dryRun: false }
  });
  assert.equal(result.isError, true);
  assert.equal(recorded.requests.length, 0);
  await client.close();
  await server.close();
});

test("executes a confirmed mutation against the exact Garmin endpoint", async () => {
  const recorded = recordingApi();
  const { client, server } = await connectedClient(dataSource(), recorded.api);
  const result = await client.callTool({
    name: "garmin_create_course",
    arguments: {
      payload: { courseName: "Morning route", distanceInMeters: 10000 },
      dryRun: false,
      confirm: "WRITE_TO_GARMIN"
    }
  });
  assert.equal(result.isError, undefined);
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

test("rejects mismatched resource IDs", async () => {
  const recorded = recordingApi();
  const { client, server } = await connectedClient(dataSource(), recorded.api);
  const result = await client.callTool({
    name: "garmin_update_workout",
    arguments: {
      workoutId: 10,
      payload: { workoutId: 11, workoutName: "Mismatch" }
    }
  });
  assert.equal(result.isError, true);
  assert.equal(recorded.requests.length, 0);
  await client.close();
  await server.close();
});

test("reports an unconnected Garmin account", async () => {
  const source = dataSource();
  source.connection = async () => undefined;
  const { client, server } = await connectedClient(source);
  const status = await client.callTool({
    name: "garmin_connection_status",
    arguments: {}
  });
  assert.equal((status.structuredContent as { connected: boolean }).connected, false);

  const activities = await client.callTool({
    name: "garmin_list_activities",
    arguments: {}
  });
  assert.equal(activities.isError, true);

  const write = await client.callTool({
    name: "garmin_create_workout",
    arguments: { payload: { workoutName: "Test" } }
  });
  assert.equal(write.isError, true);
  await client.close();
  await server.close();
});
