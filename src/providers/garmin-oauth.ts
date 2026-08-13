import crypto from "node:crypto";

const AUTHORIZE_URL = "https://connect.garmin.com/oauth2Confirm";
const TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const API_ORIGIN = "https://apis.garmin.com";

export interface GarminToken {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  [key: string]: unknown;
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Garmin OAuth credentials are not configured");
  }
  return { clientId, clientSecret };
}

export function createGarminAuthorization(redirectUri: string) {
  const { clientId } = credentials();
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    state
  }).toString();
  return { state, verifier, authorizationUrl: url.toString() };
}

export async function exchangeGarminCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<GarminToken> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri
    })
  });
  if (!response.ok) {
    throw new Error(`Garmin token exchange failed with HTTP ${response.status}`);
  }
  const token = (await response.json()) as GarminToken;
  if (!token.access_token) throw new Error("Garmin token response is incomplete");
  return token;
}

async function garminGet<T>(token: GarminToken, path: string): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Garmin API request failed with HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function inspectGarminConnection(token: GarminToken) {
  const [user, permissionResponse] = await Promise.all([
    garminGet<{ userId?: string }>(token, "/wellness-api/rest/user/id"),
    garminGet<{ permissions?: string[] }>(
      token,
      "/wellness-api/rest/user/permissions"
    )
  ]);
  if (!user.userId) throw new Error("Garmin user response did not include userId");
  return {
    providerUserId: user.userId,
    permissions: Array.isArray(permissionResponse.permissions)
      ? permissionResponse.permissions
      : []
  };
}
