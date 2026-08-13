import { decryptJson, encryptJson } from "../connection-crypto.js";
import {
  getConnectionSecret,
  updateConnectionToken
} from "../connections.js";
import type { GarminToken } from "./garmin-oauth.js";

const API_ORIGIN = "https://apis.garmin.com";
const TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";

export interface GarminApiRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
}

export interface GarminApi {
  request(input: GarminApiRequest): Promise<unknown>;
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Garmin OAuth credentials are not configured");
  }
  return { clientId, clientSecret };
}

async function refreshToken(token: GarminToken): Promise<GarminToken> {
  if (!token.refresh_token) {
    throw new Error("Garmin authorization expired; reconnect Garmin from the setup page");
  }
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token
    })
  });
  if (!response.ok) {
    throw new Error(`Garmin token refresh failed with HTTP ${response.status}`);
  }
  const refreshed = (await response.json()) as GarminToken;
  if (!refreshed.access_token) {
    throw new Error("Garmin token refresh response is incomplete");
  }
  return {
    ...token,
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? token.refresh_token,
    obtained_at: new Date().toISOString()
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return { ok: true, status: response.status };
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { ok: true, status: response.status, response: text } : { ok: true, status: response.status };
}

async function send(token: GarminToken, input: GarminApiRequest): Promise<Response> {
  return fetch(`${API_ORIGIN}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
      ...(input.body ? { "Content-Type": "application/json" } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });
}

export function createProductionGarminApi(userId: string): GarminApi {
  return {
  async request(input) {
    const connection = await getConnectionSecret(userId, "garmin");
    if (!connection) throw new Error("Garmin is not connected");
    let token = decryptJson<GarminToken>(connection.encryptedToken);
    let response = await send(token, input);

    if (response.status === 401) {
      token = await refreshToken(token);
      await updateConnectionToken(
        userId,
        "garmin",
        connection.providerUserId,
        encryptJson(token)
      );
      response = await send(token, input);
    }

    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 240);
      throw new Error(
        `Garmin API request failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`
      );
    }
    return parseResponse(response);
  }
  };
}
