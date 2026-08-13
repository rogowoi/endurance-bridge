import crypto from "node:crypto";

import type { EnduranceEvent } from "../types.js";

export const GARMIN_SUMMARY_TYPES = new Set([
  "activities",
  "activityDetails",
  "activityFiles",
  "manuallyUpdatedActivities",
  "moveIQActivities",
  "deregistrations",
  "userPermissionsChange",
  "bloodPressures",
  "bodyComps",
  "dailies",
  "epochs",
  "hrv",
  "healthSnapshot",
  "pulseox",
  "allDayRespiration",
  "skinTemp",
  "sleeps",
  "stressDetails",
  "userMetrics",
  "mct"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/token|callbackurl/i.test(key)) continue;
    result[key] = scrubSecrets(child);
  }
  return result;
}

function dateFromEpoch(value: unknown): Date | null {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
  const result = new Date(seconds * 1000);
  return Number.isNaN(result.getTime()) ? null : result;
}

export interface GarminPayloadResult {
  events: EnduranceEvent[];
  deregisteredUserIds: string[];
}

export function normalizeGarminPayload(payload: unknown): GarminPayloadResult {
  if (!isRecord(payload)) throw new Error("Garmin payload must be an object");

  const events: EnduranceEvent[] = [];
  const deregisteredUserIds: string[] = [];

  for (const [eventType, rawItems] of Object.entries(payload)) {
    if (!GARMIN_SUMMARY_TYPES.has(eventType) || !Array.isArray(rawItems)) continue;

    for (const rawItem of rawItems) {
      if (!isRecord(rawItem) || typeof rawItem.userId !== "string") continue;
      if (eventType === "deregistrations") {
        deregisteredUserIds.push(rawItem.userId);
        continue;
      }

      const nestedSummary = isRecord(rawItem.summary) ? rawItem.summary : undefined;
      const sanitized = scrubSecrets(rawItem) as Record<string, unknown>;
      const startTime = rawItem.startTimeInSeconds ?? nestedSummary?.startTimeInSeconds;
      const occurredOn = rawItem.calendarDate ?? nestedSummary?.calendarDate;
      const naturalId =
        rawItem.summaryId ??
        rawItem.activityId ??
        nestedSummary?.summaryId ??
        nestedSummary?.activityId ??
        occurredOn;
      const externalId =
        naturalId === undefined || naturalId === null
          ? crypto.createHash("sha256").update(JSON.stringify(sanitized)).digest("hex")
          : String(naturalId);

      events.push({
        provider: "garmin",
        providerUserId: rawItem.userId,
        eventType,
        externalId,
        startedAt: dateFromEpoch(startTime),
        occurredOn: typeof occurredOn === "string" ? occurredOn : null,
        payload: sanitized
      });
    }
  }

  return { events, deregisteredUserIds: [...new Set(deregisteredUserIds)] };
}
