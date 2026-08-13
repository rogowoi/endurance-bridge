# Endurance Bridge

Endurance Bridge is a private, self-hosted remote MCP server for endurance-sport data. Deploy one instance, connect your Garmin account, and give Codex, Claude Code, or another MCP client full Garmin Training and Courses access with a personal bearer key.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frogowoi%2Fendurance-bridge&env=DATABASE_URL,BRIDGE_API_KEY,APP_ORIGIN,CONNECTION_ENCRYPTION_KEY,GARMIN_CLIENT_ID,GARMIN_CLIENT_SECRET,GARMIN_WEBHOOK_SECRET&project-name=endurance-bridge&repository-name=endurance-bridge)

## Give this repository to Codex or Claude Code

Start from a clean Codex session with:

> Set up https://github.com/rogowoi/endurance-bridge so I can access my Garmin data from Codex or Claude Code.

The repository's [`AGENTS.md`](./AGENTS.md) contains the shared onboarding contract. Codex reads it directly; Claude Code loads it through [`CLAUDE.md`](./CLAUDE.md). Either agent will clone and test the project, generate unique installation secrets, deploy a private instance, guide the required Garmin developer configuration and OAuth step, add the resulting MCP endpoint, and verify it with a live read.

This self-hosted model requires the user to have an approved Garmin Connect Developer Program application. The public repository never contains a shared Garmin secret or bridge API key.

## What works

- Garmin OAuth 2.0 PKCE connection from a private setup page
- Garmin Activity PUSH webhook ingestion
- Encrypted provider-token storage using AES-256-GCM
- Bearer-protected Streamable HTTP MCP endpoint
- Seventeen Garmin MCP tools:
  - `garmin_connection_status`
  - `garmin_list_activities`
  - `garmin_get_activity`
  - `garmin_list_events`
  - `garmin_get_workout`
  - `garmin_create_workout`
  - `garmin_update_workout`
  - `garmin_delete_workout`
  - `garmin_list_schedules`
  - `garmin_get_schedule`
  - `garmin_create_schedule`
  - `garmin_update_schedule`
  - `garmin_delete_schedule`
  - `garmin_get_course`
  - `garmin_create_course`
  - `garmin_update_course`
  - `garmin_delete_course`
- Codex and Claude Code configuration

Strava and TrainingPeaks are planned adapters. The event model is already provider-neutral.

## Architecture

This is intentionally single-tenant. There are no Endurance Bridge user accounts:

1. The owner protects setup and MCP access with `BRIDGE_API_KEY`.
2. Garmin OAuth tokens are encrypted before storage.
3. Garmin sends activity events to an unguessable webhook URL.
4. MCP clients can read the connected owner's stored activity feed and manage Garmin workouts, schedules, and courses.

Every mutation defaults to a dry run. To send it to Garmin, repeat the same tool call with `dryRun: false` and `confirm: "WRITE_TO_GARMIN"`.

## Deploy

Prerequisites:

- PostgreSQL or Neon database
- Vercel account
- Approved Garmin Connect Developer Program application with Activity, Training, and Courses API access

1. Deploy with the button above or clone this repository.
2. Run `pnpm bootstrap` to create `.env.local` with unique generated secrets, then add the database and Garmin credentials.
3. Apply [`schema.sql`](./schema.sql) to the database.
4. Configure these environment variables:

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

5. Register this exact Garmin OAuth callback:

```text
https://YOUR_ORIGIN/api/v1/setup/garmin/callback
```

6. Configure Garmin Activity summaries as PUSH notifications to:

```text
https://YOUR_ORIGIN/api/v1/ingest/garmin/GARMIN_WEBHOOK_SECRET
```

Enable `activities`, `activityDetails`, `manuallyUpdatedActivities`, `deregistrations`, and `userPermissionsChange`.

7. Open `https://YOUR_ORIGIN/`, enter `BRIDGE_API_KEY`, and select **Connect Garmin**.

## Add to Codex

Each deployment has a different origin and bridge key, so Codex registers the MCP after deployment:

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
- Garmin write tools default to a no-op preview and require the exact `WRITE_TO_GARMIN` confirmation to execute.
- Activity, health, route, and routine information should be treated as sensitive personal data.

## License

MIT
