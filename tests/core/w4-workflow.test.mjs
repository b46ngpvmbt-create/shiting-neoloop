import assert from "node:assert/strict";
import test from "node:test";

import {
  importBuilt,
  MemoryAuditSink,
  SequenceIds,
} from "./_runtime.mjs";

function clone(value) {
  return structuredClone(value);
}

function sampleCase(overrides = {}) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    case_id: "SYN-CASE-R3-W4-001",
    status: "待派单",
    sla_started_at: "2026-08-04T01:01:00.000Z",
    sla_due_at: "2026-08-04T02:00:00.000Z",
    sla_rule_version: "synthetic-human-confirmed-v1",
    updated_at: "2026-08-04T01:01:00.000Z",
    ...overrides,
  };
}

function sampleWorkOrder(overrides = {}) {
  return {
    schema_version: "1.0.0-draft.2",
    data_scope: "synthetic_experiment",
    work_order_id: "SYN-WO-R3-W4-001",
    case_id: "SYN-CASE-R3-W4-001",
    team: "车辆运维",
    assignee_role: "合成角色：车辆运维-负责人",
    status: "待接单",
    accepted_at: null,
    first_response_target_minutes: 59,
    due_at: "2026-08-04T02:00:00.000Z",
    completed_at: null,
    escalation_level: "none",
    sla_reset_count: 0,
    updated_at: "2026-08-04T01:01:00.000Z",
    ...overrides,
  };
}

class WorkflowEventConflictError extends Error {
  constructor(eventId) {
    super(`Workflow event ${eventId} conflicts with different content`);
    this.name = "WorkflowEventConflictError";
  }
}

class W4MemoryRepository {
  cases = new Map();
  workOrders = new Map();
  events = new Map();
  compareAndSetCalls = 0;
  failReads = false;
  failCompareAndSet = false;
  workOrderTails = new Map();

  constructor(caseRecord = sampleCase(), workOrder = sampleWorkOrder()) {
    this.cases.set(caseRecord.case_id, clone(caseRecord));
    this.workOrders.set(workOrder.work_order_id, clone(workOrder));
  }

  async findCaseById(caseId) {
    if (this.failReads) throw new Error("synthetic W4 repository read failure");
    const record = this.cases.get(caseId);
    return record ? clone(record) : null;
  }

  async findWorkOrderById(workOrderId) {
    if (this.failReads) throw new Error("synthetic W4 repository read failure");
    const record = this.workOrders.get(workOrderId);
    return record ? clone(record) : null;
  }

  async runWorkflowEvent(eventId, fingerprint, operation) {
    const existing = this.events.get(eventId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new WorkflowEventConflictError(eventId);
      }
      return { replayed: true, result: clone(await existing.promise) };
    }

