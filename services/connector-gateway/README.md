# Connector gateway

This directory is the synthetic-only, private intake boundary for 石听 NeoLoop. It is implemented but not deployed. It does not contain credentials and its tests never call Feishu or Cloudflare.

## Runtime shape

One SQLite-backed `GatewayDurableObject` is selected from the runtime-only `TARGET_BASE_KEY`. All connector mutations and writes for that target Base pass through the same object. SQLite persists connector registrations, encrypted connector secrets, five-minute nonces, ingest receipts, dead letters, reconciliation state, and the two-attempt W2 analysis ledger.

The Worker entrypoint sends `/api/*` to the Durable Object before static assets. `wrangler.jsonc` binds `../../feishu/workbench-plugin/dist` as `ASSETS`; every non-API request is delegated to that binding. Static assets receive none of the runtime secrets. Never embed `OWNER_API_TOKEN` or `ANALYSIS_API_TOKEN` in browser JavaScript.

Wrangler uses the current declarative Durable Object `exports` form with `storage: "sqlite"`; Wrangler rejects mixing that declaration with legacy `migrations`. It intentionally has no `vars` containing credentials.

## Required runtime secrets

The names are frozen in `secrets.required.txt`. Supply them at deployment time with the platform secret mechanism. `FEISHU_RAW_FEEDBACK_FIELD_MAP` and `FEISHU_AI_AUDIT_FIELD_MAP` are JSON mappings from canonical keys to the exact field names accepted by the Base record API. The Base/table identifiers remain separate runtime values. No value belongs in Git, Wrangler `vars`, static assets, request logs, or error responses.

The connector master key is a base64url-encoded 32-byte AES key. Connector secrets are generated independently, encrypted with AES-256-GCM plus connector/version AAD, and returned only on create or rotation.

## Intake API

- `POST /api/v1/connectors` and `GET /api/v1/connectors`: Owner-only create/list.
- `POST /api/v1/connectors/:id/rotate-secret`: Owner-only rotation; the new secret is shown once.
- `POST /api/v1/connectors/:id/disable`: Owner-only, fail-closed disable.
- `POST /api/v1/connectors/:id/feedback`: signed webhook or polling delivery.
- `POST /api/v1/connectors/:id/batch`: signed batch of 1–100 normalized items; the whole batch is shape-validated before its first write.
- `POST /api/v1/manual-feedback`: Owner-authenticated fallback using the same normalized ingest and receipt path.
- `POST /api/v1/reconciliation/:receipt_id/check`: Owner-only exact readback; it never retries a write.
- `POST /api/v1/analysis/:profile`: N1/N2/N3 single-candidate validation and audit. The JSON body has exactly `contract`, `operation`, `record_id`, `profile_id`, `node`, `attempt`, and `candidate`. The gateway rereads authoritative raw feedback, constructs the request, runs `runOwnerFirstLiveAttempt` with the feedback's stable `created_at`, rereads for drift, and executes exactly one idempotent `append_ai_audit` operation. It has no business-write port.

The W2 ledger accepts attempts 1 and 2 only. Attempt 1 can return `continue`, `retry`, or `stop`; attempt 2 is accepted only after a persisted `retry` and returns `continue` or `stop`. Prompt injection stops immediately. Same-attempt/same-candidate replay returns the persisted exact response and creates no second audit; same-attempt/different-candidate, an out-of-order second attempt, and any third attempt fail closed. A successful N2 response also carries the deterministic hard-rule result JSON used by the N3 prompt.

Signed connector requests use the exact UTF-8 body and:

```text
timestamp + "\n" + nonce + "\n" +
"neoloop-gateway-v1:" + method + ":" + pathname + ":" + connector_id + "\n" +
rawBody
```

The signature is `sha256=<HMAC-SHA256 hex>`. Timestamp age is at most five minutes, nonce use is atomic per connector, and the complete request body is at most 64 KiB. The connector manifest and every normalized item are fixed to `synthetic_experiment`.

## Idempotency and Feishu boundary

```text
SHA256("neoloop-ingest-v1\n" + connector_id + "\n" + source_tenant_scope + "\n" + source_record_id)
```

The gateway imports the existing `ingestFeedback`, fingerprint, and OpenAPI signature primitives rather than duplicating their domain decisions. Same key/same fingerprint returns the committed receipt; same key/different fingerprint returns `409` without overwrite.

The production adapter obtains a tenant token from the self-built app credentials, exact-searches the idempotency key, creates with a deterministic Feishu `client_token`, then reads the created record back. An ambiguous create timeout is exact-searched before at most one same-token retry. A second ambiguous outcome becomes `reconciliation_required`; later delivery does not create again. Confirmed non-writes become hashed dead letters. Neither store contains request signatures, access tokens, connector plaintext secrets, or dead-letter raw text.

AI audit appends use the same discipline: exact `run_id` search, deterministic `client_token`, create, exact readback, and full field equivalence. An ambiguous response is searched before one retry; an existing mismatched `run_id` fails closed.

## Local verification

The dedicated test compiles this directory and its imported NeoLoop dependencies into a temporary directory:

```sh
node --test tests/core/connector-gateway.test.mjs
```

Wrangler validation is dry-run only. Deployment and secret creation require separate user authorization.
