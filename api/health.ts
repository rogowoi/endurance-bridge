import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_request: VercelRequest, response: VercelResponse) {
  response.status(200).json({
    ok: true,
    service: "endurance-bridge",
    version: "1.2.1",
    mcp: "active",
    providers: { garmin: "active" }
  });
}