    let resolveEvent;
    const promise = new Promise((resolve) => {
      resolveEvent = resolve;
    });
    this.events.set(eventId, { fingerprint, promise });
    const result = await operation();
    resolveEvent(clone(result));
    return { replayed: false, result };
  }

  async compareAndSetCaseAndWorkOrder(input) {
    this.compareAndSetCalls += 1;
    if (this.failCompareAndSet) {
      throw new Error("synthetic W4 repository write failure");
    }
    const currentCase = this.cases.get(input.expected_case.case_id);
    const currentWorkOrder = this.workOrders.get(input.expected_work_order.work_order_id);
    if (
      JSON.stringify(currentCase) !== JSON.stringify(input.expected_case)
      || JSON.stringify(currentWorkOrder) !== JSON.stringify(input.expected_work_order)
    ) {
      return {
        updated: false,
        case: currentCase ? clone(currentCase) : null,
        work_order: currentWorkOrder ? clone(currentWorkOrder) : null,
      };
    }
    this.cases.set(input.next_case.case_id, clone(input.next_case));
    this.workOrders.set(input.next_work_order.work_order_id, clone(input.next_work_order));
    return {
      updated: true,
      case: clone(input.next_case),
      work_order: clone(input.next_work_order),
    };
  }

  async compareAndSetCaseAndWorkOrderWithEffect(input, effect) {
    this.compareAndSetCalls += 1;
    if (this.failCompareAndSet) {
      throw new Error("synthetic W4 repository write failure");
    }
    const currentCase = this.cases.get(input.expected_case.case_id);
    const currentWorkOrder = this.workOrders.get(input.expected_work_order.work_order_id);
    if (
      JSON.stringify(currentCase) !== JSON.stringify(input.expected_case)
      || JSON.stringify(currentWorkOrder) !== JSON.stringify(input.expected_work_order)
    ) {
      return {
        updated: false,
        case: currentCase ? clone(currentCase) : null,
        work_order: currentWorkOrder ? clone(currentWorkOrder) : null,
        effect_performed: false,
      };
    }
    await effect();
    const recheckedCase = this.cases.get(input.expected_case.case_id);
    const recheckedWorkOrder = this.workOrders.get(input.expected_work_order.work_order_id);
    if (!recheckedCase || !recheckedWorkOrder) {
      return {
        updated: false,
        case: recheckedCase ? clone(recheckedCase) : null,
        work_order: recheckedWorkOrder ? clone(recheckedWorkOrder) : null,
        effect_performed: true,
      };
    }
    if (
      JSON.stringify(recheckedCase) !== JSON.stringify(input.expected_case)
      || JSON.stringify(recheckedWorkOrder) !== JSON.stringify(input.expected_work_order)
    ) {
      return {
        updated: false,
        case: recheckedCase ? clone(recheckedCase) : null,
        work_order: recheckedWorkOrder ? clone(recheckedWorkOrder) : null,
        effect_performed: true,
      };
    }
    this.cases.set(input.next_case.case_id, clone(input.next_case));
    this.workOrders.set(input.next_work_order.work_order_id, clone(input.next_work_order));
    return {
      updated: true,
      case: clone(input.next_case),
      work_order: clone(input.next_work_order),
      effect_performed: true,
    };
  }

  async runWorkOrderExclusive(workOrderId, operation) {
    const previous = this.workOrderTails.get(workOrderId) ?? Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.workOrderTails.set(workOrderId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.workOrderTails.get(workOrderId) === tail) this.workOrderTails.delete(workOrderId);
    }
  }
}

class TestClock {
  source = "test";

  constructor(now = "2026-08-04T01:15:00.000Z") {
    this.current = new Date(now);
  }

  now() {
    return new Date(this.current);
  }

  set(now) {
    this.current = new Date(now);
  }
}

class FakeNotifier {
  calls = [];
  fail = false;
  onNotify = null;

  async notify(notification) {
    this.calls.push(clone(notification));
    if (this.fail) throw new Error("synthetic notifier unavailable");
    if (this.onNotify) await this.onNotify(clone(notification));
  }
}

class FakeW4ActionAuthorizer {
  calls = [];
  fail = false;

  async authorize(input) {
    this.calls.push(clone(input));
    if (this.fail) throw new Error("synthetic W4 authorization port unavailable");
    const humanAllowed =
      ["accept", "reassign"].includes(input.action)
      && input.actor.type === "authorized_human"
      && input.actor.actor_id === "SYN-HUMAN-W4-001"
      && input.actor.role === "合成角色：车辆运维值班";
    const workflowAllowed =
      ["remind", "escalate_overdue"].includes(input.action)
      && input.actor.type === "workflow"
      && input.actor.actor_id === "SYN-W4-SLA-COORDINATOR"
      && input.actor.role === "synthetic_sla_automation";
    return humanAllowed || workflowAllowed;
  }
}

