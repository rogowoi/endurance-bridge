---
name: endurance-bridge
description: Connect and use a private Garmin account through the hosted Endurance Bridge MCP server. Use when someone wants to install or configure Endurance Bridge for Codex or Claude, authenticate Garmin, troubleshoot missing MCP tools or ENDURANCE_BRIDGE_API_KEY, inspect activities and health events, read workout schedules, or create, update, schedule, and delete Garmin workouts and courses.
---

# Endurance Bridge

Connect the user's hosted Endurance Bridge account, verify the MCP in the active client, and use the discovered Garmin tools. Prefer the hosted journey unless the user explicitly asks to self-host or develop the server.

## Connect

1. Ask only for the user's Endurance Bridge invite link if none is available.
2. Open the invite link and let the user enter their name and authorize Garmin in the browser.
3. On the dashboard, create the private MCP connection key and run the complete command shown for the active client. Never print the key separately, persist it in the repository, or ask the user to paste it into chat.
4. For the macOS Codex app, ensure the command includes both `export ENDURANCE_BRIDGE_API_KEY=...` and `launchctl setenv ENDURANCE_BRIDGE_API_KEY "$ENDURANCE_BRIDGE_API_KEY"` before `codex mcp add`.
5. Fully quit Codex with `⌘Q` and reopen it. Closing a window does not restart the host or reload its environment.
6. Start a clean task. Verify `endurance-bridge` tool discovery, call `garmin_connection_status`, then make one harmless read such as `garmin_list_schedules`.
7. Report success only after the live read completes.

Do not use a local Garmin script, password automation, scraping library, or another user's connection as a fallback for a hosted MCP failure.

## Troubleshoot

- `ENDURANCE_BRIDGE_API_KEY ... is not set`: rerun the full dashboard command, fully quit Codex with `⌘Q`, reopen it, and retry in a clean task.
- `Unauthorized`: create a new connection key from the dashboard, rerun the client setup, and restart the client. Creating a new key revokes the previous one.
- MCP server appears but Garmin tools do not: inspect the client MCP status, then restart the client. Do not reconnect Garmin until `garmin_connection_status` is callable.
- `Garmin is not connected`: return to the dashboard and complete Garmin authorization.
- A permission is missing: reconnect Garmin and verify the user's granted permissions. `WORKOUT_IMPORT` is required for workouts and schedules; `COURSE_IMPORT` is required for courses.
- An activity list is empty: say the bridge has no matching received PUSH summaries. Never say Garmin returned zero activities. Use Garmin's API Tools Summary Resender for missing summaries, or ask Garmin Developer Support to regenerate missed notifications when the resender cannot recover them.

## Use Garmin

Treat the live MCP tool schemas as the authority for arguments. Use the smallest tool that answers the request:

- A session the user just finished or wants to discuss: call `garmin_get_latest_activity` first. If its status is `waiting_for_garmin_sync`, ask the user to sync the watch with Garmin Connect and retry the same tool. When ready, analyze the returned summary and detail records; ask about perceived effort, pain, fueling, conditions, or the workout goal only when those details materially improve the discussion.
- Connection and permissions: `garmin_connection_status`
- Completed activity summaries received by the bridge: `garmin_list_activities`, then `garmin_get_activity`
- Health and raw PUSH data received by the bridge: `garmin_list_events`
- Workouts: `garmin_get_workout` plus create, update, and delete tools
- Calendar: `garmin_list_schedules`, `garmin_get_schedule` plus create, update, and delete tools
- Routes: `garmin_get_course` plus create, update, and delete tools

Read [references/tools.md](references/tools.md) when choosing tools, interpreting empty data, or performing a Garmin write.

For every create, update, schedule, or delete request:

1. Call the exact tool with `dryRun: true`.
2. Show the preview and ask for immediate approval.
3. After approval, repeat that exact tool once with `dryRun: false` and `confirm: "WRITE_TO_GARMIN"`.
4. Report Garmin's result. Never reuse approval for another operation.

Do not stop at instructions when the MCP tools are available. Execute the requested reads, and carry approved writes through to a verified result.
