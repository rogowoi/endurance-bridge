export type Provider = "garmin" | "strava" | "trainingpeaks";

export interface EnduranceEvent {
  provider: Provider;
  providerUserId: string;
  eventType: string;
  externalId: string;
  startedAt: Date | null;
  occurredOn: string | null;
  payload: Record<string, unknown>;
}