async function harness(options = {}) {
  const { runW4 } = await importBuilt("src/neoloop/workflows/w4.js");
  const repository = options.repository ?? new W4MemoryRepository();
  const audit = new MemoryAuditSink();
  const ids = new SequenceIds();
  const clock = options.clock ?? new TestClock();
  const notifier = options.notifier ?? new FakeNotifier();
  const action_authorizer = options.action_authorizer ?? new FakeW4ActionAuthorizer();
  return {
    audit,
    clock,
    notifier,
    repository,
    action_authorizer,
    run: (command) => runW4(command, { repository, audit, ids, clock, notifier, action_authorizer }),
  };
}

function humanActor() {
  return {
    type: "authorized_human",
    actor_id: "SYN-HUMAN-W4-001",
    role: "合成角色：车辆运维值班",
  };
}

function workflowActor() {
  return {
    type: "workflow",
    actor_id: "SYN-W4-SLA-COORDINATOR",
    role: "synthetic_sla_automation",
  };
}

function acceptCommand(overrides = {}) {
  return {
    event_id: "SYN-W4-EVENT-ACCEPT-001",
    action: "accept",
    work_order_id: "SYN-WO-R3-W4-001",
    actor: humanActor(),
    ...overrides,
  };
}

test("W4 accept transitions case and work order once while preserving the confirmed SLA", async () => {
  const { action_authorizer, audit, repository, run } = await harness();
  const beforeCase = clone(repository.cases.get("SYN-CASE-R3-W4-001"));
  const beforeWorkOrder = clone(repository.workOrders.get("SYN-WO-R3-W4-001"));

  const invalidCommand = await run({
    ...acceptCommand(),
    event_id: "",
    work_order_id: "",
    action: "unknown_runtime_action",
  });
  assert.equal(invalidCommand.status, "failed");
  assert.equal(invalidCommand.output.error_class, "invalid_command");
  assert.equal(invalidCommand.output.action_authorization.state, "not_checked");
  assert.equal(action_authorizer.calls.length, 0);
  assert.equal(repository.events.size, 0);

  for (const invalidActionFields of [
    {
      ...acceptCommand(),
      event_id: "SYN-W4-INVALID-REASSIGN",
      action: "reassign",
      team: "",
      assignee_role: "",
    },
    {
      ...acceptCommand(),
      event_id: "SYN-W4-INVALID-REMINDER",
      action: "remind",
      message: "",
    },
    {
      ...acceptCommand(),
      event_id: "SYN-W4-INVALID-ESCALATION",
      action: "escalate_overdue",
      next_escalation_level: "",
      message: "",
    },
  ]) {
    const invalid = await run(invalidActionFields);
    assert.equal(invalid.status, "failed");
    assert.equal(invalid.output.error_class, "invalid_command");
    assert.equal(invalid.output.action_authorization.state, "not_checked");
  }
  assert.equal(action_authorizer.calls.length, 0);
  assert.equal(repository.events.size, 0);

  const selfAsserted = await run(acceptCommand({
    event_id: "SYN-W4-EVENT-UNAUTHORIZED",
    actor: { ...humanActor(), actor_id: "SYN-UNLISTED-CALLER" },
  }));
  assert.equal(selfAsserted.status, "failed");
  assert.equal(selfAsserted.output.error_class, "authorization_failure");
  assert.equal(repository.compareAndSetCalls, 0);

  const [first, concurrentReplay] = await Promise.all([
    run(acceptCommand()),
    run(acceptCommand()),
  ]);
  const sequentialReplay = await run(acceptCommand());

  assert.equal(first.status, "completed");
  assert.equal(concurrentReplay.status, "idempotent");
  assert.equal(sequentialReplay.status, "idempotent");
  assert.equal(repository.compareAndSetCalls, 1);
  const storedCase = repository.cases.get(beforeCase.case_id);
  const storedWorkOrder = repository.workOrders.get(beforeWorkOrder.work_order_id);
  assert.equal(storedCase.status, "处理中");
  assert.equal(storedWorkOrder.status, "处理中");
  assert.equal(storedWorkOrder.accepted_at, "2026-08-04T01:15:00.000Z");
  assert.equal(storedCase.sla_started_at, beforeCase.sla_started_at);
  assert.equal(storedCase.sla_due_at, beforeCase.sla_due_at);
  assert.equal(storedCase.sla_rule_version, beforeCase.sla_rule_version);
  assert.equal(storedWorkOrder.due_at, beforeWorkOrder.due_at);
  assert.equal(storedWorkOrder.first_response_target_minutes, beforeWorkOrder.first_response_target_minutes);
  assert.equal(storedWorkOrder.sla_reset_count, 0);
  assert.equal(
    audit.records.filter((record) => record.payload.workflow === "W4").length,
    8,
  );
  assert.ok(action_authorizer.calls.length >= 2);
});

