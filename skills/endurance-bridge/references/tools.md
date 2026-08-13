# Garmin MCP tools

## Read tools

| Task | Tool | Key inputs |
| --- | --- | --- |
| Check connection and permissions | `garmin_connection_status` | None |
| List completed activities | `garmin_list_activities` | Optional inclusive ISO `from`, exclusive ISO `to`, `limit` 1–200 |
| Get stored activity records | `garmin_get_activity` | `summaryId` from the activity list |
| Inspect normalized Garmin feed | `garmin_list_events` | Optional event `type`, ISO range, and `limit` |
| Get a workout | `garmin_get_workout` | `workoutId` |
| List scheduled workouts | `garmin_list_schedules` | Inclusive `startDate` and `endDate` as `YYYY-MM-DD` |
| Get a schedule entry | `garmin_get_schedule` | `workoutScheduleId` |
| Get a course or route | `garmin_get_course` | `courseId` |

Use the user's timezone to resolve relative dates such as “this week.” State the resulting date range when it matters.

Activity and health reads query Garmin PUSH data already received by Endurance Bridge. They are not live Garmin queries. Schedule, workout, and course reads call Garmin live.

If expected activity data is absent, use Garmin API Tools → Summary Resender to resend the relevant summary types and time range. If notifications were accepted but not processed and the resender cannot recover them, Garmin's Activity API documentation directs partners to Developer Support for regeneration. Do not invent a historical pull URL: Activity API pull URLs contain Garmin-issued tokens delivered in PING notifications.

## Write tools

The MCP exposes create, update, and delete tools for workouts, schedules, and courses. Use the live tool schema to construct the provider payload.

- Workout and schedule writes require `WORKOUT_IMPORT`.
- Course writes require `COURSE_IMPORT`.
- Create payloads must not contain a resource ID.
- Update payload IDs must match the tool's path ID.
- Updates replace the full resource, so retrieve the existing resource first when changing only part of it.
- Every write requires a dry run, a fresh user approval, and then the exact `WRITE_TO_GARMIN` confirmation.

## Interpretation

- An empty schedule result means Garmin returned no scheduled workouts for that range.
- An empty activity result means the bridge has no matching received PUSH records. It says nothing definitive about whether the user trained or what Garmin Connect contains.
- Separate “configured API products” from the permissions shown by `garmin_connection_status`.
- Treat health, activity, location, course, and routine data as private.
