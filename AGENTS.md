# Endurance Bridge agent instructions

## User intent

When a user gives you this repository and asks to access their Garmin data, treat that as a request to onboard a private, single-tenant Endurance Bridge instance and connect it to their MCP client.

Do not point them at the maintainer's deployment and do not ask them to obtain a shared API key. Each installation owns its deployment, database, Garmin credentials, and bridge key.

## Preconditions

Confirm or discover these before deployment:

- A Vercel account available through the Vercel CLI.
- A PostgreSQL-compatible database such as Neon.
- An approved Garmin Connect Developer Program application with Activity, Health, Training, and Courses access.
- The Garmin application's client ID and client secret. Never print or commit either secret.

If the user does not have approved Garmin developer access, explain that this self-hosted version cannot call Garmin's official APIs for them. Do not substitute unofficial Garmin password login or scraping.

## Onboarding workflow

Proceed autonomously through safe, reversible steps. Ask the user only for account login, consent, or information that cannot be discovered locally.

1. Clone the repository and run `pnpm install` followed by `pnpm check`.
2. Run `pnpm bootstrap`. It creates `.env.local`, generates installation-specific secrets, and never prints their values.
3. Add `DATABASE_URL`, `GARMIN_CLIENT_ID`, and `GARMIN_CLIENT_SECRET` to `.env.local` without exposing their values in chat or terminal output.
4. Create or link a Vercel project and configure all variables listed in `.env.example`.
5. Apply `schema.sql` to the selected database.
6. Deploy a preview and verify the build, then deploy production after the user has requested a working/live integration.
7. Set `APP_ORIGIN` to the final production origin and redeploy if necessary.
8. In the Garmin developer portal, register `https://YOUR_ORIGIN/api/v1/setup/garmin/callback` as the OAuth callback.
9. Configure Garmin PUSH notifications at `https://YOUR_ORIGIN/api/v1/ingest/garmin/GARMIN_WEBHOOK_SECRET`, using the generated webhook secret from `.env.local`. Enable the supported Activity, Health, and permission/lifecycle event types.
10. Open `https://YOUR_ORIGIN/`, unlock setup with the generated `BRIDGE_API_KEY`, and let the user complete Garmin OAuth in the browser.
11. Store the bridge key in a local environment variable named `ENDURANCE_BRIDGE_API_KEY`. Never put the literal key in a committed file.
12. Register the MCP client. For Codex:

    ```bash
    codex mcp add endurance-bridge \
      --url https://YOUR_ORIGIN/api/mcp \
      --bearer-token-env-var ENDURANCE_BRIDGE_API_KEY
    ```

    For Claude Code:

    ```bash
    claude mcp add-json endurance-bridge \
      '{"type":"http","url":"https://YOUR_ORIGIN/api/mcp","headers":{"Authorization":"Bearer ${ENDURANCE_BRIDGE_API_KEY}"}}' \
      --scope user
    ```

13. Restart or reload the MCP client after configuration changes. Verify with `codex mcp get endurance-bridge` or `claude mcp get endurance-bridge`, then run `pnpm mcp:check`.
14. Call `garmin_connection_status`, then make a harmless read such as `garmin_list_schedules`. Do not create, update, schedule, or delete Garmin resources merely to test connectivity.

## Completion criteria

Onboarding is complete only when:

- The production deployment is ready.
- Garmin OAuth is connected with the expected permissions.
- The user's Codex or Claude Code installation discovers the MCP tools.
- A live read through the MCP succeeds.

Report the deployment origin and MCP endpoint, but never report secret values or OAuth tokens.

## Development rules

- Keep the server provider-neutral even when implementing a Garmin-specific adapter.
- Use fixed official Garmin API endpoints only.
- Never commit `.env`, `.env.local`, database URLs, provider secrets, bearer keys, or OAuth tokens.
- Run `pnpm check` before committing changes.