test("W4 reassign changes only routing fields and rejects a conflicting event without overwriting", async () => {
  const acceptedAt = "2026-08-04T01:15:00.000Z";
  const repository = new W4MemoryRepository(
    sampleCase({ status: "处理中" }),
    sampleWorkOrder({ status: "处理中", accepted_at: acceptedAt }),
  );
  const { audit, run } = await harness({ repository });
  const beforeCase = clone(repository.cases.get("SYN-CASE-R3-W4-001"));
  const beforeWorkOrder = clone(repository.workOrders.get("SYN-WO-R3-W4-001"));
  const command = {
    event_id: "SYN-W4-EVENT-REASSIGN-001",
    action: "reassign",
    work_order_id: "SYN-WO-R3-W4-001",
    actor: humanActor(),
    team: "现场运维",
    assignee_role: "合成角色：现场运维-值班",
  };

  const first = await run(command);
  const replay = await run(command);
  const conflict = await run({ ...command, team: "产品" });

  assert.equal(first.status, "completed");
  assert.equal(replay.status, "idempotent");
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.output.error_class, "event_conflict");
  assert.equal(repository.compareAndSetCalls, 1);
  const storedCase = repository.cases.get(beforeCase.case_id);
  const storedWorkOrder = repository.workOrders.get(beforeWorkOrder.work_order_id);
  assert.equal(storedWorkOrder.team, "现场运维");
  assert.equal(storedWorkOrder.assignee_role, "合成角色：现场运维-值班");
  assert.equal(storedWorkOrder.status, beforeWorkOrder.status);
  assert.equal(storedWorkOrder.accepted_at, acceptedAt);
  assert.equal(storedWorkOrder.due_at, beforeWorkOrder.due_at);
  assert.equal(storedWorkOrder.sla_reset_count, beforeWorkOrder.sla_reset_count);
  assert.equal(storedCase.sla_started_at, beforeCase.sla_started_at);
  assert.equal(storedCase.sla_due_at, beforeCase.sla_due_at);
  assert.equal(storedCase.sla_rule_version, beforeCase.sla_rule_version);
  assert.equal(audit.records.at(-1).payload.result.output.error_class, "event_conflict");
});

test("W4 reminder is independently audited and same-event replay never sends twice or mutates state", async () => {
  const { audit, notifier, repository, run } = await harness();
  const beforeCases = clone([...repository.cases.entries()]);
  const beforeWorkOrders = clone([...repository.workOrders.entries()]);
  const command = {
    event_id: "SYN-W4-EVENT-REMINDER-001",
    action: "remind",
    work_order_id: "SYN-WO-R3-W4-001",
    actor: workflowActor(),
    message: "合成提醒：请人工查看待接单工单。",
  };

  const [first, replay] = await Promise.all([run(command), run(command)]);

  assert.equal(first.status, "completed");
  assert.equal(replay.status, "idempotent");
  assert.equal(notifier.calls.length, 1);
  assert.equal(notifier.calls[0].kind, "reminder");
  assert.equal(notifier.calls[0].object_ref.object_id, command.work_order_id);
  assert.deepEqual([...repository.cases.entries()], beforeCases);
  assert.deepEqual([...repository.workOrders.entries()], beforeWorkOrders);
  assert.equal(repository.compareAndSetCalls, 0);
  assert.deepEqual(first.output.notification, notifier.calls[0]);
  assert.equal(audit.records.filter((record) => record.payload.workflow === "W4").length, 2);
});

