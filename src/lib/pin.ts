// The PIN is never stored. Only a salted PBKDF2 hash is kept.

export const PIN_LENGTH = 6;
export const PIN_ITERATIONS = 310_000;
const FREE_ATTEMPTS = 5;

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPin(pin: string, saltB64: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations },
    key,
    256,
  );
  return toB64(bits);
}

export async function createPinHash(pin: string) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  return { pinSalt: salt, pinIterations: PIN_ITERATIONS, pinHash: await hashPin(pin, salt, PIN_ITERATIONS) };
}

/** Constant-time comparison of two base64 hashes. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Lockout after a failed attempt: none for the first 5, then 30s doubling, capped at 1 hour. */
export function lockoutMs(failedAttempts: number): number {
  if (failedAttempts < FREE_ATTEMPTS) return 0;
  const extra = failedAttempts - FREE_ATTEMPTS;
  return Math.min(30_000 * 2 ** extra, 3_600_000);
}
