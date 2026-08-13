import type { VercelRequest, VercelResponse } from "@vercel/node";

import { createInvite, userFromSession } from "../../../src/accounts.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  const user = await userFromSession(request);
  if (!user?.isOwner) return response.status(403).json({ error: "Owner access required" });
  const token = await createInvite(user.id);
  const origin = (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
  return response.status(201).json({
    inviteUrl: `${origin}/?invite=${encodeURIComponent(token)}`,
    expiresInDays: 7
  });
}
