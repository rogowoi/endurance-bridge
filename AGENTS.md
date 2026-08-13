# Endurance Bridge agent instructions

## When someone wants to use Garmin

Lead with the outcome: “I’ll connect your Garmin account to Codex or Claude.” Do not begin with a list of infrastructure, credentials, database requirements, or implementation details.

Endurance Bridge has two distinct journeys. Choose the first unless the user explicitly asks to host their own server.

### Hosted invitation journey

This is the normal path for friends and invited users.

1. Check whether the user has an Endurance Bridge invite link. If it is not in the prompt or available locally, ask only: “Please send me your Endurance Bridge invite link.”
2. Open the invite link. Let the user enter their name and complete Garmin authorization in the browser when required.
3. On the dashboard, create the user's MCP connection key and use the displayed command for the active client. Never print the key separately or commit it.
4. For Codex on macOS, run the dashboard's complete command. It sets `ENDURANCE_BRIDGE_API_KEY` for both the current shell and GUI apps with `launchctl setenv`, then registers `https://endurance-bridge-api.vercel.app/api/mcp` using that variable. Do not run only the `export` line: an already-running Codex desktop app will not inherit it.
5. For Claude Code, add the same HTTP endpoint with an `Authorization: Bearer ${ENDURANCE_BRIDGE_API_KEY}` header, normally at user scope.
6. After adding the server, fully quit the Codex desktop app with **Codex → Quit Codex** or `⌘Q`, then reopen it. Closing a window is not enough. Start a clean task, verify tool discovery, call `garmin_connection_status`, and make one harmless read such as `garmin_list_schedules`. If startup says `ENDURANCE_BRIDGE_API_KEY` is not set, repeat the dashboard command and fully restart Codex again.
7. Finish with a plain status: “Garmin connected and ready in Codex” or the exact remaining action.

Keep progress updates short and user-facing. Say “Connecting Garmin” instead of “configuring OAuth,” “Preparing your private connection” instead of “generating bearer credentials,” and “Adding it to Codex” instead of “registering a Streamable HTTP MCP transport.” Do not narrate every command or internal check.

### Self-hosting journey

Use this only when the user explicitly asks to self-host, deploy their own instance, or develop the project.

Prerequisites are a Vercel account, a PostgreSQL-compatible database, and an approved Garmin Connect Developer Program application. If Garmin developer access is missing, explain that official Garmin APIs require it; never substitute password login or scraping.

1. Clone the repository and run `pnpm install`, `pnpm check`, and `pnpm bootstrap`.
2. Add the database and Garmin credentials to `.env.local` without displaying secret values.
3. Apply `schema.sql`, configure the listed Vercel variables, deploy a preview, then deploy production when a live integration was requested.
4. Register the production Garmin callback and PUSH notification URLs.
5. Open the deployed dashboard, sign in as owner, and connect Garmin.
6. Create an MCP key, register the appropriate client, then verify tool discovery and a live read.

## Completion criteria

The task is complete only when the correct user's Garmin connection is active, their MCP client discovers the tools, and a live read succeeds. Never test connectivity by creating, updating, scheduling, or deleting Garmin resources.

## Development rules

- Every account must be scoped by `user_id`; never fall back to another user's connection.
- Keep provider access tokens encrypted and MCP access keys hashed.
- Keep the server provider-neutral even when implementing a Garmin-specific adapter.
- Use fixed official Garmin API endpoints only.
- Never commit environment files, database URLs, provider secrets, bearer keys, invite tokens, sessions, or OAuth tokens.
- Run `pnpm check` before committing changes.
