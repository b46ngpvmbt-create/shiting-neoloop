import assert from "node:assert/strict";
import test from "node:test";

import { importBuilt } from "./_runtime.mjs";

const {
  W6BusinessSelectorFailure,
  resolveW6BusinessSelector,
} = await importBuilt("src/neoloop/adapters/feishu/w6-business-selector-resolver.js");

const CLUSTER_ID = "SYN-CLUSTER-RESOLVER-001";
const IMPROVEMENT_ID = "SYN-IMPROVEMENT-RESOLVER-001";

function providerReturning(matches) {
  const calls = [];
  return {
    calls,
    provider: {
      async findByBusinessKey(query) {
        calls.push(query);
        return { matches };
      },
    },
  };
}

function assertEvidence(value, expected) {
  assert.deepEqual(Reflect.ownKeys(value).sort(), [
    "business_write_count",
    "classification",
    "match_count",
    "target",
  ]);
  assert.deepEqual(value, expected);
  assert.equal(Object.isFrozen(value), true);
}

function assertNoSensitivePublicMaterial(value, sentinels) {
  const serialized = JSON.stringify(value);
  for (const sentinel of sentinels) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
  for (const forbiddenKey of [
    "locator",
    "record_id",
    "base_id",
    "table_id",
    "app_id",
    "field_id",
    "provider",
    "message",
    "stack",
    "cause",
  ]) {
    assert.equal(serialized.includes(forbiddenKey), false, forbiddenKey);
  }
}

async function assertImprovementProjectionConflictFixture({
  data_scope,
  matches,
  matchCount,
  privateSentinels,
}) {
  assert.equal(data_scope, "synthetic_experiment");
  const harness = providerReturning(matches);
  const resolution = await resolveW6BusinessSelector(
    { target: "improvements", business_id: IMPROVEMENT_ID },
    harness.provider,
  );
  let executorCalls = 0;
  let consumedLocator;

  const consumerResult = resolution.consumePrivateLocator((locator) => {
    executorCalls += 1;
    consumedLocator = locator;
    return "unexpected-consumer-result";
  });

  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.calls[0], {
    target: "improvements",
    field: "improvement_id",
    value: IMPROVEMENT_ID,
    limit: 2,
  });
  assert.equal("record_id" in harness.calls[0], false);
  assert.equal(consumerResult, undefined);
  assert.equal(executorCalls, 0);
  assert.equal(consumedLocator, undefined);
  assert.deepEqual(Reflect.ownKeys(resolution), ["evidence"]);
  assertEvidence(resolution.evidence, {
    target: "improvements",
    match_count: matchCount,
    classification: "projection_conflict",
    business_write_count: 0,
  });
  assertNoSensitivePublicMaterial(resolution, privateSentinels);
}

test("selector resolver maps both business targets to exact field queries capped at two", async () => {
  for (const [target, businessId, field] of [
    ["clusters", CLUSTER_ID, "cluster_id"],
    ["improvements", IMPROVEMENT_ID, "improvement_id"],
  ]) {
    const privateLocator = {
      provider_record_token: `PRIVATE-${target}-RECORD`,
      nested: { revision: `PRIVATE-${target}-REVISION` },
    };
    const harness = providerReturning([{ locator: privateLocator }]);

    const resolution = await resolveW6BusinessSelector(
      { target, business_id: businessId },
      harness.provider,
    );

    assert.equal(harness.calls.length, 1);
    assert.deepEqual(Reflect.ownKeys(harness.calls[0]).sort(), ["field", "limit", "target", "value"]);
    assert.deepEqual(harness.calls[0], { target, field, value: businessId, limit: 2 });
    assert.equal("record_id" in harness.calls[0], false);
    assert.equal("business_id" in harness.calls[0], false);

    assertEvidence(resolution.evidence, {
      target,
      match_count: 1,
      classification: "exact_single_match",
      business_write_count: 0,
    });
    assert.deepEqual(Reflect.ownKeys(resolution), ["evidence"]);
    assertNoSensitivePublicMaterial(resolution, [
      privateLocator.provider_record_token,
      privateLocator.nested.revision,
    ]);

    let consumed;
    const callbackResult = resolution.consumePrivateLocator((locator) => {
      consumed = locator;
      return "consumed";
    });
    assert.equal(callbackResult, "consumed");
    assert.deepEqual(consumed, privateLocator);
    assert.notEqual(consumed, privateLocator);
    assert.equal(Object.isFrozen(consumed), true);
    assert.equal(Object.isFrozen(consumed.nested), true);

    privateLocator.nested.revision = "MUTATED-AFTER-RESOLVE";
    assert.equal(consumed.nested.revision, `PRIVATE-${target}-REVISION`);
  }
});

