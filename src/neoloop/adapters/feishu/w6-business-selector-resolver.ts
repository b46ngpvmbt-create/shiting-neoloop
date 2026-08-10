import type { JsonValue } from "../../contracts/model.js";
import {
  isW6ReopenProjectionId,
  snapshotDescriptorSafeJsonValue,
} from "./w6-reopen-projector.js";

export type W6BusinessSelectorTarget = "clusters" | "improvements";
export type W6BusinessSelectorField = "cluster_id" | "improvement_id";
export type W6BusinessSelectorError =
  | "invalid_projection_input"
  | "projection_conflict"
  | "projection_dependency_failure";
export type W6BusinessSelectorClassification =
  | "exact_single_match"
  | "projection_conflict"
  | "projection_dependency_failure";

export class W6BusinessSelectorFailure extends Error {
  readonly error: W6BusinessSelectorError;

  constructor(error: W6BusinessSelectorError) {
    super("W6 business selector request was rejected");
    this.name = "W6BusinessSelectorFailure";
    this.error = error;
  }
}

export interface W6BusinessSelectorRequest {
  readonly target: W6BusinessSelectorTarget;
  readonly business_id: string;
}

export interface W6BusinessSelectorProviderQuery {
  readonly target: W6BusinessSelectorTarget;
  readonly field: W6BusinessSelectorField;
  readonly value: string;
  readonly limit: 2;
}

export interface W6BusinessSelectorProvider {
  findByBusinessKey(query: W6BusinessSelectorProviderQuery): Promise<unknown>;
}

export interface W6BusinessSelectorEvidence {
  readonly target: W6BusinessSelectorTarget;
  readonly match_count: 0 | 1 | 2 | null;
  readonly classification: W6BusinessSelectorClassification;
  readonly business_write_count: 0;
}

type PrivateW6BusinessRecordLocator = Readonly<Record<string, JsonValue>>;

export interface PrivateW6BusinessSelectorResolution {
  readonly evidence: W6BusinessSelectorEvidence;
  consumePrivateLocator<T>(consumer: (locator: PrivateW6BusinessRecordLocator) => T): T | undefined;
}

type JsonObject = { [key: string]: JsonValue };

const REQUEST_KEYS = Object.freeze(["target", "business_id"] as const);
const PROVIDER_RESULT_KEYS = Object.freeze(["matches"] as const);
const PROVIDER_MATCH_KEYS = Object.freeze(["locator"] as const);

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(record: JsonObject, expected: readonly string[]): void {
  const keys = Object.keys(record);
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(record, key))) {
    throw new W6BusinessSelectorFailure("invalid_projection_input");
  }
}

function clonePlainFrozenJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    const output = value.map((entry) => clonePlainFrozenJsonValue(entry));
    Object.freeze(output);
    return output;
  }
  if (!isJsonObject(value)) return value;
  const output: JsonObject = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(output, key, {
      value: clonePlainFrozenJsonValue(value[key]),
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return Object.freeze(output);
}

function snapshotRequest(value: unknown): Readonly<{
  target: W6BusinessSelectorTarget;
  business_id: string;
}> {
  let snapshot: JsonValue;
  try {
    snapshot = snapshotDescriptorSafeJsonValue(value);
  } catch {
    throw new W6BusinessSelectorFailure("invalid_projection_input");
  }
  if (!isJsonObject(snapshot)) throw new W6BusinessSelectorFailure("invalid_projection_input");
  requireExactKeys(snapshot, REQUEST_KEYS);
  if (snapshot.target !== "clusters" && snapshot.target !== "improvements") {
    throw new W6BusinessSelectorFailure("invalid_projection_input");
  }
  if (!isW6ReopenProjectionId(snapshot.business_id)) {
    throw new W6BusinessSelectorFailure("invalid_projection_input");
  }
  return Object.freeze({
    target: snapshot.target,
    business_id: snapshot.business_id,
  });
}

function fieldFor(target: W6BusinessSelectorTarget): W6BusinessSelectorField {
  return target === "clusters" ? "cluster_id" : "improvement_id";
}

function createEvidence(
  target: W6BusinessSelectorTarget,
  matchCount: 0 | 1 | 2 | null,
  classification: W6BusinessSelectorClassification,
): W6BusinessSelectorEvidence {
  return Object.freeze({
    target,
    match_count: matchCount,
    classification,
    business_write_count: 0,
  });
}

class PrivateResolution implements PrivateW6BusinessSelectorResolution {
  readonly evidence: W6BusinessSelectorEvidence;
  readonly #locator: PrivateW6BusinessRecordLocator | undefined;

  constructor(
    evidence: W6BusinessSelectorEvidence,
    locator?: PrivateW6BusinessRecordLocator,
  ) {
    this.evidence = evidence;
    this.#locator = locator;
    Object.freeze(this);
  }

  consumePrivateLocator<T>(
    consumer: (locator: PrivateW6BusinessRecordLocator) => T,
  ): T | undefined {
    return this.#locator === undefined ? undefined : consumer(this.#locator);
  }
}

function dependencyFailure(target: W6BusinessSelectorTarget): PrivateW6BusinessSelectorResolution {
  return new PrivateResolution(
    createEvidence(target, null, "projection_dependency_failure"),
  );
}

function validateProviderResult(value: unknown): readonly PrivateW6BusinessRecordLocator[] {
  const snapshot = snapshotDescriptorSafeJsonValue(value);
  if (!isJsonObject(snapshot)) throw new W6BusinessSelectorFailure("projection_dependency_failure");
  try {
    requireExactKeys(snapshot, PROVIDER_RESULT_KEYS);
  } catch {
    throw new W6BusinessSelectorFailure("projection_dependency_failure");
  }
  if (!Array.isArray(snapshot.matches) || snapshot.matches.length > 2) {
    throw new W6BusinessSelectorFailure("projection_dependency_failure");
  }
  return snapshot.matches.map((entry) => {
    if (!isJsonObject(entry)) throw new W6BusinessSelectorFailure("projection_dependency_failure");
    try {
      requireExactKeys(entry, PROVIDER_MATCH_KEYS);
    } catch {
      throw new W6BusinessSelectorFailure("projection_dependency_failure");
    }
    if (!isJsonObject(entry.locator) || Object.keys(entry.locator).length === 0) {
      throw new W6BusinessSelectorFailure("projection_dependency_failure");
    }
    return clonePlainFrozenJsonValue(entry.locator) as PrivateW6BusinessRecordLocator;
  });
}

export async function resolveW6BusinessSelector(
  request: W6BusinessSelectorRequest,
  provider: W6BusinessSelectorProvider,
): Promise<PrivateW6BusinessSelectorResolution> {
  const trustedRequest = snapshotRequest(request);
  const query = Object.freeze({
    target: trustedRequest.target,
    field: fieldFor(trustedRequest.target),
    value: trustedRequest.business_id,
    limit: 2 as const,
  });

  let matches: readonly PrivateW6BusinessRecordLocator[];
  try {
    const providerResult = await provider.findByBusinessKey(query);
    matches = validateProviderResult(providerResult);
  } catch {
    return dependencyFailure(trustedRequest.target);
  }

  if (matches.length !== 1) {
    const matchCount = matches.length as 0 | 2;
    return new PrivateResolution(
      createEvidence(trustedRequest.target, matchCount, "projection_conflict"),
    );
  }
  return new PrivateResolution(
    createEvidence(trustedRequest.target, 1, "exact_single_match"),
    matches[0],
  );
}
