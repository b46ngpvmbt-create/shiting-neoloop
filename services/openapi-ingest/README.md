# OpenAPI ingest skeleton

This directory defines the independent `POST /v1/feedback` ingest boundary. It is an implementation skeleton, not a deployed service, and it has no Feishu adapter or credential reader.

## Security contract

Every request must use `Content-Type: application/json` and include:

- `Idempotency-Key`: stable source-scoped key, 8–128 characters.
- `X-NeoLoop-Timestamp`: Unix seconds or milliseconds, within five minutes of the injected clock.
- `X-NeoLoop-Nonce`: unique 16–128 character value.
- `X-NeoLoop-Signature`: `sha256=<hex>`, computed with HMAC-SHA256.

The signature payload is the exact UTF-8 concatenation below. The JSON body is not reformatted before verification.

```text
timestamp + "\n" + nonce + "\n" + idempotencyKey + "\n" + rawBody
```

The handler rejects stale timestamps, nonce replay, invalid signatures, bodies over 64 KiB, malformed contracts, and weak injected secrets. Nonces are consumed atomically only after signature verification.

Schema `1.0.0-draft.2` accepts only `data_scope=synthetic_experiment`. Real enterprise data is intentionally rejected; supporting it requires a new reviewed schema version plus explicit data authorization.

Same key plus same content returns the existing `feedback_id`. Same key plus different content returns `409 idempotency_conflict` without overwriting the stored record. Similar content under different keys remains separate for N5 review.

## Activation boundary

There is intentionally no listener, deployment manifest, Feishu client, environment loader, or embedded secret here. Activation requires a separately approved self-built application, minimum-permission validation, administrator approval, and independent secret storage. The public demo must never import this service.
