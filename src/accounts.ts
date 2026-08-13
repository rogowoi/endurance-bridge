import crypto from "node:crypto";

import type { VercelRequest, VercelResponse } from "@vercel/node";

import { database } from "./database.js";
import { bearerToken, secureEquals } from "./security.js";

const SESSION_COOKIE = "endurance_session";

export interface EnduranceUser {
  id: string;
  displayName: string;
  isOwner: boolean;
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken(prefix: string) {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

function cookieValue(request: VercelRequest, name: string) {
  const source = request.headers.cookie ?? "";
  for (const part of source.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

function rowToUser(row: Record<string, unknown>): EnduranceUser {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    isOwner: Boolean(row.is_owner)
  };
}

export async function ownerUser(): Promise<EnduranceUser> {
  const sql = database();
  const rows = await sql`
    SELECT id, display_name, is_owner
    FROM endurance_user WHERE is_owner = true
    ORDER BY created_at ASC LIMIT 1
  `;
  if (!rows[0]) throw new Error("Owner account is not initialized");
  return rowToUser(rows[0] as Record<string, unknown>);
}

export async function userFromSession(
  request: VercelRequest
): Promise<EnduranceUser | undefined> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return undefined;
  const sql = database();
  const rows = await sql`
    SELECT u.id, u.display_name, u.is_owner
    FROM endurance_session s
    JOIN endurance_user u ON u.id = s.user_id
    WHERE s.token_hash = ${hash(token)} AND s.expires_at > now()
    LIMIT 1
  `;
  return rows[0]
    ? rowToUser(rows[0] as Record<string, unknown>)
    : undefined;
}

export async function createSession(
  userId: string,
  response: VercelResponse
) {
  const token = randomToken("ebs");
  const sql = database();
  await sql`DELETE FROM endurance_session WHERE expires_at <= now()`;
  await sql`
    INSERT INTO endurance_session (token_hash, user_id, expires_at)
    VALUES (${hash(token)}, ${userId}, now() + interval '30 days')
  `;
  const secure = (process.env.APP_ORIGIN ?? "").startsWith("https://")
    ? "; Secure"
    : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=2592000`
  );
}

export async function authenticateOwner(
  bridgeKey: string,
  response: VercelResponse
) {
  const expected = process.env.BRIDGE_API_KEY;
  if (!expected || !secureEquals(bridgeKey, expected)) return false;
  const owner = await ownerUser();
  await createSession(owner.id, response);
  return true;
}

export async function createInvite(userId: string) {
  const token = randomToken("ebi");
  const sql = database();
  await sql`DELETE FROM endurance_invite WHERE expires_at <= now() AND used_at IS NULL`;
  await sql`
    INSERT INTO endurance_invite (token_hash, created_by, expires_at)
    VALUES (${hash(token)}, ${userId}, now() + interval '7 days')
  `;
  return token;
}

export async function acceptInvite(input: {
  token: string;
  displayName: string;
  response: VercelResponse;
}) {
  const displayName = input.displayName.trim().slice(0, 80);
  if (!displayName) throw new Error("Enter your name");
  const sql = database();
  const inviteRows = await sql`
    SELECT token_hash FROM endurance_invite
    WHERE token_hash = ${hash(input.token)}
      AND expires_at > now() AND used_at IS NULL
    LIMIT 1
  `;
  if (!inviteRows[0]) throw new Error("This invite is invalid, expired, or already used");

  const userId = crypto.randomUUID();
  await sql`
    INSERT INTO endurance_user (id, display_name)
    VALUES (${userId}, ${displayName})
  `;
  const used = await sql`
    UPDATE endurance_invite
    SET used_by = ${userId}, used_at = now()
    WHERE token_hash = ${hash(input.token)} AND used_at IS NULL
    RETURNING token_hash
  `;
  if (!used[0]) {
    await sql`DELETE FROM endurance_user WHERE id = ${userId}`;
    throw new Error("This invite was already used");
  }
  await createSession(userId, input.response);
  const apiKey = await rotateAccessKey(userId);
  return { user: { id: userId, displayName, isOwner: false }, apiKey };
}

export async function rotateAccessKey(userId: string) {
  const apiKey = randomToken("ebk");
  const sql = database();
  await sql`
    UPDATE endurance_access_key SET revoked_at = now()
    WHERE user_id = ${userId} AND revoked_at IS NULL
  `;
  await sql`
    INSERT INTO endurance_access_key (id, user_id, key_hash)
    VALUES (${crypto.randomUUID()}, ${userId}, ${hash(apiKey)})
  `;
  return apiKey;
}

export async function userFromMcpRequest(
  request: VercelRequest
): Promise<EnduranceUser | undefined> {
  const token = bearerToken(request.headers.authorization);
  if (!token) return undefined;
  const ownerKey = process.env.BRIDGE_API_KEY;
  if (ownerKey && secureEquals(token, ownerKey)) return ownerUser();

  const sql = database();
  const rows = await sql`
    UPDATE endurance_access_key k
    SET last_used_at = now()
    FROM endurance_user u
    WHERE k.user_id = u.id
      AND k.key_hash = ${hash(token)}
      AND k.revoked_at IS NULL
    RETURNING u.id, u.display_name, u.is_owner
  `;
  return rows[0]
    ? rowToUser(rows[0] as Record<string, unknown>)
    : undefined;
}
