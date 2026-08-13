import crypto from "node:crypto";

function encryptionKey(): Buffer {
  const encoded = process.env.CONNECTION_ENCRYPTION_KEY;
  if (!encoded) throw new Error("CONNECTION_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("CONNECTION_ENCRYPTION_KEY must be 32 bytes encoded as base64");
  }
  return key;
}

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptJson<T>(value: string): T {
  const [ivPart, tagPart, ciphertextPart] = value.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Encrypted connection value is invalid");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
