# Endurance Bridge

Endurance Bridge connects Garmin to Codex, Claude Code, and other MCP clients. The hosted app supports separate invite-only accounts, private Garmin connections, and individual MCP keys.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frogowoi%2Fendurance-bridge&env=DATABASE_URL,BRIDGE_API_KEY,APP_ORIGIN,CONNECTION_ENCRYPTION_KEY,GARMIN_CLIENT_ID,GARMIN_CLIENT_SECRET,GARMIN_WEBHOOK_SECRET&project-name=endurance-bridge&repository-name=endurance-bridge)

## Give this repository to Codex or Claude Code

Invited friends can start from a clean session with:

> Help me connect my Garmin using https://github.com/rogowoi/endurance-bridge

The repository's [`AGENTS.md`](./AGENTS.md) contains the shared onboarding contract. Codex reads it directly; Claude Code loads it through [`CLAUDE.md`](./CLAUDE.md). The agent asks for the user's invite link, guides Garmin connection, adds the hosted MCP, and verifies it with a live read—without discussing infrastructure unless the user asks to self-host.

Friends do not need a Garmin developer account, database, or Vercel project. The hosted deployment uses the approved Endurance Bridge Garmin application. Self-hosters still need their own approved Garmin developer application.

## Install the Endurance Bridge skill

Give Codex this request:

> Install the `endurance-bridge` skill from https://github.com/rogowoi/endurance-bridge/tree/main/skills/endurance-bridge

Codex can install it with its built-in `skill-installer`. The skill becomes available on the next turn and teaches a clean session how to onboard a user, register the hosted MCP, restart the macOS app correctly, verify the connection with a live read, and use all Garmin read and write tools.

Manual Codex installation is also supported:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo rogowoi/endurance-bridge \
  --path skills/endurance-bridge
```

The skill uses the open Agent Skills directory format, so other compatible clients can install the [`skills/endurance-bridge`](./skills/endurance-bridge) folder as well.

## What works

- Garmin OAuth 2.0 PKCE connection from a private setup page
- Invite-only multi-user accounts with isolated connections
- One-way-hashed MCP keys and browser sessions
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

Activity and health tools read summaries already delivered to this deployment through Garmin PUSH; they are not live Garmin history queries. If expected history is missing, use Garmin API Tools **Summary Resender** for the relevant user, summary types, and time range. Workout, schedule, and course reads call Garmin live.

## Architecture

The hosted deployment is multi-user:

1. The owner creates single-use, seven-day invitation links.
2. Every invited person gets a separate account, Garmin connection, and MCP key.
3. MCP keys are stored as hashes; Garmin OAuth tokens are encrypted before storage.
4. Every MCP request resolves the authenticated user before reading data or calling Garmin.

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

Each deployment has a different origin and bridge key, so Codex registers the MCP after deployment.

For the Codex desktop app on macOS, set the key for both terminal and GUI processes before registering the server:

```bash
export ENDURANCE_BRIDGE_API_KEY='your-bridge-key'
launchctl setenv ENDURANCE_BRIDGE_API_KEY "$ENDURANCE_BRIDGE_API_KEY"
codex mcp add endurance-bridge \
  --url https://YOUR_ORIGIN/api/mcp \
  --bearer-token-env-var ENDURANCE_BRIDGE_API_KEY
```

Then fully quit Codex with **Codex → Quit Codex** or `⌘Q` and reopen it. Closing its window is not enough: the running app must restart to inherit the key. Start a clean task and ask it to call `garmin_connection_status`, followed by a harmless read such as `garmin_list_schedules`.

For Codex CLI-only use, the `export` and `codex mcp add` lines are sufficient when Codex is launched from that same shell. After a Mac restart, run the `launchctl setenv` line again before opening the desktop app.

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
