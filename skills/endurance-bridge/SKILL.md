---
name: endurance-bridge
description: Connect and use private endurance training data through the hosted Endurance Bridge MCP. Use when someone wants to install or configure Endurance Bridge for Codex or Claude, authenticate Garmin or another supported provider, troubleshoot MCP credentials or incomplete history, discuss a recent session or training period, compare training blocks, inspect health and recovery, read a training calendar or routes, or create, update, schedule, and delete workouts, calendar items, and routes.
---

# Endurance Bridge

Use the hosted journey unless the user explicitly asks to self-host or develop the server.

## Connect

1. Ask only for the Endurance Bridge invite link if none is available.
2. Open the link and let the user create their account and authorize a provider in the browser.
3. Create the private MCP key on the dashboard and run its complete command for the active client. Never print the key separately or persist it in a repository.
4. For macOS Codex, require both the shell export and `launchctl setenv` before `codex mcp add`.
5. Fully quit Codex with `⌘Q`, reopen it, and start a clean task.
6. Make a harmless read with `endurance_get_period`; do not lead with provider inventory unless the user asked about setup.
7. Report success only after the live MCP call completes.

Do not fall back to password automation, scraping, local unofficial libraries, or another user's connection.

## Route requests

Use `endurance_get_period` by default for a completed session, day, week, block, or comparison. Resolve relative dates in the user's timezone and pass explicit ISO boundaries. The response already combines activities, available details, health context, calendar, deterministic totals, provenance, and coverage.

Use a narrower tool only when it materially reduces work:

- Provider and permission discovery: `endurance_get_capabilities`
- Data completeness: `endurance_get_coverage`
- Missing provider history: `endurance_sync`
- Activity search: `endurance_list_activities`, then `endurance_get_activity`
- Health and recovery: `endurance_get_health`
- Known workouts: `endurance_get_workouts`
- Planned training: `endurance_get_calendar`
- Known routes: `endurance_get_routes`

Read [references/tools.md](references/tools.md) for argument and interpretation details.

## Discuss training

For “I just finished training,” query a short recent range with `endurance_get_period`. If the result is partial or empty, inspect coverage and use `endurance_sync`; ask the user to sync their device only when the returned next action requires it. Never infer “no training” from incomplete coverage.

For a full week or block, query the entire requested range once. Use returned deterministic totals for facts, then analyze distribution, intensity, consistency, plan completion, and recovery context. Clearly separate provider facts from interpretation. Ask for perceived effort, pain, fueling, conditions, or intent only when it changes the conclusion.

## Change training

For every create, update, or delete request involving a workout, calendar item, or route:

1. Call `endurance_prepare_change`.
2. Show the exact preview and ask for immediate approval.
3. After approval, call `endurance_apply_change` once with the returned token and `confirm: "APPLY_ENDURANCE_CHANGE"`.
4. Report the provider result.

Do not reuse a token or approval for another operation. Do not mutate provider data to test connectivity.

## Troubleshoot

- Missing `ENDURANCE_BRIDGE_API_KEY`: rerun the complete dashboard command, fully quit the client, reopen it, and retry in a clean task.
- Unauthorized: create a new dashboard key, rerun setup, and restart the client. The old key is revoked.
- Server visible but tools missing: restart the client before reconnecting the provider.
- Provider not connected: return to the dashboard and authorize it.
- Permission missing: reconnect and verify the required provider product or scope.
- `history_loading`: say Endurance Bridge is preparing recent history and retry shortly. Never send the user to provider developer tooling.

Treat live MCP schemas as the argument authority. Execute available reads and carry freshly approved changes through to a verified result.
