import type { VercelRequest, VercelResponse } from "@vercel/node";

import { normalizeGarminPayload } from "../../../../src/providers/garmin.js";
import { secureEquals } from "../../../../src/security.js";
import { deleteProviderUser, upsertEvents } from "../../../../src/store.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = process.env.GARMIN_WEBHOOK_SECRET;
  const clientId = process.env.GARMIN_CLIENT_ID;
  if (!webhookSecret || !clientId) {
    return response.status(503).json({ error: "Garmin adapter is not configured" });
  }

  const suppliedSecret = Array.isArray(request.query.secret)
    ? request.query.secret[0]
    : request.query.secret;
  const suppliedClientId = request.headers["garmin-client-id"];
  const headerClientId = Array.isArray(suppliedClientId)
    ? suppliedClientId[0]
    : suppliedClientId;
  if (
    !secureEquals(suppliedSecret, webhookSecret) ||
    !secureEquals(headerClientId, clientId)
  ) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  let normalized;
  try {
    normalized = normalizeGarminPayload(request.body);
  } catch {
    return response.status(400).json({ error: "Invalid Garmin payload" });
  }

  for (const userId of normalized.deregisteredUserIds) {
    await deleteProviderUser("garmin", userId);
  }
  await upsertEvents(normalized.events);

  return response.status(200).json({
    accepted: normalized.events.length,
    deletedUsers: normalized.deregisteredUserIds.length
  });
}
