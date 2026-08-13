import assert from "node:assert/strict";
import test from "node:test";

import {
  importBuilt,
  MemoryAuditSink,
  n2Candidate,
  n5SameEventCandidate,
  sampleIngestRequest,
  SequenceIds,
  scriptedN1Candidate,
  scriptedN3Candidate,
} from "./_runtime.mjs";

const clock = {
  source: "test",
  now: () => new Date("2026-08-01T02:00:00.000Z"),
};

async function makeRunner({ scripts, audit, ids }) {
  const { AuditedAiNodeRunner, ScriptedAiNodeInvoker } = await importBuilt("src/neoloop/ai/index.js");
  const invoker = new ScriptedAiNodeInvoker({ data_scope: "synthetic_experiment", scripts });
  const runner = new AuditedAiNodeRunner({
    invoker,
    audit,
    clock,
    ids,
    data_scope: "synthetic_experiment",
  });
  return { invoker, runner };
}

async function createCase({ request, repository, audit, ids }) {
  const { runW1, runW2 } = await importBuilt("src/neoloop/workflows/index.js");
  const w1 = await runW1(request, { clock, ids, repository, audit });
  const { runner } = await makeRunner({
    audit,
    ids,
    scripts: {
      N1: [{ kind: "return", value: scriptedN1Candidate(request.original_text) }],
      N2: [{ kind: "return", value: n2Candidate() }],
      N3: [{ kind: "return", value: scriptedN3Candidate(request.original_text) }],
    },
  });
  const w2 = await runW2(w1.object_ref.object_id, {
    clock,
    ids,
    repository,
    audit,
    ai_runner: runner,
  });
  return w2.output.case;
}

