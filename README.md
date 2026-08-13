# Endurance Bridge

Endurance Bridge is a multi-user MCP gateway for endurance data. A person connects a provider once, adds one private MCP endpoint to Codex, Claude, or another compatible client, and can then discuss training periods or manage training resources in plain language.

Garmin is the active adapter. Strava and TrainingPeaks are represented in the capability model and are planned adapters; the server reports them as unavailable instead of pretending they work.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frogowoi%2Fendurance-bridge&env=DATABASE_URL,BRIDGE_API_KEY,APP_ORIGIN,CONNECTION_ENCRYPTION_KEY,GARMIN_CLIENT_ID,GARMIN_CLIENT_SECRET,GARMIN_WEBHOOK_SECRET&project-name=endurance-bridge&repository-name=endurance-bridge)

## Give this repository to an agent

From a clean Codex or Claude Code session, say:

> Help me connect my training data using https://github.com/rogowoi/endurance-bridge

[`AGENTS.md`](./AGENTS.md) is the shared onboarding contract. Codex reads it directly and Claude Code loads it through [`CLAUDE.md`](./CLAUDE.md). An invited user does not need a Garmin developer account, database, or Vercel project; the hosted deployment owns that infrastructure.

## Install the skill

Ask Codex:

> Install the `endurance-bridge` skill from https://github.com/rogowoi/endurance-bridge/tree/main/skills/endurance-bridge

Or install it manually:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo rogowoi/endurance-bridge \
  --path skills/endurance-bridge
```

The skill uses the open Agent Skills directory format. It teaches a fresh agent setup, query routing, coverage semantics, and the two-step change workflow.

## The MCP contract

The public contract is provider-neutral and intentionally small:

| Tool | Purpose |
| --- | --- |
| `endurance_get_capabilities` | Discover connected providers, permissions, delivery modes, and supported operations |
| `endurance_get_coverage` | Check whether a resource and time range is ready, partial, or unavailable |
| `endurance_sync` | Resolve missing coverage using the provider-supported synchronization path |
| `endurance_get_period` | Fetch a complete session, week, block, or comparison bundle |
| `endurance_list_activities` | Return canonical activity groups, totals, provenance, and coverage |
| `endurance_get_activity` | Return one canonical activity and all available detail records |
| `endurance_get_health` | Query health and recovery summaries for a period |
| `endurance_get_workouts` | Fetch structured workouts by provider ID |
| `endurance_get_calendar` | Query planned training live from providers |
| `endurance_get_routes` | Fetch routes by provider ID |
| `endurance_prepare_change` | Validate and preview a workout, calendar, or route mutation |
| `endurance_apply_change` | Apply one approved, unexpired prepared change |

There are no public `garmin_*` tools. Provider-specific endpoints and payload rules live behind this contract.

## Natural-language use cases

The default tool for training discussion is `endurance_get_period`:

- “Discuss the session I just finished.”
- “Review my full last week, including sleep and planned versus completed training.”
- “Compare the last four weeks with the four before them.”
- “What did I miss from the plan this week?”
- “Build a recovery week from what I actually completed.”

Every period response contains deterministic totals, source provenance, and coverage. A partial result is never interpreted as zero training.

For a newly connected Garmin account, Activity and Health data already delivered after connection can be queried immediately at runtime. Garmin does not provide an arbitrary historical pull endpoint for these products; `endurance_sync` detects pre-connection gaps and returns the exact Summary Resender action instead. Calendar, workout, and route operations call Garmin live.

## Architecture

1. The owner creates single-use, seven-day invitation links.
2. Each person gets an isolated account, provider connection, and MCP key.
3. MCP keys are one-way hashed; provider OAuth tokens are encrypted at rest.
4. Each MCP request resolves the authenticated user before reading or calling a provider.
5. Provider records are normalized into canonical activities and health events with source provenance.
6. Mutations are provider-neutral: prepare an exact preview, obtain immediate approval, then apply the encrypted change token once.

## Deploy

Prerequisites for self-hosting:

- PostgreSQL or Neon
- Vercel
- An approved Garmin Connect Developer Program app with the required Activity, Health, Training, and Courses products

1. Clone the repository and run `pnpm install`.
2. Run `pnpm bootstrap`, then add the database and Garmin credentials to `.env.local`.
3. Apply [`schema.sql`](./schema.sql).
4. Configure:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BRIDGE_API_KEY` | Owner/setup bearer key |
| `APP_ORIGIN` | Public deployment origin |
| `CONNECTION_ENCRYPTION_KEY` | Random 32-byte key encoded as base64 |
| `GARMIN_CLIENT_ID` | Garmin application client ID |
| `GARMIN_CLIENT_SECRET` | Garmin application client secret |
| `GARMIN_WEBHOOK_SECRET` | Long random webhook URL segment |

Generate secrets with `openssl rand -hex 32` and an encryption key with `openssl rand -base64 32`.

5. Register this OAuth callback:

```text
https://YOUR_ORIGIN/api/v1/setup/garmin/callback
```

6. Configure Garmin PUSH delivery to:

```text
https://YOUR_ORIGIN/api/v1/ingest/garmin/GARMIN_WEBHOOK_SECRET
```

7. Open `https://YOUR_ORIGIN/`, enter `BRIDGE_API_KEY`, connect Garmin, invite users, and create a private MCP key.

## Add to Codex

Use the complete command shown by the dashboard. On macOS it has this form:

```bash
export ENDURANCE_BRIDGE_API_KEY='your-private-key'
launchctl setenv ENDURANCE_BRIDGE_API_KEY "$ENDURANCE_BRIDGE_API_KEY"
codex mcp add endurance-bridge \
  --url https://YOUR_ORIGIN/api/mcp \
  --bearer-token-env-var ENDURANCE_BRIDGE_API_KEY
```

Fully quit Codex with **Codex → Quit Codex** or `⌘Q`, reopen it, and start a clean task. Ask: **“Check my endurance providers and discuss my full last week.”**

For CLI-only use, export the key in the shell that launches Codex. After restarting macOS, set the `launchctl` value again before opening the desktop app.

## Add to Claude Code

```bash
export ENDURANCE_BRIDGE_API_KEY='your-private-key'
claude mcp add-json endurance-bridge \
  '{"type":"http","url":"https://YOUR_ORIGIN/api/mcp","headers":{"Authorization":"Bearer ${ENDURANCE_BRIDGE_API_KEY}"}}' \
  --scope user
```

Use `/mcp` to inspect the connection, then ask the same natural-language questions.

## Development

```bash
cp .env.example .env
pnpm install
pnpm check
vercel dev
```

Verify a deployment with the official MCP client SDK:

```bash
ENDURANCE_BRIDGE_MCP_URL=https://YOUR_ORIGIN/api/mcp \
ENDURANCE_BRIDGE_API_KEY='your-private-key' \
pnpm mcp:check
```

## Privacy and change control

- Never commit environment files, provider secrets, OAuth tokens, activity exports, or personal MCP keys.
- Callback URLs and token-like fields are removed recursively before event storage.
- Account data is always scoped by user ID.
- Treat health, activity, location, route, and routine data as sensitive.
- `endurance_prepare_change` performs no provider mutation.
- Apply only the exact preview the user just approved, using `endurance_apply_change` with `confirm: "APPLY_ENDURANCE_CHANGE"`.

## License

MIT
