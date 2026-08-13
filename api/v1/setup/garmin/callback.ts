import type { VercelRequest, VercelResponse } from "@vercel/node";

import { decryptJson, encryptJson } from "../../../../src/connection-crypto.js";
import { consumeOAuthState, upsertConnection } from "../../../../src/connections.js";
import {
  exchangeGarminCode,
  inspectGarminConnection
} from "../../../../src/providers/garmin-oauth.js";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function page(title: string, message: string, ok: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px system-ui;max-width:620px;margin:80px auto;padding:24px;color:#17211b}main{border:1px solid #dce4df;border-radius:18px;padding:32px}h1{color:${ok ? "#146c43" : "#a62929"}}a{color:#176b4d}</style></head><body><main><h1>${title}</h1><p>${message}</p><p><a href="/api/setup">Return to Endurance Bridge setup</a></p></main></body></html>`;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).send("Method not allowed");
  }
  const error = single(request.query.error);
  const code = single(request.query.code);
  const state = single(request.query.state);
  if (error || !code || !state) {
    return response
      .status(400)
      .send(page("Garmin connection failed", "Garmin did not return a valid authorization.", false));
  }

  try {
    const stored = await consumeOAuthState(state);
    if (!stored || stored.provider !== "garmin") throw new Error("OAuth state is invalid or expired");
    const { verifier } = decryptJson<{ verifier: string }>(stored.encryptedVerifier);
    const token = await exchangeGarminCode({ code, verifier, redirectUri: stored.redirectUri });
    const connection = await inspectGarminConnection(token);
    await upsertConnection({
      provider: "garmin",
      providerUserId: connection.providerUserId,
      encryptedToken: encryptJson(token),
      permissions: connection.permissions
    });
    return response
      .status(200)
      .send(page("Garmin connected", "Your Garmin account is ready for the Endurance Bridge MCP.", true));
  } catch {
    return response
      .status(400)
      .send(page("Garmin connection failed", "The authorization could not be completed. Start again from setup.", false));
  }
}