test("zero and multiple matches close as projection_conflict without private downstream calls", async () => {
  for (const [matches, matchCount] of [
    [[], 0],
    [
      [
        { locator: { private_record: "PRIVATE-RECORD-A" } },
        { locator: { private_record: "PRIVATE-RECORD-B" } },
      ],
      2,
    ],
  ]) {
    const harness = providerReturning(matches);
    const resolution = await resolveW6BusinessSelector(
      { target: "clusters", business_id: CLUSTER_ID },
      harness.provider,
    );
    let downstreamCalls = 0;

    const consumed = resolution.consumePrivateLocator(() => {
      downstreamCalls += 1;
    });

    assert.equal(consumed, undefined);
    assert.equal(downstreamCalls, 0);
    assert.equal(harness.calls.length, 1);
    assertEvidence(resolution.evidence, {
      target: "clusters",
      match_count: matchCount,
      classification: "projection_conflict",
      business_write_count: 0,
    });
    assertNoSensitivePublicMaterial(resolution, ["PRIVATE-RECORD-A", "PRIVATE-RECORD-B"]);
  }
});

test("improvements zero match closes as a synthetic projection_conflict with no private executor call", async () => {
  await assertImprovementProjectionConflictFixture({
    data_scope: "synthetic_experiment",
    matches: [],
    matchCount: 0,
    privateSentinels: [],
  });
});

test("improvements multiple matches close as a synthetic projection_conflict without leaking private provider material", async () => {
  const privateSentinels = [
    "PRIVATE-IMPROVEMENT-RECORD-A",
    "PRIVATE-IMPROVEMENT-RECORD-B",
    "PRIVATE-IMPROVEMENT-PROVIDER-RAW-A",
    "PRIVATE-IMPROVEMENT-PROVIDER-RAW-B",
  ];

  await assertImprovementProjectionConflictFixture({
    data_scope: "synthetic_experiment",
    matches: [
      {
        locator: {
          provider_record_token: privateSentinels[0],
          raw_provider_text: privateSentinels[2],
        },
      },
      {
        locator: {
          provider_record_token: privateSentinels[1],
          raw_provider_text: privateSentinels[3],
        },
      },
    ],
    matchCount: 2,
    privateSentinels,
  });
});

test("provider exceptions normalize to projection_dependency_failure without leaking raw errors", async () => {
  for (const failure of [
    new Error("PRIVATE-PROVIDER-MESSAGE"),
    Object.assign(new Error("PRIVATE-PROVIDER-STACK"), { cause: "PRIVATE-PROVIDER-CAUSE" }),
  ]) {
    let providerCalls = 0;
    const resolution = await resolveW6BusinessSelector(
      { target: "improvements", business_id: IMPROVEMENT_ID },
      {
        async findByBusinessKey() {
          providerCalls += 1;
          throw failure;
        },
      },
    );
    let downstreamCalls = 0;

    resolution.consumePrivateLocator(() => {
      downstreamCalls += 1;
    });

    assert.equal(providerCalls, 1);
    assert.equal(downstreamCalls, 0);
    assertEvidence(resolution.evidence, {
      target: "improvements",
      match_count: null,
      classification: "projection_dependency_failure",
      business_write_count: 0,
    });
    assertNoSensitivePublicMaterial(resolution, [
      "PRIVATE-PROVIDER-MESSAGE",
      "PRIVATE-PROVIDER-STACK",
      "PRIVATE-PROVIDER-CAUSE",
    ]);
  }
});

