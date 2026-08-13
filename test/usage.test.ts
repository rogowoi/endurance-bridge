import assert from "node:assert/strict";
import test from "node:test";

import { summarizeToolRequest } from "../src/usage.js";

test("records intent without storing payloads, tokens, or resource identities", () => {
  assert.deepEqual(
    summarizeToolRequest({
      provider: "garmin",
      resource: "workout",
      operation: "create",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-08T00:00:00.000Z",
      payload: { workoutName: "Private workout" },
      changeToken: "secret",
      activityId: "garmin:private-id",
      routeIds: [1, 2]
    }),
    {
      provider: "garmin",
      resource: "workout",
      operation: "create",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-08T00:00:00.000Z",
      routeCount: 2
    }
  );
});