test("W6 same-event mode stores only an evidence-backed candidate and stops for human confirmation", async () => {
  const { InMemoryFrontHalfRepository, runW6SameEvent } = await importBuilt("src/neoloop/workflows/index.js");
  const repository = new InMemoryFrontHalfRepository();
  const audit = new MemoryAuditSink();
  const ids = new SequenceIds();
  const first = await createCase({ request: sampleIngestRequest(), repository, audit, ids });
  const second = await createCase({
    request: sampleIngestRequest({
      idempotency_key: "competition-synthetic:service-log:SYN-SOURCE-018",
      source_record_id: "SYN-SOURCE-018",
      channel: "service-log",
      original_text: "A 站交接时货舱门按键操作两次均未响应，配送任务因此延迟。",
    }),
    repository,
    audit,
    ids,
  });
  const feedbackLinksBefore = [...repository.caseByFeedbackId.entries()];
  const casesBefore = structuredClone([...repository.casesById.entries()]);
  const statusesBefore = [...repository.casesById.values()].map((record) => [record.case_id, record.status]);
  const { validateNodeCandidate } = await importBuilt("src/neoloop/ai/index.js");
  const comparisonInput = {
    case_facts: {
      current: { case_id: second.case_id, facts: [second.summary] },
      candidates: [{ case_id: first.case_id, facts: [first.summary] }],
    },
    time: {
      current: { case_id: second.case_id, occurred_at: "2026-08-01T02:00:00.000Z" },
      candidates: [{ case_id: first.case_id, occurred_at: "2025-01-01T02:00:00.000Z" }],
    },
    confirmed_entities: {
      current: { case_id: second.case_id, formal_entity: null },
      candidates: [{ case_id: first.case_id, formal_entity: null }],
    },
    source_reference: {
      current: { case_id: second.case_id, source_ref: second.source_locator },
      candidates: [{ case_id: first.case_id, source_ref: first.source_locator }],
    },
  };
  const n5Request = {
    node: "N5",
    mode: "same_event_duplicate",
    version: "N5-same-event-1.0.0-draft.2",
    object_ref: { object_type: "case", object_id: second.case_id },
    input: comparisonInput,
  };
  const evidenceBackedCandidate = n5SameEventCandidate(first.case_id, {
    current_source_ref: second.source_locator,
    source_ref: first.source_locator,
    current_quote: second.summary,
    quote: first.summary,
  });
  assert.deepEqual(validateNodeCandidate(n5Request, evidenceBackedCandidate), { valid: true, errors: [] });

  const nullWithEvidence = validateNodeCandidate(
    n5Request,
    n5SameEventCandidate(null, {
      candidate: {
        evidence_spans: [{ source_ref: second.source_locator, quote: second.summary }],
      },
    }),
  );
  assert.equal(nullWithEvidence.valid, false);
  assert.ok(nullWithEvidence.errors.some((error) => error.includes("without a duplicate candidate")));

  const sameSourceInput = structuredClone(comparisonInput);
  sameSourceInput.source_reference.current.source_ref = "SYN-SHARED-SOURCE";
  sameSourceInput.source_reference.candidates[0].source_ref = "SYN-SHARED-SOURCE";
  const sameSourceResult = validateNodeCandidate(
    { ...n5Request, input: sameSourceInput },
    n5SameEventCandidate(first.case_id, {
      current_source_ref: "SYN-SHARED-SOURCE",
      source_ref: "SYN-SHARED-SOURCE",
      current_quote: second.summary,
      quote: first.summary,
    }),
  );
  assert.equal(sameSourceResult.valid, false);
  assert.ok(sameSourceResult.errors.some((error) => error.includes("distinct current and candidate")));

  const { invoker, runner } = await makeRunner({
    audit,
    ids,
    scripts: {
      N5: [
        {
          kind: "return",
          value: n5SameEventCandidate(first.case_id, {
            candidate: {
              evidence_spans: [
                { source_ref: second.source_locator, quote: second.summary },
                { source_ref: first.source_locator, quote: first.summary },
                { source_ref: "SYN-UNBOUND-SOURCE", quote: "未引用且未绑定的片段" },
              ],
            },
          }),
        },
        {
          kind: "return",
          value: evidenceBackedCandidate,
        },
      ],
    },
  });

  const result = await runW6SameEvent(second.case_id, {
    clock,
    ids,
    repository,
    audit,
    ai_runner: runner,
  });

  assert.equal(result.status, "needs_human");
  assert.equal(result.output.check.mode, "same_event_duplicate");
  assert.equal(result.output.check.candidate.candidate_case_id, first.case_id);
  assert.equal(result.output.check.review_state, "pending");
  assert.equal(result.output.check.automatic_merge, false);
  assert.equal(result.output.check.automatic_relink, false);
  assert.ok(result.output.check.evidence_spans.length > 0);
  assert.deepEqual(
    new Set(result.output.check.evidence_spans.map((span) => span.source_ref)),
    new Set([second.source_locator, first.source_locator]),
  );
  assert.deepEqual([...repository.caseByFeedbackId.entries()], feedbackLinksBefore);
  assert.deepEqual([...repository.casesById.entries()], casesBefore);
  assert.deepEqual([...repository.casesById.values()].map((record) => [record.case_id, record.status]), statusesBefore);
  assert.equal(typeof repository.mergeCases, "undefined");
  const n5Audits = audit.records
    .filter((record) => record.category === "ai" && record.payload.envelope.node === "N5")
    .map((record) => record.payload.envelope);
  assert.deepEqual(n5Audits.map((envelope) => envelope.status), ["error", "ok"]);
  assert.deepEqual(n5Audits.map((envelope) => envelope.retry_count), [0, 1]);
  assert.ok(n5Audits[0].validation.errors.some((error) => error.includes("not referenced")));

  const replay = await runW6SameEvent(second.case_id, {
    clock,
    ids,
    repository,
    audit,
    ai_runner: runner,
  });
  assert.equal(replay.status, "needs_human");
  assert.equal(replay.output.check.check_id, result.output.check.check_id);
  assert.equal(invoker.calls.length, 2);
});

