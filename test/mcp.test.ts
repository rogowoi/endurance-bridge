import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import {
  createEnduranceBridgeMcpServer,
  type McpDataSource
} from "../src/mcp.js";

function dataSource(): McpDataSource {
  return {
    async connection() {
      return {
        provider: "garmin",
        providerUserId: "garmin-user",
        permissions: ["ACTIVITY_EXPORT"],
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

test("exposes only read-only Garmin MCP tools", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createEnduranceBridgeMcpServer(dataSource());
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    [
      "garmin_connection_status",
      "garmin_get_activity",
      "garmin_list_activities",
      "garmin_list_events"
    ]
  );
  assert.ok(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true));
  assert.ok(listed.tools.every((tool) => tool.annotations?.destructiveHint === false));

  const result = await client.callTool({
    name: "garmin_list_activities",
    arguments: { limit: 10 }
  });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as { count: number }).count, 1);

  await client.close();
  await server.close();
});

test("reports an unconnected Garmin account without exposing tools that write", async () => {
  const source = dataSource();
  source.connection = async () => undefined;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createEnduranceBridgeMcpServer(source);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

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

  await client.close();
  await server.close();
});
