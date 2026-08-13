# Endurance MCP tools

## Query tools

| Task | Tool | Main inputs |
| --- | --- | --- |
| Discover providers and operations | `endurance_get_capabilities` | None |
| Inspect completeness | `endurance_get_coverage` | Provider, resource, optional ISO range |
| Resolve a coverage gap | `endurance_sync` | Provider, resource, ISO range |
| Discuss a session, week, block, or comparison | `endurance_get_period` | ISO range, timezone, optional comparison |
| Search activities | `endurance_list_activities` | ISO range, providers, limit |
| Inspect one activity | `endurance_get_activity` | Canonical `activityId` |
| Inspect recovery context | `endurance_get_health` | ISO range, optional event types |
| Read known workouts | `endurance_get_workouts` | Provider and workout IDs |
| Read planned training | `endurance_get_calendar` | ISO range, timezone, providers |
| Read known routes | `endurance_get_routes` | Provider and route IDs |

Use half-open time ranges: `from` is inclusive and `to` is exclusive. Resolve natural dates such as “last week” in the user's timezone and state the resulting range when ambiguity matters.

`ready` means the adapter can answer the requested range under its documented delivery model. `partial` means some requested history may be missing. `unavailable` means the provider, permission, or adapter is not available. Always preserve `coverage` and `provenance` when presenting conclusions.

Garmin Activity and Health use provider PUSH delivery into the bridge. New post-connection summaries are runtime-queryable from the mirror. Historical gaps are queued for the deployment owner; invited users receive `history_loading` and should retry later. Garmin calendar, workout, and route calls are live.

## Change tools

Use `endurance_prepare_change` for provider-neutral workout, calendar-item, and route changes. It validates the operation and returns an exact preview plus a short-lived encrypted token without calling the provider.

After the user approves that exact preview, call `endurance_apply_change` once with the token and `confirm: "APPLY_ENDURANCE_CHANGE"`.

- Create operations require a payload and omit provider resource IDs.
- Update operations require a resource ID; any ID inside the payload must match it.
- Delete operations require a resource ID and no payload.
- Updates may replace the full provider resource, so retrieve current state before a partial conceptual edit.

## Interpretation

- Empty data with ready coverage is evidence of no matching records in that source and range.
- Empty data with partial coverage is inconclusive.
- Provider facts, deterministic aggregates, and coaching interpretation are different layers; label them accordingly.
- Treat activity, health, location, route, and routine data as private.
