import assert from "node:assert/strict";
import test from "node:test";

import { importBuilt } from "./_runtime.mjs";

test("plain JSON snapshot is detached and canonical hashes ignore object key order", async () => {
  const { canonicalJsonSha256, snapshotPlainJsonData } = await importBuilt("src/neoloop/io/plain-json.js");
  const source = { z: [1, { b: true, a: null }], a: "value" };
  const result = snapshotPlainJsonData(source);

  assert.equal(result.ok, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.value)),
    { z: [1, { b: true, a: null }], a: "value" },
  );
  source.z[1].b = false;
  assert.equal(result.value.z[1].b, true);
  assert.equal(
    canonicalJsonSha256({ z: [1, { b: true, a: null }], a: "value" }),
    canonicalJsonSha256({ a: "value", z: [1, { a: null, b: true }] }),
  );
  assert.notEqual(canonicalJsonSha256({ a: 1 }), canonicalJsonSha256({ a: 2 }));
});

test("plain JSON snapshot rejects hostile values without invoking accessors", async () => {
  const { snapshotPlainJsonData } = await importBuilt("src/neoloop/io/plain-json.js");
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "secret", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "SENSITIVE_SENTINEL";
    },
  });
  const cyclic = {};
  cyclic.self = cyclic;
  const sparse = [];
  sparse[1] = "x";
  const custom = Object.create({ inherited: true });
  custom.value = 1;
  const symbol = { ok: true };
  symbol[Symbol("hidden")] = "SENSITIVE_SENTINEL";

  for (const value of [accessor, cyclic, sparse, custom, symbol, { value: Infinity }, { value: 1n }]) {
    const result = snapshotPlainJsonData(value);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error, /SENSITIVE_SENTINEL|secret|hidden/u);
  }
  assert.equal(getterCalls, 0);
});

test("plain JSON snapshot accepts null-prototype objects and rejects depth 17", async () => {
  const { snapshotPlainJsonData } = await importBuilt("src/neoloop/io/plain-json.js");
  const nullPrototype = Object.create(null);
  nullPrototype.value = "ok";
  assert.deepEqual(snapshotPlainJsonData(nullPrototype), {
    ok: true,
    value: Object.assign(Object.create(null), { value: "ok" }),
  });

  let deep = "leaf";
  for (let index = 0; index < 17; index += 1) deep = { deep };
  assert.equal(snapshotPlainJsonData(deep).ok, false);
});
