import type { VercelRequest, VercelResponse } from "@vercel/node";

import { createInvite, userFromSession } from "../../src/accounts.js";
import {
  listHistoryRequests,
  updateHistoryRequest,
  type HistoryRequestStatus
} from "../../src/history-requests.js";

const STATUSES = new Set<HistoryRequestStatus>([
  "pending",
  "processing",
  "completed",
  "failed"
]);

export default async function handler(request: VercelRequest, response: VercelResponse) {
  const user = await userFromSession(request);
  if (!user?.isOwner) return response.status(403).json({ error: "Owner access required" });

  if (request.method === "GET") {
    return response.status(200).json({ historyRequests: await listHistoryRequests() });
  }
  if (request.method === "POST" && request.body?.action === "invite") {
    const token = await createInvite(user.id);
    const origin = (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
    return response.status(201).json({
      inviteUrl: `${origin}/?invite=${encodeURIComponent(token)}`,
      expiresInDays: 7
    });
  }
  if (request.method === "PATCH" && request.body?.action === "history") {
    const id = String(request.body?.id ?? "");
    const status = String(request.body?.status ?? "") as HistoryRequestStatus;
    if (!id || !STATUSES.has(status)) {
      return response.status(400).json({ error: "A valid request id and status are required" });
    }
    const updated = await updateHistoryRequest(id, status);
    return updated
      ? response.status(200).json({ historyRequest: updated })
      : response.status(404).json({ error: "History request not found" });
  }
  response.setHeader("Allow", "GET, POST, PATCH");
  return response.status(400).json({ error: "Unsupported owner operation" });
}
