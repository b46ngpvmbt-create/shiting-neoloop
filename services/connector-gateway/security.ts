import { createHash } from "node:crypto";

import type { Clock } from "../../src/neoloop/contracts/ports.js";
import {
  MAX_BODY_BYTES,
  signRequest,
  verifySignature,
  type SignatureCheck,
} from "../openapi-ingest/security.js";

export { MAX_BODY_BYTES };

export interface GatewaySignatureInput {
  method: string;
  pathname: string;
  connectorId: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
}
export function gatewaySignatureDomain(input: Pick<GatewaySignatureInput, "method" | "pathname" | "connectorId">): string {
  return `neoloop-gateway-v1:${input.method.toUpperCase()}:${input.pathname}:${input.connectorId}`;
}

export function signGatewayRequest(secret: string, input: GatewaySignatureInput): string {
  return signRequest(secret, {
    timestamp: input.timestamp,
    nonce: input.nonce,
    idempotencyKey: gatewaySignatureDomain(input),
    rawBody: input.rawBody,
  });
}

export function verifyGatewaySignature(
  secret: string,
  input: GatewaySignatureInput,
  suppliedSignature: string,
  clock: Clock,
): SignatureCheck {
  return verifySignature(
    secret,
    {
      timestamp: input.timestamp,
      nonce: input.nonce,
      idempotencyKey: gatewaySignatureDomain(input),
      rawBody: input.rawBody,
    },
    suppliedSignature,
    clock,
  );
}

export function deriveGatewayIdempotencyKey(input: {
  connector_id: string;
  source_tenant_scope: string;
  source_record_id: string;
}): string {
  return createHash("sha256")
    .update(
      `neoloop-ingest-v1\n${input.connector_id}\n${input.source_tenant_scope}\n${input.source_record_id}`,
      "utf8",
    )
    .digest("hex");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function receiptId(idempotencyKey: string): string {
  return sha256(`neoloop-receipt-v1\n${idempotencyKey}`);
}

export async function readBoundedUtf8Body(request: Request): Promise<string> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new BodyTooLargeError();
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel("payload_too_large");
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidUtf8BodyError();
  }
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("payload_too_large");
    this.name = "BodyTooLargeError";
  }
}

export class InvalidUtf8BodyError extends Error {
  constructor() {
    super("invalid_utf8");
    this.name = "InvalidUtf8BodyError";
  }
}
