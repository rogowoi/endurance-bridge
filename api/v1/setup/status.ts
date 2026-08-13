import type { VercelRequest, VercelResponse } from "@vercel/node";

import { getConnection } from "../../../src/connections.js";
import { requireBridgeKey } from "../../../src/http-auth.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }
  if (!requireBridgeKey(request, response)) return;

  const garmin = await getConnection("garmin");
  return response.status(200).json({
    mcpEndpoint: `${process.env.APP_ORIGIN ?? ""}/api/mcp`,
    providers: {
      garmin: garmin
        ? {
            connected: true,
            permissions: garmin.permissions,
            connectedAt: garmin.connectedAt
          }
        : { connected: false },
      strava: { connected: false, status: "planned" },
      trainingpeaks: { connected: false, status: "planned" }
    }
  });
}
