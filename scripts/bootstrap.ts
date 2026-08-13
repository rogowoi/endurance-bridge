import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve(process.cwd(), ".env.local");
const defaults: Record<string, string> = {
  DATABASE_URL: "",
  BRIDGE_API_KEY: crypto.randomBytes(32).toString("hex"),
  APP_ORIGIN: "http://localhost:3000",
  CONNECTION_ENCRYPTION_KEY: crypto.randomBytes(32).toString("base64"),
  GARMIN_CLIENT_ID: "",
  GARMIN_CLIENT_SECRET: "",
  GARMIN_WEBHOOK_SECRET: crypto.randomBytes(32).toString("hex")
};
const generatedSecretKeys = new Set([
  "BRIDGE_API_KEY",
  "CONNECTION_ENCRYPTION_KEY",
  "GARMIN_WEBHOOK_SECRET"
]);

function parseEnv(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

const existing = existsSync(outputPath)
  ? parseEnv(readFileSync(outputPath, "utf8"))
  : new Map<string, string>();

for (const [key, generatedValue] of Object.entries(defaults)) {
  if (
    !existing.has(key) ||
    (generatedSecretKeys.has(key) && !existing.get(key))
  ) {
    existing.set(key, generatedValue);
  }
}

const contents = `${Object.keys(defaults)
  .map((key) => `${key}=${existing.get(key) ?? ""}`)
  .join("\n")}\n`;

writeFileSync(outputPath, contents, { encoding: "utf8", mode: 0o600 });
console.log(
  "Prepared .env.local with installation-specific secrets. Add the database and Garmin credentials; values were not printed."
);