test("W4 overdue escalation is clock-driven, keeps status and every SLA anchor, and does not add a case state", async () => {
  const clock = new TestClock("2026-08-04T01:59:59.000Z");
  const { notifier, repository, run } = await harness({ clock });
  const beforeCase = clone(repository.cases.get("SYN-CASE-R3-W4-001"));
  const beforeWorkOrder = clone(repository.workOrders.get("SYN-WO-R3-W4-001"));
  const early = await run({
    event_id: "SYN-W4-EVENT-ESCALATE-EARLY",
    action: "escalate_overdue",
    work_order_id: beforeWorkOrder.work_order_id,
    actor: workflowActor(),
    next_escalation_level: "L1",
    message: "合成升级：SLA 已超时。",
  });
  assert.equal(early.status, "failed");
  assert.equal(early.output.error_class, "not_overdue");
  assert.equal(notifier.calls.length, 0);

  clock.set("2026-08-04T02:00:01.000Z");
  const skippedLevel = await run({
    event_id: "SYN-W4-EVENT-ESCALATE-SKIP",
    action: "escalate_overdue",
    work_order_id: beforeWorkOrder.work_order_id,
    actor: workflowActor(),
    next_escalation_level: "L2",
    message: "合成升级：不得跳级。",
  });
  assert.equal(skippedLevel.status, "failed");
  assert.equal(skippedLevel.output.error_class, "invalid_escalation_transition");
  assert.equal(notifier.calls.length, 0);

  const command = {
    event_id: "SYN-W4-EVENT-ESCALATE-001",
    action: "escalate_overdue",
    work_order_id: beforeWorkOrder.work_order_id,
    actor: workflowActor(),
    next_escalation_level: "L1",
    message: "合成升级：SLA 已超时。",
  };
  const competing = { ...command, event_id: "SYN-W4-EVENT-ESCALATE-COMPETING" };
  const [first, secondEvent] = await Promise.all([run(command), run(competing)]);
  const replay = await run(command);

  assert.equal(first.status, "completed");
  assert.equal(secondEvent.status, "failed");
  assert.equal(secondEvent.output.error_class, "invalid_escalation_transition");
  assert.equal(replay.status, "idempotent");
  assert.equal(notifier.calls.length, 1);
  assert.equal(notifier.calls[0].kind, "escalation");
  const storedCase = repository.cases.get(beforeCase.case_id);
  const storedWorkOrder = repository.workOrders.get(beforeWorkOrder.work_order_id);
  assert.equal(storedWorkOrder.escalation_level, "L1");
  assert.equal(storedWorkOrder.status, beforeWorkOrder.status);
  assert.equal(storedCase.status, beforeCase.status);
  assert.equal(storedCase.sla_started_at, beforeCase.sla_started_at);
  assert.equal(storedCase.sla_due_at, beforeCase.sla_due_at);
  assert.equal(storedCase.sla_rule_version, beforeCase.sla_rule_version);
  assert.equal(storedWorkOrder.due_at, beforeWorkOrder.due_at);
  assert.equal(storedWorkOrder.accepted_at, beforeWorkOrder.accepted_at);
  assert.equal(storedWorkOrder.first_response_target_minutes, beforeWorkOrder.first_response_target_minutes);
  assert.equal(storedWorkOrder.sla_reset_count, beforeWorkOrder.sla_reset_count);
  assert.ok(["待接单", "处理中", "待验证", "已完成", "已取消"].includes(storedWorkOrder.status));
  assert.ok(["待派单", "处理中"].includes(storedCase.status));

  for (const next_escalation_level of ["none", "L2", "L99"]) {
    const rejected = await run({
      ...command,
      event_id: `SYN-W4-EVENT-ESCALATE-REJECT-${next_escalation_level}`,
      next_escalation_level,
    });
    assert.equal(rejected.status, "failed", next_escalation_level);
    assert.equal(rejected.output.error_class, "invalid_escalation_transition", next_escalation_level);
  }
  assert.equal(notifier.calls.length, 1);
});

