import { decryptJson, encryptJson } from "./connection-crypto.js";
import type { GarminApiRequest } from "./providers/garmin-api.js";

export type ChangeResource = "workout" | "calendar_item" | "route";
export type ChangeOperation = "create" | "update" | "delete";

export interface PreparedEnduranceChange {
  userId: string;
  provider: "garmin";
  resource: ChangeResource;
  operation: ChangeOperation;
  resourceId?: string;
  payload?: Record<string, unknown>;
  permission: "WORKOUT_IMPORT" | "COURSE_IMPORT";
  request: GarminApiRequest;
  preparedAt: string;
  expiresAt: string;
}

function requirePayload(payload: Record<string, unknown> | undefined) {
  if (!payload) throw new Error("payload is required for create and update operations");
  return payload;
}

function requireId(resourceId: string | undefined) {
  if (!resourceId) throw new Error("resourceId is required for update and delete operations");
  return resourceId;
}

function validatePayloadId(
  payload: Record<string, unknown>,
  field: string,
  operation: ChangeOperation,
  resourceId?: string
) {
  const value = payload[field];
  if (operation === "create" && value !== undefined && value !== null) {
    throw new Error(`${field} must be omitted when creating this resource`);
  }
  if (
    operation === "update" &&
    value !== undefined &&
    value !== null &&
    String(value) !== String(resourceId)
  ) {
    throw new Error(`${field} in payload must match resourceId`);
  }
}

export function prepareEnduranceChange(input: {
  userId: string;
  provider: "garmin";
  resource: ChangeResource;
  operation: ChangeOperation;
  resourceId?: string;
  payload?: Record<string, unknown>;
}): PreparedEnduranceChange {
  let permission: PreparedEnduranceChange["permission"];
  let request: GarminApiRequest;

  if (input.resource === "workout") {
    permission = "WORKOUT_IMPORT";
    const payload = input.operation === "delete" ? undefined : requirePayload(input.payload);
    if (payload) validatePayloadId(payload, "workoutId", input.operation, input.resourceId);
    request = input.operation === "create"
      ? { method: "POST", path: "/workoutportal/workout/v2", body: payload }
      : input.operation === "update"
        ? {
            method: "PUT",
            path: `/training-api/workout/v2/${encodeURIComponent(requireId(input.resourceId))}`,
            body: payload
          }
        : {
            method: "DELETE",
            path: `/training-api/workout/v2/${encodeURIComponent(requireId(input.resourceId))}`
          };
  } else if (input.resource === "calendar_item") {
    permission = "WORKOUT_IMPORT";
    const payload = input.operation === "delete" ? undefined : requirePayload(input.payload);
    if (payload) validatePayloadId(payload, "scheduleId", input.operation, input.resourceId);
    request = input.operation === "create"
      ? { method: "POST", path: "/training-api/schedule/", body: payload }
      : input.operation === "update"
        ? {
            method: "PUT",
            path: `/training-api/schedule/${encodeURIComponent(requireId(input.resourceId))}`,
            body: payload
          }
        : {
            method: "DELETE",
            path: `/training-api/schedule/${encodeURIComponent(requireId(input.resourceId))}`
          };
  } else {
    permission = "COURSE_IMPORT";
    const payload = input.operation === "delete" ? undefined : requirePayload(input.payload);
    if (payload) validatePayloadId(payload, "courseId", input.operation, input.resourceId);
    request = input.operation === "create"
      ? { method: "POST", path: "/training-api/courses/v1/course", body: payload }
      : input.operation === "update"
        ? {
            method: "PUT",
            path: `/training-api/courses/v1/course/${encodeURIComponent(requireId(input.resourceId))}`,
            body: payload
          }
        : {
            method: "DELETE",
            path: `/training-api/courses/v1/course/${encodeURIComponent(requireId(input.resourceId))}`
          };
  }

  const preparedAt = new Date();
  return {
    ...input,
    permission,
    request,
    preparedAt: preparedAt.toISOString(),
    expiresAt: new Date(preparedAt.getTime() + 10 * 60 * 1000).toISOString()
  };
}

export function sealEnduranceChange(change: PreparedEnduranceChange) {
  return encryptJson(change);
}

export function openEnduranceChange(token: string, userId: string) {
  const change = decryptJson<PreparedEnduranceChange>(token);
  if (change.userId !== userId) throw new Error("Prepared change belongs to another account");
  if (new Date(change.expiresAt) <= new Date()) throw new Error("Prepared change expired; prepare it again");
  return change;
}
