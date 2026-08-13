# Endurance Bridge

Endurance Bridge is a private, self-hosted remote MCP server for endurance-sport data. Deploy one instance, connect your Garmin account, and give Codex, Claude Code, or another MCP client read-only access with a personal bearer key.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frogowoi%2Fendurance-bridge&env=DATABASE_URL,BRIDGE_API_KEY,APP_ORIGIN,CONNECTION_ENCRYPTION_KEY,GARMIN_CLIENT_ID,GARMIN_CLIENT_SECRET,GARMIN_WEBHOOK_SECRET&project-name=endurance-bridge&repository-name=endurance-bridge)

## What works

- Garmin OAuth 2.0 PKCE connection from a private setup page
- Garmin Activity PUSH webhook ingestion
- Encrypted provider-token storage using AES-256-GCM
- Bearer-protected Streamable HTTP MCP endpoint
- Four read-only MCP tools:
  - `garmin_connection_status`
  - `garmin_list_activities`
  - `garmin_get_activity`
  - `garmin_list_events`
- Codex and Claude Code configuration

Strava and TrainingPeaks are planned adapters. The event model is already provider-neutral.

## Architecture

This is intentionally single-tenant. There are no Endurance Bridge user accounts:

1. The owner protects setup and MCP access with `BRIDGE_API_KEY`.
2. Garmin OAuth tokens are encrypted before storage.
3. Garmin sends activity events to an unguessable webhook URL.
4. MCP clients can read only the connected owner's stored data.

The MCP server has no write tools. It cannot create, update, delete, schedule, or upload anything to Garmin.

## Deploy

Prerequisites:

- PostgreSQL or Neon database
- Vercel account
- Approved Garmin Connect Developer Program application with Activity API access

1. Deploy with the button above or clone this repository.
2. Apply [`schema.sql`](./schema.sql) to the database.
3. Configure these environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BRIDGE_API_KEY` | Long random bearer key for setup and MCP clients |
| `APP_ORIGIN` | Public deployment origin, for example `https://bridge.example.com` |
| `CONNECTION_ENCRYPTION_KEY` | Random 32-byte key encoded as base64 |
| `GARMIN_CLIENT_ID` | Garmin application client ID |
| `GARMIN_CLIENT_SECRET` | Garmin application client secret |
| `GARMIN_WEBHOOK_SECRET` | Long random URL segment for Garmin PUSH callbacks |

Generate safe keys:

```bash
openssl rand -hex 32       # BRIDGE_API_KEY and GARMIN_WEBHOOK_SECRET
openssl rand -base64 32    # CONNECTION_ENCRYPTION_KEY
```

4. Register this exact Garmin OAuth callback:

```text
https://YOUR_ORIGIN/api/v1/setup/garmin/callback
```

5. Configure Garmin Activity summaries as PUSH notifications to:

```text
https://YOUR_ORIGIN/api/v1/ingest/garmin/GARMIN_WEBHOOK_SECRET
```

Enable `activities`, `activityDetails`, `manuallyUpdatedActivities`, `deregistrations`, and `userPermissionsChange`.

6. Open `https://YOUR_ORIGIN/api/setup`, enter `BRIDGE_API_KEY`, and select **Connect Garmin**.

## Add to Codex

Codex supports remote Streamable HTTP MCP servers with bearer tokens. Put the personal key in the environment and register the endpoint:

```bash
export ENDURANCE_BRIDGE_API_KEY='your-bridge-key'
codex mcp add endurance-bridge \
  --url https://YOUR_ORIGIN/api/mcp \
  --bearer-token-env-var ENDURANCE_BRIDGE_API_KEY
```

Restart the Codex app, CLI, or IDE extension after changing MCP configuration. Use `/mcp` to inspect the connection.

## Add to Claude Code

Claude Code can expand environment variables in HTTP MCP headers:

```bash
export ENDURANCE_BRIDGE_API_KEY='your-bridge-key'
claude mcp add-json endurance-bridge \
  '{"type":"http","url":"https://YOUR_ORIGIN/api/mcp","headers":{"Authorization":"Bearer ${ENDURANCE_BRIDGE_API_KEY}"}}' \
  --scope user
```

Use `/mcp` inside Claude Code to inspect the connection.

## Local development

```bash
cp .env.example .env
pnpm install
pnpm check
vercel dev
```

Test a running MCP deployment with the official MCP client SDK:

```bash
ENDURANCE_BRIDGE_MCP_URL=https://YOUR_ORIGIN/api/mcp \
ENDURANCE_BRIDGE_API_KEY='your-bridge-key' \
pnpm mcp:check
```

## Security

- Never commit `.env`, provider secrets, OAuth tokens, activity exports, or personal MCP keys.
- Provider callback URLs and token-like fields are removed recursively before events are stored.
- Provider tokens are encrypted at rest with a deployment-specific key.
- The setup APIs and MCP endpoint require `Authorization: Bearer BRIDGE_API_KEY`.
- Garmin deregistration notifications remove the connected Garmin user's stored events.
- Activity, health, route, and routine information should be treated as sensitive personal data.

## License

MIT
