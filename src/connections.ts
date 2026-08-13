import crypto from "node:crypto";

import { database } from "./database.js";
import type { Provider } from "./types.js";

export interface ProviderConnection {
  provider: Provider;
  providerUserId: string;
  permissions: string[];
  connectedAt: string;
  updatedAt: string;
}

export interface ProviderConnectionSecret extends ProviderConnection {
  encryptedToken: string;
}

export async function getConnection(
  userId: string,
  provider: Provider
): Promise<ProviderConnection | undefined> {
  const sql = database();
  const rows = await sql`
    SELECT provider, provider_user_id, permissions, connected_at, updated_at
    FROM endurance_connection
    WHERE user_id = ${userId} AND provider = ${provider}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return undefined;
  return {
    provider: row.provider as Provider,
    providerUserId: String(row.provider_user_id),
    permissions: Array.isArray(row.permissions)
      ? row.permissions.map(String)
      : [],
    connectedAt: new Date(row.connected_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString()
  };
}

export async function getConnectionSecret(
  userId: string,
  provider: Provider
): Promise<ProviderConnectionSecret | undefined> {
  const sql = database();
  const rows = await sql`
    SELECT provider, provider_user_id, encrypted_token, permissions,
           connected_at, updated_at
    FROM endurance_connection
    WHERE user_id = ${userId} AND provider = ${provider}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return undefined;
  return {
    provider: row.provider as Provider,
    providerUserId: String(row.provider_user_id),
    encryptedToken: String(row.encrypted_token),
    permissions: Array.isArray(row.permissions)
      ? row.permissions.map(String)
      : [],
    connectedAt: new Date(row.connected_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString()
  };
}

export async function updateConnectionToken(
  userId: string,
  provider: Provider,
  providerUserId: string,
  encryptedToken: string
): Promise<void> {
  const sql = database();
  await sql`
    UPDATE endurance_connection
    SET encrypted_token = ${encryptedToken}, updated_at = now()
    WHERE user_id = ${userId} AND provider = ${provider}
      AND provider_user_id = ${providerUserId}
  `;
}

export async function upsertConnection(input: {
  userId: string;
  provider: Provider;
  providerUserId: string;
  encryptedToken: string;
  permissions: string[];
}): Promise<void> {
  const sql = database();
  const id = crypto
    .createHash("sha256")
    .update(`${input.userId}:${input.provider}`)
    .digest("hex");
  await sql`
    INSERT INTO endurance_connection (
      id, user_id, provider, provider_user_id, encrypted_token, permissions
    ) VALUES (
      ${id}, ${input.userId}, ${input.provider}, ${input.providerUserId},
      ${input.encryptedToken}, ${JSON.stringify(input.permissions)}::jsonb
    )
    ON CONFLICT (user_id, provider)
    DO UPDATE SET
      provider_user_id = EXCLUDED.provider_user_id,
      encrypted_token = EXCLUDED.encrypted_token,
      permissions = EXCLUDED.permissions,
      updated_at = now()
  `;
}

export async function updateConnectionPermissions(
  provider: Provider,
  providerUserId: string,
  permissions: string[]
): Promise<void> {
  const sql = database();
  await sql`
    UPDATE endurance_connection
    SET permissions = ${JSON.stringify(permissions)}::jsonb, updated_at = now()
    WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
  `;
}

export async function deleteConnection(
  provider: Provider,
  providerUserId: string
): Promise<void> {
  const sql = database();
  await sql`
    DELETE FROM endurance_connection
    WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
  `;
}

export async function createOAuthState(input: {
  userId: string;
  state: string;
  provider: Provider;
  encryptedVerifier: string;
  redirectUri: string;
}): Promise<void> {
  const sql = database();
  const stateHash = crypto.createHash("sha256").update(input.state).digest("hex");
  await sql`
    DELETE FROM endurance_oauth_state WHERE expires_at < now()
  `;
  await sql`
    INSERT INTO endurance_oauth_state (
      state_hash, user_id, provider, encrypted_verifier, redirect_uri, expires_at
    ) VALUES (
      ${stateHash}, ${input.userId}, ${input.provider}, ${input.encryptedVerifier},
      ${input.redirectUri}, now() + interval '10 minutes'
    )
  `;
}

export async function consumeOAuthState(state: string): Promise<{
  userId: string;
  provider: Provider;
  encryptedVerifier: string;
  redirectUri: string;
} | undefined> {
  const sql = database();
  const stateHash = crypto.createHash("sha256").update(state).digest("hex");
  const rows = await sql`
    DELETE FROM endurance_oauth_state
    WHERE state_hash = ${stateHash} AND expires_at >= now()
    RETURNING user_id, provider, encrypted_verifier, redirect_uri
  `;
  const row = rows[0];
  if (!row) return undefined;
  return {
    userId: String(row.user_id),
    provider: row.provider as Provider,
    encryptedVerifier: String(row.encrypted_verifier),
    redirectUri: String(row.redirect_uri)
  };
}