test("front-half orchestrator executes W1-W2-W6 once and repeated input is fully idempotent", async () => {
  const { InMemoryFrontHalfRepository, runFrontHalf } = await importBuilt("src/neoloop/workflows/index.js");
  const request = sampleIngestRequest();
  const repository = new InMemoryFrontHalfRepository();
  const audit = new MemoryAuditSink();
  const ids = new SequenceIds();
  const { invoker, runner } = await makeRunner({
    audit,
    ids,
    scripts: {
      N1: [{ kind: "return", value: scriptedN1Candidate(request.original_text) }],
      N2: [{ kind: "return", value: n2Candidate() }],
      N3: [{ kind: "return", value: scriptedN3Candidate(request.original_text) }],
      N5: [{ kind: "return", value: n5SameEventCandidate(null) }],
    },
  });
  const ports = { clock, ids, repository, audit, ai_runner: runner };

  const first = await runFrontHalf(request, ports);
  const replay = await runFrontHalf(request, ports);

  assert.equal(first.status, "completed");
  assert.equal(replay.status, "idempotent");
  assert.deepEqual(first.stages.map((stage) => stage.phase), ["W1", "W2", "W6.same_event"]);
  assert.deepEqual(replay.stages.map((stage) => stage.phase), ["W1", "W2", "W6.same_event"]);
  assert.deepEqual(invoker.calls.map((call) => call.node), ["N1", "N2", "N3", "N5"]);
  assert.equal(repository.rawFeedbackByKey.size, 1);
  assert.equal(repository.casesById.size, 1);
  assert.equal(repository.sameEventChecksByCaseId.size, 1);
});

