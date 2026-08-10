import { createHash } from "node:crypto";

import type { JsonValue } from "../contracts/model.js";

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function createWorkflowEventFingerprint(value: JsonValue): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
