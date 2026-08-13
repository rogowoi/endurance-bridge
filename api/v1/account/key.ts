import type { VercelRequest, VercelResponse } from "@vercel/node";

import { rotateAccessKey, userFromSession } from "../../../src/accounts.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  const user = await userFromSession(request);
  if (!user) return response.status(401).json({ error: "Sign in to continue" });
  return response.status(201).json({ apiKey: await rotateAccessKey(user.id) });
}