test("W4 notification failure is cached, audited, and preserves state and SLA without retrying the notifier", async () => {
  const notifier = new FakeNotifier();
  notifier.fail = true;
  const repository = new W4MemoryRepository();
  const beforeCases = clone([...repository.cases.entries()]);
  const beforeWorkOrders = clone([...repository.workOrders.entries()]);
  const command = {
    event_id: "SYN-W4-EVENT-NOTIFY-FAIL-001",
    action: "escalate_overdue",
    work_order_id: "SYN-WO-R3-W4-001",
    actor: workflowActor(),
    next_escalation_level: "L1",
    message: "合成升级：通知端口失败演练。",
  };
  const clock = new TestClock("2026-08-04T02:00:01.000Z");
  const ports = await harness({ notifier, repository, clock });

  const first = await ports.run(command);
  const replay = await ports.run(command);

  assert.equal(first.status, "failed");
  assert.equal(replay.status, "failed");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(first.output.error_class, "notification_failure");
  assert.equal(notifier.calls.length, 1);
  assert.deepEqual([...repository.cases.entries()], beforeCases);
  assert.deepEqual([...repository.workOrders.entries()], beforeWorkOrders);
  assert.equal(repository.compareAndSetCalls, 1);
  assert.equal(ports.audit.records[0].payload.result.output.error_class, "notification_failure");
});

test("W4 audits an acknowledged notifier effect truthfully when an external write wins the recheck", async () => {
  const repository = new W4MemoryRepository();
  const notifier = new FakeNotifier();
  notifier.onNotify = async () => {
    const current = repository.workOrders.get("SYN-WO-R3-W4-001");
    repository.workOrders.set(current.work_order_id, {
      ...current,
      team: "外部并发写入的合成团队",
      updated_at: "2026-08-04T02:00:00.500Z",
    });
  };
  const ports = await harness({
    repository,
    notifier,
    clock: new TestClock("2026-08-04T02:00:01.000Z"),
  });
  const command = {
    event_id: "SYN-W4-EVENT-DELIVERED-THEN-CONFLICT",
    action: "escalate_overdue",
    work_order_id: "SYN-WO-R3-W4-001",
    actor: workflowActor(),
    next_escalation_level: "L1",
    message: "合成升级：通知期间发生外部并发写入。",
  };

  const first = await ports.run(command);
  const replay = await ports.run(command);

  assert.equal(first.status, "failed");
  assert.equal(replay.status, "failed");
  assert.equal(replay.output.event_replayed, true);
  assert.equal(first.output.error_class, "concurrency_conflict_after_notification");
  assert.equal(first.output.notification_delivery, "acknowledged");
  assert.match(first.errors[0], /notifier acknowledged/);
  assert.doesNotMatch(first.errors[0], /not sent/);
  assert.equal(first.output.action_authorization.state, "authorized");
  assert.equal(notifier.calls.length, 1);
  assert.equal(repository.compareAndSetCalls, 1);
  assert.equal(repository.workOrders.get(command.work_order_id).team, "外部并发写入的合成团队");
  assert.equal(repository.workOrders.get(command.work_order_id).escalation_level, "none");
  const firstAudit = ports.audit.records[0].payload.result;
  assert.equal(firstAudit.output.notification_delivery, "acknowledged");
  assert.equal(firstAudit.output.error_class, "concurrency_conflict_after_notification");
  assert.doesNotMatch(firstAudit.errors[0], /not sent/);

  const deletedRepository = new W4MemoryRepository();
  const deletingNotifier = new FakeNotifier();
  deletingNotifier.onNotify = async () => {
    deletedRepository.workOrders.delete("SYN-WO-R3-W4-001");
  };
  const deleted = await harness({
    repository: deletedRepository,
    notifier: deletingNotifier,
    clock: new TestClock("2026-08-04T02:00:01.000Z"),
  });
  const deletedResult = await deleted.run({
    ...command,
    event_id: "SYN-W4-EVENT-ACKNOWLEDGED-THEN-DELETED",
  });
  assert.equal(deletedResult.status, "failed");
  assert.equal(deletedResult.output.error_class, "concurrency_conflict_after_notification");
  assert.equal(deletedResult.output.notification_delivery, "acknowledged");
  assert.match(deletedResult.errors[0], /notifier acknowledged/);
  assert.doesNotMatch(deletedResult.errors[0], /not sent/);
  assert.equal(deletingNotifier.calls.length, 1);
  assert.equal(deletedRepository.workOrders.has(command.work_order_id), false);
  assert.equal(deletedResult.output.work_order, null);
  assert.ok(deletedResult.actions.includes("work_order_snapshot_unavailable"));
  assert.equal(deletedResult.actions.includes("preserve_work_order_snapshot"), false);
});

