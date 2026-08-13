import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGarminPayload } from "../src/providers/garmin.js";

test("normalizes Garmin activities into provider-neutral events", () => {
  const result = normalizeGarminPayload({
    activities: [
      {
        userId: "garmin-user",
        summaryId: "summary-1",
        activityId: 123,
        startTimeInSeconds: 1786572000,
        calendarDate: "2026-08-13",
        distanceInMeters: 10000
      }
    ]
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].provider, "garmin");
  assert.equal(result.events[0].externalId, "summary-1");
  assert.equal(result.events[0].startedAt?.toISOString(), "2026-08-12T22:00:00.000Z");
});

test("removes callback URLs and token fields before persistence", () => {
  const result = normalizeGarminPayload({
    activityDetails: [
      {
        userId: "garmin-user",
        activityId: 123,
        userAccessToken: "secret",
        callbackURL: "https://apis.garmin.com/example?token=secret",
        nested: { refreshToken: "secret", heartRate: 140 }
      }
    ]
  });

  const payload = result.events[0].payload;
  assert.equal("userAccessToken" in payload, false);
  assert.equal("callbackURL" in payload, false);
  assert.deepEqual(payload.nested, { heartRate: 140 });
});

test("separates deregistrations from stored events", () => {
  const result = normalizeGarminPayload({
    deregistrations: [{ userId: "garmin-user" }]
  });
  assert.deepEqual(result.deregisteredUserIds, ["garmin-user"]);
  assert.equal(result.events.length, 0);
});
