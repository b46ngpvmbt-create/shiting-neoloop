import { createHash } from "node:crypto";

import type { JsonValue } from "../contracts/model.js";

export const MAX_PLAIN_JSON_DEPTH = 16;

export type PlainJsonSnapshotResult =
  | { ok: true; value: JsonValue }
  | { ok: false; error: string };

class PlainJsonBoundaryError extends Error {}

function rejectPlainJson(reason: string): never {
  throw new PlainJsonBoundaryError(reason);
}

function enumerableDataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (!descriptor || descriptor.enumerable !== true) {
    return rejectPlainJson("only enumerable own string data properties are allowed");
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    return rejectPlainJson("accessor properties are not allowed");
  }
  return descriptor.value;
}

function snapshotPlainJsonValue(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): JsonValue {
  if (depth > MAX_PLAIN_JSON_DEPTH) return rejectPlainJson("maximum nesting depth exceeded");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return rejectPlainJson("non-finite numbers are not allowed");
    return value;
  }
  if (typeof value !== "object") {
    return rejectPlainJson("functions, symbols, bigint, and undefined are not allowed");
  }
  if (ancestors.has(value)) return rejectPlainJson("cyclic references are not allowed");

  let arrayValue: boolean;
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    arrayValue = Array.isArray(value);
    prototype = Object.getPrototypeOf(value) as object | null;
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return rejectPlainJson("descriptor inspection failed");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === "symbol")) {
    return rejectPlainJson("symbol properties are not allowed");
  }

  ancestors.add(value);
  try {
    if (arrayValue) {
      if (prototype !== Array.prototype) return rejectPlainJson("array prototype is not allowed");
      const lengthDescriptor = descriptors.length;
      if (
        !lengthDescriptor
        || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value")
        || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
      ) {
        return rejectPlainJson("array length descriptor is invalid");
      }
      const length = lengthDescriptor.value as number;
      if (keys.length !== length + 1) return rejectPlainJson("sparse arrays are not allowed");
      for (const key of keys) {
        if (key === "length") continue;
        if (
          typeof key !== "string"
          || !/^(?:0|[1-9]\d*)$/u.test(key)
          || !Number.isSafeInteger(Number(key))
          || Number(key) >= length
        ) {
          return rejectPlainJson("array contains a non-index property");
        }
      }
      const snapshot: JsonValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) return rejectPlainJson("sparse arrays are not allowed");
        snapshot.push(snapshotPlainJsonValue(enumerableDataValue(descriptor), depth + 1, ancestors));
      }
      return snapshot;
    }

    if (prototype !== Object.prototype && prototype !== null) {
      return rejectPlainJson("object prototype is not allowed");
    }
    const snapshot = Object.create(null) as Record<string, JsonValue>;
    for (const key of keys as string[]) {
      const entry = snapshotPlainJsonValue(enumerableDataValue(descriptors[key]), depth + 1, ancestors);
      Object.defineProperty(snapshot, key, {
        value: entry,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return snapshot;
  } finally {
    ancestors.delete(value);
  }
}

export function snapshotPlainJsonData(value: unknown): PlainJsonSnapshotResult {
  try {
    return { ok: true, value: snapshotPlainJsonValue(value, 0, new WeakSet<object>()) };
  } catch (error) {
    const reason = error instanceof PlainJsonBoundaryError ? error.message : "snapshot failed";
    return { ok: false, error: `candidate plain JSON boundary rejected: ${reason}` };
  }
}

export function canonicalizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)]),
    );
  }
  return value;
}

export function canonicalJsonSha256(
  value: JsonValue,
  domain = "neoloop:plain-json:v1",
): string {
  if (!/^[\x21-\x7e]{1,128}$/u.test(domain)) {
    throw new Error("canonical JSON hash domain is invalid");
  }
  return createHash("sha256")
    .update(domain)
    .update("\0")
    .update(JSON.stringify(canonicalizeJson(value)))
    .digest("hex");
}