test("malformed provider results fail as dependencies without reading accessors or releasing locators", async () => {
  let getterCalls = 0;
  let locatorGetterCalls = 0;
  let locatorProxyTrapCalls = 0;
  const accessorResult = {};
  Object.defineProperty(accessorResult, "matches", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [{ locator: { private_record: "PRIVATE-ACCESSOR-RECORD" } }];
    },
  });
  const accessorLocator = {};
  Object.defineProperty(accessorLocator, "record_id", {
    enumerable: true,
    get() {
      locatorGetterCalls += 1;
      return "PRIVATE-NESTED-ACCESSOR-RECORD";
    },
  });
  const proxyLocator = new Proxy(
    { record_id: "PRIVATE-NESTED-PROXY-RECORD" },
    {
      get() {
        locatorProxyTrapCalls += 1;
        throw new Error("PRIVATE-NESTED-PROXY-GET");
      },
      getOwnPropertyDescriptor() {
        locatorProxyTrapCalls += 1;
        throw new Error("PRIVATE-NESTED-PROXY-DESCRIPTOR");
      },
      ownKeys() {
        locatorProxyTrapCalls += 1;
        throw new Error("PRIVATE-NESTED-PROXY-KEYS");
      },
    },
  );
  const malformedResults = [
    null,
    {},
    { matches: [], extra: true },
    { matches: [null] },
    { matches: [{ locator: null, extra: true }] },
    { matches: [{ locator: { id: "A" } }, { locator: { id: "B" } }, { locator: { id: "C" } }] },
    { matches: [{ locator: accessorLocator }] },
    { matches: [{ locator: proxyLocator }] },
    accessorResult,
    new Proxy({ matches: [] }, {}),
  ];

  for (const providerResult of malformedResults) {
    let downstreamCalls = 0;
    const resolution = await resolveW6BusinessSelector(
      { target: "clusters", business_id: CLUSTER_ID },
      { async findByBusinessKey() { return providerResult; } },
    );

    resolution.consumePrivateLocator(() => {
      downstreamCalls += 1;
    });

    assert.equal(downstreamCalls, 0);
    assertEvidence(resolution.evidence, {
      target: "clusters",
      match_count: null,
      classification: "projection_dependency_failure",
      business_write_count: 0,
    });
  }
  assert.equal(getterCalls, 0);
  assert.equal(locatorGetterCalls, 0);
  assert.equal(locatorProxyTrapCalls, 0);
});

test("invalid requests fail before the provider and never reinterpret a business id as a record id", async () => {
  const inherited = Object.create({ target: "clusters" });
  inherited.business_id = CLUSTER_ID;
  const accessor = { target: "clusters" };
  Object.defineProperty(accessor, "business_id", {
    enumerable: true,
    get() {
      throw new Error("PRIVATE-REQUEST-GETTER");
    },
  });
  const withSymbol = { target: "clusters", business_id: CLUSTER_ID };
  withSymbol[Symbol("private")] = true;
  const invalidRequests = [
    null,
    { target: "cases", business_id: CLUSTER_ID },
    { target: "clusters", business_id: "" },
    { target: "clusters", business_id: " spaced " },
    { target: "clusters", business_id: CLUSTER_ID, record_id: CLUSTER_ID },
    inherited,
    accessor,
    withSymbol,
    new Proxy({ target: "clusters", business_id: CLUSTER_ID }, {}),
  ];

  for (const request of invalidRequests) {
    let providerCalls = 0;
    await assert.rejects(
      resolveW6BusinessSelector(request, {
        async findByBusinessKey() {
          providerCalls += 1;
          return { matches: [] };
        },
      }),
      (error) => {
        assert.equal(error instanceof W6BusinessSelectorFailure, true);
        assert.equal(error.error, "invalid_projection_input");
        assert.equal(String(error).includes("PRIVATE-REQUEST-GETTER"), false);
        return true;
      },
    );
    assert.equal(providerCalls, 0);
  }
});

test("private locator stays out of serialized public evidence and reaches only the explicit consumer", async () => {
  const locator = {
    base_id: "PRIVATE-BASE-ID",
    table_id: "PRIVATE-TABLE-ID",
    record_id: "PRIVATE-RECORD-ID",
    field_id: "PRIVATE-FIELD-ID",
  };
  const resolution = await resolveW6BusinessSelector(
    { target: "improvements", business_id: IMPROVEMENT_ID },
    providerReturning([{ locator }]).provider,
  );
  let downstreamCalls = 0;

  resolution.consumePrivateLocator((privateValue) => {
    downstreamCalls += 1;
    assert.deepEqual(privateValue, locator);
  });

  assert.equal(downstreamCalls, 1);
  assertNoSensitivePublicMaterial(resolution.evidence, Object.values(locator));
  assert.deepEqual(JSON.parse(JSON.stringify(resolution.evidence)), {
    target: "improvements",
    match_count: 1,
    classification: "exact_single_match",
    business_write_count: 0,
  });
});
