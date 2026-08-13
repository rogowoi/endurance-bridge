import type { VercelRequest, VercelResponse } from "@vercel/node";

import { userFromSession } from "../../src/accounts.js";
import { getConnection } from "../../src/connections.js";
import {
  latestHistoryRequest,
  requestHistory
} from "../../src/history-requests.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }
  const user = await userFromSession(request);
  if (!user) return response.status(401).json({ error: "Sign in to continue" });
  const garmin = await getConnection(user.id, "garmin");
  let history = garmin ? await latestHistoryRequest(user.id, "garmin") : undefined;
  if (garmin && !history) {
    const now = new Date();
    history = await requestHistory({
      userId: user.id,
      provider: "garmin",
      providerUserId: garmin.providerUserId,
      from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      to: now,
      resources: ["activities", "health"]
    });
  }
  const origin = (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
  return response.status(200).json({
    user,
    mcpEndpoint: `${origin}/api/mcp`,
    garmin: garmin
      ? {
          connected: true,
          permissions: garmin.permissions,
          connectedAt: garmin.connectedAt,
          history: history
            ? {
                status: history.status,
                from: history.from,
                to: history.to,
                updatedAt: history.updatedAt
              }
            : { status: "not_requested" }
        }
      : { connected: false }
  });
}