test("W4 repository failure closes safely, preserves old records, and audits error_class", async () => {
  const repository = new W4MemoryRepository();
  repository.failCompareAndSet = true;
  const { audit, notifier, run } = await harness({ repository });
  const beforeCases = clone([...repository.cases.entries()]);
  const beforeWorkOrders = clone([...repository.workOrders.entries()]);

  const result = await run(acceptCommand({ event_id: "SYN-W4-EVENT-REPOSITORY-FAIL-001" }));

  assert.equal(result.status, "failed");
  assert.equal(result.output.error_class, "repository_failure");
  assert.match(result.errors[0], /synthetic W4 repository write failure/);
  assert.deepEqual([...repository.cases.entries()], beforeCases);
  assert.deepEqual([...repository.workOrders.entries()], beforeWorkOrders);
  assert.equal(notifier.calls.length, 0);
  assert.equal(audit.records.at(-1).payload.result.output.error_class, "repository_failure");

  const escalationRepository = new W4MemoryRepository();
  escalationRepository.failCompareAndSet = true;
  const escalation = await harness({
    repository: escalationRepository,
    clock: new TestClock("2026-08-04T02:00:01.000Z"),
  });
  const escalationBefore = clone([...escalationRepository.workOrders.entries()]);
  const escalationResult = await escalation.run({
    event_id: "SYN-W4-EVENT-ESCALATION-REPOSITORY-FAIL",
    action: "escalate_overdue",
    work_order_id: "SYN-WO-R3-W4-001",
    actor: workflowActor(),
    next_escalation_level: "L1",
    message: "合成升级：仓储预检失败演练。",
  });
  assert.equal(escalationResult.status, "failed");
  assert.equal(escalationResult.output.error_class, "repository_failure");
  assert.equal(escalation.notifier.calls.length, 0);
  assert.deepEqual([...escalationRepository.workOrders.entries()], escalationBefore);

  const failingAuthorizer = new FakeW4ActionAuthorizer();
  failingAuthorizer.fail = true;
  const authorization = await harness({ action_authorizer: failingAuthorizer });
  const authorizationFirst = await authorization.run(acceptCommand({
    event_id: "SYN-W4-EVENT-AUTHORIZATION-PORT-FAIL",
  }));
  const authorizationReplay = await authorization.run(acceptCommand({
    event_id: "SYN-W4-EVENT-AUTHORIZATION-PORT-FAIL",
  }));
  assert.equal(authorizationFirst.status, "failed");
  assert.equal(authorizationReplay.status, "failed");
  assert.equal(authorizationReplay.output.event_replayed, true);
  assert.equal(authorizationFirst.output.error_class, "authorization_port_failure");
  assert.equal(authorizationFirst.output.action_authorization.state, "indeterminate");
  assert.equal(authorizationFirst.output.action_authorization.authorized, false);
  assert.equal(failingAuthorizer.calls.length, 1);
  assert.equal(authorization.audit.records[0].payload.result.output.error_class, "authorization_port_failure");
});
