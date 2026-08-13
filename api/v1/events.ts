import type { VercelRequest, VercelResponse } from "@vercel/node";

import { bearerToken, secureEquals } from "../../src/security.js";
import { queryEvents } from "../../src/store.js";
import type { Provider } from "../../src/types.js";

const PROVIDERS = new Set<Provider>(["garmin", "strava", "trainingpeaks"]);

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = /^\d+$/.test(value)
    ? new Date(Number(value) * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.BRIDGE_API_KEY;
  if (!apiKey || !secureEquals(bearerToken(request.headers.authorization), apiKey)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  const provider = single(request.query.provider) as Provider | undefined;
  const providerUserId = single(request.query.userId);
  const eventType = single(request.query.type);
  const fromValue = single(request.query.from);
  const toValue = single(request.query.to);
  const from = parseDate(fromValue);
  const to = parseDate(toValue);
  const limit = Math.min(Math.max(Number(single(request.query.limit) ?? 500), 1), 1000);

  if (!provider || !PROVIDERS.has(provider) || !providerUserId) {
    return response.status(400).json({ error: "Valid provider and userId are required" });
  }
  if ((fromValue && !from) || (toValue && !to) || Boolean(from) !== Boolean(to)) {
    return response.status(400).json({ error: "from and to must both be valid dates or epoch seconds" });
  }
  if (from && to && from >= to) {
    return response.status(400).json({ error: "from must be earlier than to" });
  }

  const events = await queryEvents({
    provider,
    providerUserId,
    eventType,
    from,
    to,
    limit: Number.isFinite(limit) ? limit : 500
  });
  return response.status(200).json({ count: events.length, events });
}
