import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";

import { userFromMcpRequest } from "../src/accounts.js";
import { createEnduranceBridgeMcpServer } from "../src/mcp.js";

const mcp = createMcpHandler((context) => {
  const userId = String(context.authInfo?.extra?.userId ?? "");
  if (!userId) throw new Error("Authenticated user is missing");
  return createEnduranceBridgeMcpServer(undefined, undefined, userId);
}, {
  legacy: "stateless",
  responseMode: "auto"
});
const nodeHandler = toNodeHandler(mcp);

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const user = await userFromMcpRequest(request);
  if (!user) {
    response.setHeader("WWW-Authenticate", 'Bearer realm="endurance-bridge"');
    return response.status(401).json({ error: "Unauthorized" });
  }
  Object.assign(request, {
    auth: {
      token: "validated",
      clientId: "endurance-bridge-client",
      scopes: ["endurance"],
      extra: { userId: user.id }
    }
  });
  await nodeHandler(request, response, request.body);
}
