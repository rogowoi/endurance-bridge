import crypto from "node:crypto";

export function secureEquals(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(
      Uint8Array.from(actualBytes),
      Uint8Array.from(expectedBytes)
    )
  );
}

export function bearerToken(value: string | undefined): string | undefined {
  if (!value?.startsWith("Bearer ")) return undefined;
  return value.slice("Bearer ".length);
}
