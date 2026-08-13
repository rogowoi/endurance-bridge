import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";

import { requireBridgeKey } from "../src/http-auth.js";
import { createEnduranceBridgeMcpServer } from "../src/mcp.js";

const mcp = createMcpHandler(() => createEnduranceBridgeMcpServer(), {
  legacy: "stateless",
  responseMode: "auto"
});
const nodeHandler = toNodeHandler(mcp);

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (!requireBridgeKey(request, response)) return;
  await nodeHandler(request, response, request.body);
}
