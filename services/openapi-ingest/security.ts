import { createHmac, timingSafeEqual } from "node:crypto";

import type { Clock } from "../../src/neoloop/contracts/ports.js";

export const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;
export const MAX_BODY_BYTES = 64 * 1024;

export interface NonceStore {
  consume(nonce: string, expiresAt: Date): Promise<boolean>;
}

export interface SignatureInput {
  timestamp: string;
  nonce: string;
  idempotencyKey: string;
  rawBody: string;
}

export type SignatureCheck =
  | { ok: true; expires_at: Date }
  | {
      ok: false;
      code:
        | "invalid_security_configuration"
        | "invalid_timestamp"
        | "request_expired"
        | "invalid_nonce"
        | "invalid_signature";
    };

export function signaturePayload(input: SignatureInput): string {
  return `${input.timestamp}\n${input.nonce}\n${input.idempotencyKey}\n${input.rawBody}`;
}

export function signRequest(secret: string, input: SignatureInput): string {
  return `sha256=${createHmac("sha256", secret).update(signaturePayload(input)).digest("hex")}`;
}

export function verifySignature(
  secret: string,
  input: SignatureInput,
  suppliedSignature: string,
  clock: Clock,
): SignatureCheck {
  if (secret.length < 32) {
    return { ok: false, code: "invalid_security_configuration" };
  }

  if (!/^\d{10,13}$/.test(input.timestamp)) {
    return { ok: false, code: "invalid_timestamp" };
  }
  const numericTimestamp = Number(input.timestamp);
  const timestampMs = input.timestamp.length === 10 ? numericTimestamp * 1000 : numericTimestamp;
  if (!Number.isSafeInteger(timestampMs)) {
    return { ok: false, code: "invalid_timestamp" };
  }

  const age = Math.abs(clock.now().getTime() - timestampMs);
  if (age > MAX_REQUEST_AGE_MS) {
    return { ok: false, code: "request_expired" };
  }

  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.nonce)) {
    return { ok: false, code: "invalid_nonce" };
  }

  const expected = signRequest(secret, input);
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(suppliedSignature, "utf8");
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return { ok: false, code: "invalid_signature" };
  }

  return { ok: true, expires_at: new Date(timestampMs + MAX_REQUEST_AGE_MS) };
}
