import crypto from "node:crypto";

export type EnduranceProvider = "garmin" | "strava" | "trainingpeaks";
export type EnduranceResource =
  | "activities"
  | "health"
  | "workouts"
  | "calendar"
  | "routes";

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function first(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}

function isoFromEpoch(value: unknown): string | null {
  const seconds = finite(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function canonicalActivity(row: unknown) {
  const record = asRecord(row);
  const payload = asRecord(record.payload);
  const summary = asRecord(payload.summary);
  const provider = String(record.provider ?? "garmin") as EnduranceProvider;
  const sourceId = String(
    first(record.external_id, payload.summaryId, payload.activityId, summary.summaryId) ??
      crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex")
  );
  const startTime = text(record.started_at) ??
    isoFromEpoch(first(payload.startTimeInSeconds, summary.startTimeInSeconds));
  const type = text(first(payload.activityType, summary.activityType, "UNKNOWN"));
  const durationSeconds = finite(
    first(payload.durationInSeconds, summary.durationInSeconds)
  );
  const distanceMeters = finite(
    first(payload.distanceInMeters, summary.distanceInMeters)
  );

  return {
    id: `${provider}:${sourceId}`,
    provider,
    sourceId,
    name: text(first(payload.activityName, summary.activityName)),
    type,
    startTime,
    localStartOffsetSeconds: finite(
      first(payload.startTimeOffsetInSeconds, summary.startTimeOffsetInSeconds)
    ),
    durationSeconds,
    distanceMeters,
    activeKilocalories: finite(
      first(payload.activeKilocalories, summary.activeKilocalories)
    ),
    averageHeartRate: finite(
      first(
        payload.averageHeartRateInBeatsPerMinute,
        summary.averageHeartRateInBeatsPerMinute
      )
    ),
    maxHeartRate: finite(
      first(payload.maxHeartRateInBeatsPerMinute, summary.maxHeartRateInBeatsPerMinute)
    ),
    averageSpeedMetersPerSecond: finite(
      first(payload.averageSpeedInMetersPerSecond, summary.averageSpeedInMetersPerSecond)
    ),
    elevationGainMeters: finite(
      first(payload.totalElevationGainInMeters, summary.totalElevationGainInMeters)
    ),
    receivedAt: text(record.received_at),
    provenance: {
      provider,
      eventType: text(record.event_type),
      sourceId,
      delivery: "push_mirror"
    }
  };
}

export function activityGroup(activity: ReturnType<typeof canonicalActivity>) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      [
        activity.startTime ?? "unknown",
        activity.type ?? "UNKNOWN",
        Math.round(activity.durationSeconds ?? 0),
        Math.round(activity.distanceMeters ?? 0)
      ].join(":")
    )
    .digest("hex")
    .slice(0, 20);
  return {
    id: `activity-group:${fingerprint}`,
    primary: activity,
    sources: [activity.provenance],
    conflicts: [] as unknown[]
  };
}

export function canonicalHealthEvent(row: unknown) {
  const record = asRecord(row);
  return {
    id: `${String(record.provider ?? "garmin")}:${String(record.event_type)}:${String(record.external_id)}`,
    provider: String(record.provider ?? "garmin"),
    type: String(record.event_type),
    startTime: text(record.started_at),
    calendarDate: text(record.occurred_on),
    receivedAt: text(record.received_at),
    data: asRecord(record.payload),
    provenance: {
      provider: String(record.provider ?? "garmin"),
      delivery: "push_mirror"
    }
  };
}

export function aggregateActivities(
  activities: Array<ReturnType<typeof canonicalActivity>>
) {
  const byType: Record<string, { count: number; durationSeconds: number; distanceMeters: number }> = {};
  let durationSeconds = 0;
  let distanceMeters = 0;
  let activeKilocalories = 0;
  let elevationGainMeters = 0;
  for (const activity of activities) {
    const type = activity.type ?? "UNKNOWN";
    const bucket = (byType[type] ??= { count: 0, durationSeconds: 0, distanceMeters: 0 });
    bucket.count += 1;
    bucket.durationSeconds += activity.durationSeconds ?? 0;
    bucket.distanceMeters += activity.distanceMeters ?? 0;
    durationSeconds += activity.durationSeconds ?? 0;
    distanceMeters += activity.distanceMeters ?? 0;
    activeKilocalories += activity.activeKilocalories ?? 0;
    elevationGainMeters += activity.elevationGainMeters ?? 0;
  }
  return {
    activityCount: activities.length,
    durationSeconds,
    distanceMeters,
    activeKilocalories,
    elevationGainMeters,
    byType
  };
}

export const HEALTH_EVENT_TYPES = new Set([
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