test("front-half orchestrator stops exactly at W1 or W2 failure and never advances", async () => {
  const { InMemoryFrontHalfRepository, runFrontHalf, runW1 } = await importBuilt("src/neoloop/workflows/index.js");

  {
    const request = sampleIngestRequest();
    const repository = new InMemoryFrontHalfRepository();
    const audit = new MemoryAuditSink();
    const ids = new SequenceIds();
    await runW1(request, { clock, ids, repository, audit });
    const snapshot = structuredClone([...repository.rawFeedbackByKey.entries()]);
    const { invoker, runner } = await makeRunner({ audit, ids, scripts: {} });
    const result = await runFrontHalf(
      sampleIngestRequest({ original_text: "同键的不同事件" }),
      { clock, ids, repository, audit, ai_runner: runner },
    );

    assert.equal(result.status, "failed");
    assert.equal(result.stopped_at, "W1");
    assert.deepEqual(result.stages.map((stage) => stage.phase), ["W1"]);
    assert.equal(invoker.calls.length, 0);
    assert.deepEqual([...repository.rawFeedbackByKey.entries()], snapshot);
  }

  {
    const request = sampleIngestRequest({
      idempotency_key: "competition-synthetic:synthetic-form:SYN-W2-FAIL",
      source_record_id: "SYN-W2-FAIL",
    });
    const repository = new InMemoryFrontHalfRepository();
    const audit = new MemoryAuditSink();
    const ids = new SequenceIds();
    const { invoker, runner } = await makeRunner({
      audit,
      ids,
      scripts: {
        N1: [{ kind: "return", value: scriptedN1Candidate(request.original_text) }],
        N2: [
          { kind: "return", value: { malformed: "first" } },
          { kind: "return", value: { malformed: "second" } },
        ],
        N3: [{ kind: "return", value: scriptedN3Candidate(request.original_text) }],
        N5: [{ kind: "return", value: n5SameEventCandidate(null) }],
      },
    });
    const result = await runFrontHalf(request, { clock, ids, repository, audit, ai_runner: runner });

    assert.equal(result.status, "needs_human");
    assert.equal(result.stopped_at, "W2");
    assert.deepEqual(result.stages.map((stage) => stage.phase), ["W1", "W2"]);
    assert.deepEqual(invoker.calls.map((call) => call.node), ["N1", "N2", "N2"]);
    assert.equal(repository.casesById.size, 0);
    assert.equal(repository.sameEventChecksByCaseId.size, 0);
    const feedback = [...repository.rawFeedbackByKey.values()][0];
    assert.equal(feedback.processing_status, "人工处理");
    assert.equal(feedback.request.original_text, request.original_text);
    assert.equal("sla_started_at" in feedback, false);
  }

  {
    const request = sampleIngestRequest({
      idempotency_key: "competition-synthetic:synthetic-form:SYN-W6-FAIL",
      source_record_id: "SYN-W6-FAIL",
    });
    const repository = new InMemoryFrontHalfRepository();
    const audit = new MemoryAuditSink();
    const ids = new SequenceIds();
    const { invoker, runner } = await makeRunner({
      audit,
      ids,
      scripts: {
        N1: [{ kind: "return", value: scriptedN1Candidate(request.original_text) }],
        N2: [{ kind: "return", value: n2Candidate() }],
        N3: [{ kind: "return", value: scriptedN3Candidate(request.original_text) }],
        N5: [{ kind: "throw", error: "synthetic N5 upstream unavailable" }],
      },
    });
    const ports = { clock, ids, repository, audit, ai_runner: runner };
    const first = await runFrontHalf(request, ports);
    const caseSnapshot = structuredClone([...repository.casesById.entries()]);
    const replay = await runFrontHalf(request, ports);

    assert.equal(first.status, "needs_human");
    assert.equal(first.stopped_at, "W6.same_event");
    assert.equal(replay.status, "needs_human");
    assert.equal(replay.stopped_at, "W6.same_event");
    assert.deepEqual(replay.stages.map((entry) => entry.phase), ["W1", "W2", "W6.same_event"]);
    assert.deepEqual(invoker.calls.map((call) => call.node), ["N1", "N2", "N3", "N5"]);
    assert.deepEqual([...repository.casesById.entries()], caseSnapshot);
    assert.equal(repository.sameEventChecksByCaseId.size, 1);
    assert.equal([...repository.sameEventChecksByCaseId.values()][0].review_state, "pending");
    assert.equal(
      audit.records.filter((record) => record.category === "workflow" && record.payload.workflow === "W6").length,
      2,
    );
    assert.equal(
      audit.records.filter((record) => record.category === "ai" && record.payload.envelope.node === "N5").length,
      1,
    );
  }

  {
    const request = sampleIngestRequest({
      idempotency_key: "competition-synthetic:synthetic-form:SYN-W6-REPOSITORY-FAIL",
      source_record_id: "SYN-W6-REPOSITORY-FAIL",
    });
    const repository = new InMemoryFrontHalfRepository();
    repository.listCases = async () => {
      throw new Error("synthetic W6 repository unavailable");
    };
    const audit = new MemoryAuditSink();
    const ids = new SequenceIds();
    const { invoker, runner } = await makeRunner({
      audit,
      ids,
      scripts: {
        N1: [{ kind: "return", value: scriptedN1Candidate(request.original_text) }],
        N2: [{ kind: "return", value: n2Candidate() }],
        N3: [{ kind: "return", value: scriptedN3Candidate(request.original_text) }],
        N5: [{ kind: "return", value: n5SameEventCandidate(null) }],
      },
    });
    const result = await runFrontHalf(request, { clock, ids, repository, audit, ai_runner: runner });

    assert.equal(result.status, "failed");
    assert.equal(result.stopped_at, "W6.same_event");
    assert.deepEqual(result.stages.map((entry) => entry.phase), ["W1", "W2", "W6.same_event"]);
    assert.deepEqual(invoker.calls.map((call) => call.node), ["N1", "N2", "N3"]);
    assert.equal(repository.casesById.size, 1);
    assert.equal(repository.sameEventChecksByCaseId.size, 0);
    const feedback = [...repository.rawFeedbackByKey.values()][0];
    assert.equal(feedback.processing_status, "已建案");
    const w6Audit = audit.records.find(
      (record) => record.category === "workflow" && record.payload.workflow === "W6",
    );
    assert.equal(w6Audit.payload.result.status, "failed");
    assert.match(w6Audit.payload.result.errors[0], /synthetic W6 repository unavailable/);
  }
});
