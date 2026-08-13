import type { VercelRequest, VercelResponse } from "@vercel/node";

import { bearerToken, secureEquals } from "./security.js";

export function requireBridgeKey(
  request: VercelRequest,
  response: VercelResponse
): boolean {
  const apiKey = process.env.BRIDGE_API_KEY;
  if (apiKey && secureEquals(bearerToken(request.headers.authorization), apiKey)) {
    return true;
  }
  response.setHeader("WWW-Authenticate", 'Bearer realm="endurance-bridge"');
  response.status(401).json({ error: "Unauthorized" });
  return false;
}
