import type { VercelRequest, VercelResponse } from "@vercel/node";

import { userFromSession } from "../../src/accounts.js";
import { getConnection } from "../../src/connections.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }
  const user = await userFromSession(request);
  if (!user) return response.status(401).json({ error: "Sign in to continue" });
  const garmin = await getConnection(user.id, "garmin");
  const origin = (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
  return response.status(200).json({
    user,
    mcpEndpoint: `${origin}/api/mcp`,
    garmin: garmin
      ? {
          connected: true,
          permissions: garmin.permissions,
          connectedAt: garmin.connectedAt
        }
      : { connected: false }
  });
}
