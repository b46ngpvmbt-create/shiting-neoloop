import type { IngestPorts } from "../../src/neoloop/contracts/ports.js";
import { ingestFeedback } from "../../src/neoloop/domain/idempotency.js";
import { InvalidIngestRequestError, parseIngestRequest } from "./request.js";
import { MAX_BODY_BYTES, type NonceStore, verifySignature } from "./security.js";

export interface OpenApiIngestDependencies extends IngestPorts {
  hmacSecret: string;
  nonces: NonceStore;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function requiredHeader(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.trim();
  return value && value.length > 0 ? value : null;
}

export async function handleOpenApiIngest(request: Request, dependencies: OpenApiIngestDependencies): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/v1/feedback") {
    return json(404, { error: "not_found" });
  }
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(415, { error: "unsupported_media_type" });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  const timestamp = requiredHeader(request, "x-neoloop-timestamp");
  const nonce = requiredHeader(request, "x-neoloop-nonce");
  const signature = requiredHeader(request, "x-neoloop-signature");
  const idempotencyKey = requiredHeader(request, "idempotency-key");
  if (!timestamp || !nonce || !signature || !idempotencyKey) {
    return json(401, { error: "missing_security_headers" });
  }
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) {
    return json(400, { error: "invalid_idempotency_key" });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return json(413, { error: "payload_too_large" });
  }

  const signatureCheck = verifySignature(
    dependencies.hmacSecret,
    { timestamp, nonce, idempotencyKey, rawBody },
    signature,
    dependencies.clock,
  );
  if (!signatureCheck.ok) {
    const status = signatureCheck.code === "invalid_security_configuration" ? 503 : 401;
    return json(status, { error: signatureCheck.code });
  }

  if (!(await dependencies.nonces.consume(nonce, signatureCheck.expires_at))) {
    return json(401, { error: "nonce_replay" });
  }

  try {
    const ingestRequest = parseIngestRequest(rawBody, idempotencyKey);
    const result = await ingestFeedback(ingestRequest, dependencies);
    if (result.outcome === "idempotency_conflict") {
      return json(409, { error: "idempotency_conflict", idempotency_key: result.idempotency_key });
    }
    return json(result.outcome === "created" ? 201 : 200, {
      outcome: result.outcome,
      feedback_id: result.feedback_id,
      idempotency_key: result.idempotency_key,
      created_at: result.created_at,
    });
  } catch (error) {
    if (error instanceof InvalidIngestRequestError) {
      return json(400, { error: "invalid_request", message: error.message });
    }
    return json(500, { error: "internal_error" });
  }
}
