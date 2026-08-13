import type { VercelRequest, VercelResponse } from "@vercel/node";

import { userFromSession } from "../../../../src/accounts.js";
import { encryptJson } from "../../../../src/connection-crypto.js";
import { createOAuthState } from "../../../../src/connections.js";
import { createGarminAuthorization } from "../../../../src/providers/garmin-oauth.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  const user = await userFromSession(request);
  if (!user) return response.status(401).json({ error: "Sign in to continue" });

  const origin = process.env.APP_ORIGIN;
  if (!origin) return response.status(503).json({ error: "APP_ORIGIN is not configured" });
  const redirectUri = `${origin.replace(/\/$/, "")}/api/v1/setup/garmin/callback`;
  const authorization = createGarminAuthorization(redirectUri);
  await createOAuthState({
    userId: user.id,
    state: authorization.state,
    provider: "garmin",
    encryptedVerifier: encryptJson({ verifier: authorization.verifier }),
    redirectUri
  });
  return response.status(200).json({ authorizationUrl: authorization.authorizationUrl });
}
