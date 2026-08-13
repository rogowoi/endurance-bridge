import type { VercelRequest, VercelResponse } from "@vercel/node";

import { acceptInvite, authenticateOwner } from "../../src/accounts.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  const action = typeof request.body?.action === "string" ? request.body.action : "";
  if (action === "owner") {
    const key = typeof request.body?.key === "string" ? request.body.key : "";
    if (!(await authenticateOwner(key, response))) {
      return response.status(401).json({ error: "That owner key is not valid" });
    }
    return response.status(200).json({ ok: true });
  }
  if (action === "join") {
    const token = typeof request.body?.invite === "string" ? request.body.invite : "";
    const displayName = typeof request.body?.displayName === "string"
      ? request.body.displayName
      : "";
    try {
      const result = await acceptInvite({ token, displayName, response });
      return response.status(201).json({ user: result.user, apiKey: result.apiKey });
    } catch (error) {
      return response.status(400).json({
        error: error instanceof Error ? error.message : "Could not accept invite"
      });
    }
  }
  return response.status(400).json({ error: "Unknown authentication action" });
}
