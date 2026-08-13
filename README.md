# Endurance Bridge

Endurance Bridge is a small, provider-neutral gateway for endurance-sport data. It receives provider webhooks, normalizes their identity and timing fields, stores the original provider payload without credentials, and exposes a protected query API for coaching tools and agents.

## Provider status

- Garmin Connect Developer Program: active adapter
- Strava: planned adapter
- TrainingPeaks: planned adapter

The storage and read API are provider-neutral, so future adapters use the same `provider`, `providerUserId`, `eventType`, `externalId`, and `startedAt` contract.

## Endpoints

- `GET /api/health` - public service status
- `POST /api/v1/ingest/garmin/:secret` - Garmin PUSH receiver; also verifies the `garmin-client-id` header
- `GET /api/v1/events?provider=garmin&userId=...&type=activities&from=...&to=...` - bearer-protected event query

## Local setup

1. Create a PostgreSQL database and apply `schema.sql`.
2. Copy `.env.example` to `.env` and populate its values.
3. Install dependencies with `pnpm install`.
4. Run `pnpm check`.
5. Run locally with `vercel dev`.

## Garmin configuration

Configure Garmin Activity summaries as PUSH notifications to:

```text
https://YOUR_DEPLOYMENT/api/v1/ingest/garmin/GARMIN_WEBHOOK_SECRET
```

Enable at least `activities`, `activityDetails`, `deregistrations`, and `userPermissionsChange`. The receiver rejects requests unless both the secret URL parameter and Garmin's `garmin-client-id` header match.

## Security

- Provider callback/access/refresh token fields are recursively removed before persistence.
- The read API requires `Authorization: Bearer BRIDGE_API_KEY`.
- Garmin deregistration notifications delete that Garmin user's stored events.
- Never commit `.env`, provider secrets, access tokens, or personal activity exports.

## License

MIT
