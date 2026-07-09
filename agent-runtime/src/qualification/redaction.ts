const REDACTED = "[REDACTED]";

const SECRET_KEYS = new Set([
  "authorization",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "token",
  "secret",
  "password"
]);

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

function containsSecret(value: string): boolean {
  return /\bbearer\s+\S+/i.test(value) || /\bsk-[a-z0-9_-]+/i.test(value);
}

export function redactQualificationValue(value: unknown): unknown {
  if (typeof value === "string") {
    return containsSecret(value) ? REDACTED : value;
  }
  if (Array.isArray(value)) {
    return value.map(redactQualificationValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        isSecretKey(key) ? REDACTED : redactQualificationValue(nested)
      ])
    );
  }
  return value;
}
