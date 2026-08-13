import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.ENDURANCE_BRIDGE_MCP_URL;
const token = process.env.ENDURANCE_BRIDGE_API_KEY;
if (!url || !token) {
  throw new Error(
    "Set ENDURANCE_BRIDGE_MCP_URL and ENDURANCE_BRIDGE_API_KEY before running mcp:check"
  );
}

const client = new Client({ name: "endurance-bridge-check", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), {
  authProvider: { token: async () => token }
});
await client.connect(transport);
const { tools } = await client.listTools();
const status = await client.callTool({
  name: "endurance_get_capabilities",
  arguments: {}
});
console.log(
  JSON.stringify(
    {
      connected: true,
      protocolVersion: client.getNegotiatedProtocolVersion(),
      tools: tools.map((tool) => tool.name),
      capabilities: status.structuredContent
    },
    null,
    2
  )
);
await client.close();
