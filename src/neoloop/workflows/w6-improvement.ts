import type {
  AiNodeEnvelope,
  AuditRecord,
  ClockSource,
  EvidenceSpan,
  JsonValue,
  WorkflowResult,
} from "../contracts/model.js";
import type {
  AiNodeRunRequest,
  AiNodeRunner,
  AuditSink,
  Clock,
  IdGenerator,
} from "../contracts/ports.js";
import {
  AI_NODE_DEFINITIONS,
  type N5CrossEventPayload,
  type N6RootCauseHypothesis as N6RootCausePayloadHypothesis,
  type N6RootCausePayload,
} from "../ai/definitions.js";
import { createAiInputHash } from "../ai/runner.js";
import {
  validateNodeCandidate,
  validateNodeRequestDefinition,
} from "../ai/validation.js";
import { validateAiNodeEnvelope } from "../contracts/validation.js";
import { createWorkflowEventFingerprint } from "./event-idempotency.js";
import type {
  AuthorizedHumanActor,
  RuntimeImprovementProject,
  RuntimeProblemCluster,
  SameEventCheck,
  SameEventHumanResolution,
  W3AuthorizedPrincipal,
  W6AtomicTransition,
  W6ClosedCaseContext,
  W6CommitResult,
  W6History,
  W6RootCauseHypothesis,
} from "./model.js";
import {
  W6AuthorizationCapabilityError,
  W6TransitionFailure,
  WorkflowEventConflictError,
  createW6AuthorizationBinding,
  createW6N5ValidationFingerprint,
  createW6RecurrenceRequestAuthorizationBinding,
  snapshotW6AtomicTransition,
  type W6AiValidationGrant,
  type W6AiValidationGrantClaims,
  type W6AiValidationGrantIssueInput,
  type W6AuthorizationGrant,
  type W6AuthorizationGrantClaims,
  type W6ClusterCandidateInput,
  type W6ClusterCandidateResult,
  type W6RecurrenceReplayCandidate,
  type W6RecurrenceReplayQuery,
  type W6ResourceSet,
} from "./repository.js";

interface W6CreateClusterCandidateCommand {
  action: "create_cluster_candidate";
  event_id: string;
  case_ids: string[];
  cluster_id: string;
  name: string;
  category_domain: string;
}

interface W6ReviewCandidateCommand {
  action: "review_candidate";
  event_id: string;
  case_ids: string[];
  cluster_id: string;
  actor: AuthorizedHumanActor;
  decision: "submit_for_review" | "reject";
  reason: string;
}

interface W6StartImprovementCommand {
  action: "start_improvement";
  event_id: string;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  actor: AuthorizedHumanActor;
  improvement: {
    version: string;
    owner_role: string;
    measure: string;
    observation_window_days: [7, 30];
    clock_source: ClockSource;
    metric_formula: string;
  };
  reason: string;
}

interface W6ActiveObservationRecurrenceIntakeCommand {
  action: "intake_active_observation_recurrence";
  event_id: string;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  actor: AuthorizedHumanActor;
  cycle_id: string;
  triggering_case_ids: string[];
  reason: string;
}

interface W6EnterObservationCommand {
  action: "enter_observation";
  event_id: string;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  actor: AuthorizedHumanActor;
  reason: string;
}

interface W6ObservationCheckpointCommand {
  action: "record_day_7" | "record_day_30";
  event_id: string;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  cycle_id: string;
  related_task_volume: number | null;
}

interface W6ArchiveObservationCommand {
  action: "archive_observation";
  event_id: string;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  actor: AuthorizedHumanActor;
  cycle_id: string;
  human_conclusion: string;
  reason: string;
}

interface W6ReopenRecurrenceCommand {
  action: "reopen_recurrence";
  event_id: string;
  case_ids: string[];
  cluster_id: string;
  improvement_id: string;
  actor: AuthorizedHumanActor;
  triggering_case_ids: string[];
  reason: string;
}

export type W6ImprovementCommand =
  | W6CreateClusterCandidateCommand
  | W6ReviewCandidateCommand
  | W6StartImprovementCommand
  | W6ActiveObservationRecurrenceIntakeCommand
  | W6EnterObservationCommand
  | W6ObservationCheckpointCommand
  | W6ArchiveObservationCommand
  | W6ReopenRecurrenceCommand;

export interface W6AuthorizationDecision {
  allowed: true;
  principal: W3AuthorizedPrincipal;
  policy_version: string;
  grant: W6AuthorizationGrant;
}

export interface W6AuthorizationDenial {
  allowed: false;
  reason: string;
}

export interface W6ActionAuthorizer {
  authorize(input: {
    event_id: string;
    actor: AuthorizedHumanActor;
    action:
      | "review_candidate"
      | "start_improvement"
      | "enter_observation"
      | "archive_observation"
      | "reopen_recurrence"
      | "intake_active_observation_recurrence";
    phase: "cluster_review" | "improvement" | "observation" | "recurrence";
    object_ref: { object_type: "cluster"; object_id: string };
    case_ids: string[];
    improvement_id: string | null;
    transition: JsonValue;
    target_fingerprint: string;
    command_fingerprint: string;
  }): Promise<W6AuthorizationDecision | W6AuthorizationDenial>;
}

export interface W6HypothesisCatalogProvider {
  getCatalog(input: {
    node: "N6";
    mode: "root_cause_hypothesis";
    version: "N6-root-cause-1.0.0-draft.3";
    object_ref: { object_type: "cluster"; object_id: string };
    member_case_ids: string[];
  }): Promise<unknown>;
}

export interface W6ImprovementRepository {
  getW6ClosedCaseContext(caseId: string): Promise<W6ClosedCaseContext>;
  findSameEventCheckByCaseId(caseId: string): Promise<SameEventCheck | null>;
  findSameEventResolutionByCaseId(caseId: string): Promise<SameEventHumanResolution | null>;
  findW6ClusterById(clusterId: string): Promise<RuntimeProblemCluster | null>;
  listW6Clusters(): Promise<RuntimeProblemCluster[]>;
  findW6ImprovementById(improvementId: string): Promise<RuntimeImprovementProject | null>;
  getW6History(clusterId: string): Promise<W6History>;
  createW6ClusterCandidateIfAbsent(input: W6ClusterCandidateInput): Promise<W6ClusterCandidateResult>;
  commitW6Transition(input: W6AtomicTransition): Promise<W6CommitResult>;
  commitW6RecurrenceTransition(
    input: Extract<W6AtomicTransition, { action: "reopen_recurrence" }>,
    stableSemanticFingerprint: string,
  ): Promise<W6CommitResult>;
  findW6RecurrenceReplayCandidate(
    input: W6RecurrenceReplayQuery,
  ): Promise<W6RecurrenceReplayCandidate>;
  resolveAuthorizedW6RecurrenceReplay(
    input: W6RecurrenceReplayQuery & {
      target_fingerprint: string;
      private_proof_fingerprint: string;
    },
  ): Promise<W6CommitResult>;
  runAuthorizedW6Action<T>(
    input: { grant: W6AuthorizationGrant; claims: W6AuthorizationGrantClaims },
    operation: (authorization: W6AuthorizationGrantClaims) => Promise<T>,
  ): Promise<T>;
  validateAndIssueW6AiAction(input: W6AiValidationGrantIssueInput): {
    grant: W6AiValidationGrant;
    claims: W6AiValidationGrantClaims;
  };
  runValidatedW6AiAction<T>(
    input: { grant: W6AiValidationGrant; claims: W6AiValidationGrantClaims },
    operation: (validation: W6AiValidationGrantClaims) => Promise<T>,
  ): Promise<T>;
  runW6ResourcesExclusive<T>(resources: W6ResourceSet, operation: () => Promise<T>): Promise<T>;
  runWorkflowEvent(
    eventId: string,
    fingerprint: string,
    operation: () => Promise<WorkflowResult<JsonValue>>,
  ): Promise<{ replayed: boolean; result: WorkflowResult<JsonValue> }>;
  runWorkflowAuditExclusive<T>(eventId: string, operation: () => Promise<T>): Promise<T>;
}

export interface W6ImprovementPorts {
  clock: Clock;
  ids: IdGenerator;
  repository: W6ImprovementRepository;
  audit: AuditSink;
  ai_runner: AiNodeRunner;
  action_authorizer: W6ActionAuthorizer;
  hypothesis_catalog_provider: W6HypothesisCatalogProvider;
}

type W6ImprovementErrorClass =
  | "none"
  | "invalid_command"
  | "event_conflict"
  | "record_not_found"
  | "invalid_state"
  | "w5_closure_provenance_failure"
  | "n5_failure"
  | "n6_failure"
  | "recurrence_intake_failure"
  | "hypothesis_catalog_failure"
  | "authorization_failure"
  | "authorization_port_failure"
  | "authorization_capability_invalid"
  | "concurrency_conflict"
  | "repository_failure";

const W6_IMPLEMENTED_ACTIONS = [
  "create_cluster_candidate",
  "review_candidate",
  "start_improvement",
  "enter_observation",
  "record_day_7",
  "record_day_30",
  "intake_active_observation_recurrence",
  "archive_observation",
  "reopen_recurrence",
] as const;
const W6_OBSERVATION_BATCH_D_ACTIONS = [
  "enter_observation",
  "record_day_7",
  "record_day_30",
  "intake_active_observation_recurrence",
] as const;
const W6_OBSERVATION_BATCH_E_ACTIONS = [
  "archive_observation",
  "reopen_recurrence",
] as const;
const MAX_PLAIN_JSON_DEPTH = 24;

class W6ImprovementBoundaryError extends Error {}
class W6ObservationStateError extends Error {}

function isObservationBatchDAction(action: W6ImprovementCommand["action"]): boolean {
  return (W6_OBSERVATION_BATCH_D_ACTIONS as readonly string[]).includes(action);
}

function isObservationBatchEAction(action: W6ImprovementCommand["action"]): boolean {
  return (W6_OBSERVATION_BATCH_E_ACTIONS as readonly string[]).includes(action);
}

function rejectBoundary(reason: string): never {
  throw new W6ImprovementBoundaryError(reason);
}

function descriptorValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (!descriptor || descriptor.enumerable !== true) {
    return rejectBoundary("only enumerable own string data properties are allowed");
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    return rejectBoundary("accessor properties are not allowed");
  }
  return descriptor.value;
}

function snapshotPlainJsonValue(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): JsonValue {
  if (depth > MAX_PLAIN_JSON_DEPTH) return rejectBoundary("maximum nesting depth exceeded");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return rejectBoundary("non-finite numbers are not allowed");
    return value;
  }
  if (typeof value !== "object") {
    return rejectBoundary("functions, symbols, bigint, and undefined are not allowed");
  }
  if (ancestors.has(value)) return rejectBoundary("cyclic references are not allowed");

  let arrayValue: boolean;
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    arrayValue = Array.isArray(value);
    prototype = Object.getPrototypeOf(value) as object | null;
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return rejectBoundary("descriptor inspection failed");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === "symbol")) {
    return rejectBoundary("symbol properties are not allowed");
  }

  ancestors.add(value);
  try {
    if (arrayValue) {
      if (prototype !== Array.prototype) return rejectBoundary("array prototype is not allowed");
      const lengthDescriptor = descriptors.length;
      if (
        !lengthDescriptor ||
        !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0
      ) {
        return rejectBoundary("array length descriptor is invalid");
      }
      const length = lengthDescriptor.value as number;
      if (keys.length !== length + 1) {
        return rejectBoundary("sparse arrays and non-index array properties are not allowed");
      }
      const snapshot: JsonValue[] = [];
      for (const key of keys) {
        if (key === "length") continue;
        if (
          typeof key !== "string" ||
          !/^(?:0|[1-9]\d*)$/u.test(key) ||
          !Number.isSafeInteger(Number(key)) ||
          Number(key) >= length
        ) {
          return rejectBoundary("array contains a non-index property");
        }
      }
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) return rejectBoundary("sparse arrays are not allowed");
        snapshot.push(snapshotPlainJsonValue(descriptorValue(descriptor), depth + 1, ancestors));
      }
      return snapshot;
    }

    if (prototype !== Object.prototype && prototype !== null) {
      return rejectBoundary("object prototype and inherited properties are not allowed");
    }
    const snapshot = Object.create(null) as Record<string, JsonValue>;
    for (const key of keys as string[]) {
      Object.defineProperty(snapshot, key, {
        value: snapshotPlainJsonValue(descriptorValue(descriptors[key]), depth + 1, ancestors),
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

function snapshotPlainJson(value: unknown, label: string): JsonValue {
  try {
    return snapshotPlainJsonValue(value, 0, new WeakSet<object>());
  } catch (error) {
    const reason = error instanceof W6ImprovementBoundaryError ? error.message : "snapshot failed";
    throw new W6ImprovementBoundaryError(`${label} plain JSON boundary rejected: ${reason}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function haveExactDescriptorKeys(
  descriptors: PropertyDescriptorMap,
  keys: readonly (string | symbol)[],
  expected: readonly string[],
): boolean {
  if (keys.some((key) => typeof key !== "string")) return false;
  const actual = (keys as string[]).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || !actual.every((key, index) => key === sortedExpected[index])) {
    return false;
  }
  return actual.every((key) => {
    const descriptor = descriptors[key];
    return descriptor !== undefined &&
      descriptor.enumerable === true &&
      Object.prototype.hasOwnProperty.call(descriptor, "value");
  });
}

function isNonEmptyString(value: unknown, maximum = 512): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    [...value].length <= maximum &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function isSortedUniqueStrings(value: unknown, minimum = 1): value is string[] {
  return Array.isArray(value) &&
    value.length >= minimum &&
    value.every((entry) => isNonEmptyString(entry, 160)) &&
    value.every((entry, index) => index === 0 || value[index - 1].localeCompare(entry) < 0);
}

function isHumanActor(value: unknown): value is AuthorizedHumanActor {
  return isObject(value) &&
    hasExactKeys(value, ["type", "actor_id", "role"]) &&
    value.type === "authorized_human" &&
    isNonEmptyString(value.actor_id, 160) &&
    isNonEmptyString(value.role, 160);
}

function validateCommandSnapshot(value: JsonValue): W6ImprovementCommand {
  if (!isObject(value)) throw new W6ImprovementBoundaryError("W6 command must be a plain object");
  const action = value.action;
  if (!W6_IMPLEMENTED_ACTIONS.includes(action as (typeof W6_IMPLEMENTED_ACTIONS)[number])) {
    throw new W6ImprovementBoundaryError("W6 action is not implemented");
  }
  const common = ["action", "event_id", "case_ids", "cluster_id"];
  const expected = action === "create_cluster_candidate"
    ? [...common, "name", "category_domain"]
    : action === "review_candidate"
      ? [...common, "actor", "decision", "reason"]
      : action === "start_improvement"
        ? [...common, "improvement_id", "actor", "improvement", "reason"]
        : action === "enter_observation"
          ? [...common, "improvement_id", "actor", "reason"]
          : action === "record_day_7" || action === "record_day_30"
            ? [...common, "improvement_id", "cycle_id", "related_task_volume"]
            : action === "archive_observation"
              ? [...common, "improvement_id", "actor", "cycle_id", "human_conclusion", "reason"]
              : action === "reopen_recurrence"
                ? [...common, "improvement_id", "actor", "triggering_case_ids", "reason"]
                : [...common, "improvement_id", "actor", "cycle_id", "triggering_case_ids", "reason"];
  if (!hasExactKeys(value, expected)) {
    throw new W6ImprovementBoundaryError("W6 command contains missing or extra fields");
  }
  if (
    !isNonEmptyString(value.event_id, 160) ||
    !isSortedUniqueStrings(value.case_ids, 2) ||
    !isNonEmptyString(value.cluster_id, 160)
  ) {
    throw new W6ImprovementBoundaryError("W6 requires stable sorted identifiers and at least two cases");
  }
  const caseIds = value.case_ids;
  if (action === "create_cluster_candidate") {
    if (!isNonEmptyString(value.name, 240) || !isNonEmptyString(value.category_domain, 160)) {
      throw new W6ImprovementBoundaryError("W6 candidate metadata is invalid");
    }
  } else if (action === "record_day_7" || action === "record_day_30") {
    if (
      !isNonEmptyString(value.improvement_id, 160) ||
      !isNonEmptyString(value.cycle_id, 160) ||
      (
        value.related_task_volume !== null &&
        (
          !Number.isSafeInteger(value.related_task_volume) ||
          (value.related_task_volume as number) <= 0
        )
      )
    ) {
      throw new W6ImprovementBoundaryError(
        "W6 observation checkpoint requires one active cycle and a null or positive safe-integer denominator",
      );
    }
  } else {
    if (!isHumanActor(value.actor) || !isNonEmptyString(value.reason, 512)) {
      throw new W6ImprovementBoundaryError("W6 authorized commands require a bounded human actor and reason");
    }
    if (
      action === "review_candidate" &&
      value.decision !== "submit_for_review" &&
      value.decision !== "reject"
    ) {
      throw new W6ImprovementBoundaryError("W6 candidate review decision is invalid");
    }
    if (action === "start_improvement") {
      if (!isNonEmptyString(value.improvement_id, 160) || !isObject(value.improvement)) {
        throw new W6ImprovementBoundaryError("W6 improvement identity and specification are required");
      }
      if (!hasExactKeys(value.improvement, [
        "version",
        "owner_role",
        "measure",
        "observation_window_days",
        "clock_source",
        "metric_formula",
      ])) {
        throw new W6ImprovementBoundaryError("W6 improvement specification has an invalid exact shape");
      }
      if (
        !isNonEmptyString(value.improvement.version, 160) ||
        !isNonEmptyString(value.improvement.owner_role, 160) ||
        !isNonEmptyString(value.improvement.measure, 1000) ||
        !Array.isArray(value.improvement.observation_window_days) ||
        value.improvement.observation_window_days.length !== 2 ||
        value.improvement.observation_window_days[0] !== 7 ||
        value.improvement.observation_window_days[1] !== 30 ||
        !["real", "test", "synthetic_history"].includes(value.improvement.clock_source as string) ||
        !isNonEmptyString(value.improvement.metric_formula, 1000)
      ) {
        throw new W6ImprovementBoundaryError("W6 improvement specification violates the fixed observation contract");
      }
    } else if (action === "enter_observation") {
      if (!isNonEmptyString(value.improvement_id, 160)) {
        throw new W6ImprovementBoundaryError("W6 enter-observation requires one stable improvement identifier");
      }
    } else if (action === "archive_observation") {
      if (
        !isNonEmptyString(value.improvement_id, 160) ||
        !isNonEmptyString(value.cycle_id, 160) ||
        !isNonEmptyString(value.human_conclusion, 1000)
      ) {
        throw new W6ImprovementBoundaryError(
          "W6 archive requires stable improvement and cycle identifiers plus one bounded human conclusion",
        );
      }
    } else if (action === "reopen_recurrence") {
      if (
        !isNonEmptyString(value.improvement_id, 160) ||
        !isSortedUniqueStrings(value.triggering_case_ids, 1)
      ) {
        throw new W6ImprovementBoundaryError(
          "W6 recurrence reopen requires stable improvement and trigger identifiers",
        );
      }
    } else if (
      action === "intake_active_observation_recurrence" &&
      (
        !isNonEmptyString(value.improvement_id, 160) ||
        !isNonEmptyString(value.cycle_id, 160) ||
        !isSortedUniqueStrings(value.triggering_case_ids, 1) ||
        value.triggering_case_ids.some((caseId) => !caseIds.includes(caseId))
      )
    ) {
      throw new W6ImprovementBoundaryError(
        "W6 active-observation recurrence intake requires stable improvement, cycle, and trigger identifiers",
      );
    }
  }
  return value as unknown as W6ImprovementCommand;
}

function snapshotCommand(value: unknown): W6ImprovementCommand {
  return validateCommandSnapshot(snapshotPlainJson(value, "W6 command"));
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function fingerprintCommandSnapshot(command: W6ImprovementCommand): string {
  return createWorkflowEventFingerprint({
    workflow: "W6",
    batch: isObservationBatchEAction(command.action)
      ? "observation_batch_e"
      : isObservationBatchDAction(command.action)
        ? "observation_batch_d"
        : "improvement_batch_c",
    command: command as unknown as JsonValue,
  });
}

export function fingerprintW6ImprovementCommand(command: W6ImprovementCommand): string {
  return fingerprintCommandSnapshot(snapshotCommand(command));
}

function fingerprintW6RecurrenceStableSemantic(
  command: W6ReopenRecurrenceCommand,
): string {
  return createWorkflowEventFingerprint({
    action: command.action,
    actor: cloneJson(command.actor) as unknown as JsonValue,
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: command.improvement_id,
    triggering_case_ids: [...command.triggering_case_ids],
    reason: command.reason,
  });
}

function commandObjectRef(command: W6ImprovementCommand): { object_type: "cluster"; object_id: string } {
  return { object_type: "cluster", object_id: command.cluster_id };
}

function safeFailure(
  command: Pick<W6ImprovementCommand, "event_id" | "cluster_id">,
  errorClass: Exclude<W6ImprovementErrorClass, "none">,
  message: string,
  actions: string[],
  output: Record<string, JsonValue> = {},
): WorkflowResult<JsonValue> {
  return {
    workflow: "W6",
    event_id: command.event_id,
    status: "failed",
    object_ref: {
      object_type: "cluster",
      object_id: command.cluster_id,
    },
    actions: [
      ...actions,
      "do_not_merge_cases",
      "do_not_relink_feedback",
      "do_not_assert_final_root_cause",
      "do_not_publish_knowledge",
      "do_not_control_vehicle",
    ],
    errors: [message],
    output: {
      evidence_class: "synthetic_experiment",
      error_class: errorClass,
      human_review_required: true,
      final_root_cause: false,
      external_effects: {
        automatic_case_merge: false,
        automatic_feedback_relink: false,
        automatic_final_root_cause: false,
        automatic_case_closure: false,
        automatic_knowledge_publication: false,
        vehicle_control_performed: false,
      },
      ...output,
    },
  };
}

function invalidCommandResult(message: string): WorkflowResult<JsonValue> {
  return safeFailure(
    { event_id: "invalid_W6_command_event", cluster_id: "unknown_cluster" },
    "invalid_command",
    message,
    ["reject_command_before_ports", "stop_W6_command"],
  );
}

function sameCaseIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateClosedContext(context: unknown, caseId: string): W6ClosedCaseContext {
  const snapshot = snapshotPlainJson(context, `W6 closed context ${caseId}`);
  if (!isObject(snapshot)) throw new Error(`W6 closed context ${caseId} is invalid`);
  const typed = snapshot as unknown as W6ClosedCaseContext;
  if (
    !typed.case_record ||
    typed.case_record.case_id !== caseId ||
    typed.case_record.data_scope !== "synthetic_experiment" ||
    typed.case_record.evidence_class !== "synthetic_experiment" ||
    typed.case_record.status !== "已关闭" ||
    typed.case_record.workflow_readiness !== "closed" ||
    typed.case_record.closed_at === null ||
    !typed.work_order ||
    typed.work_order.case_id !== caseId ||
    typed.work_order.data_scope !== "synthetic_experiment" ||
    typed.work_order.status !== "已完成" ||
    !typed.w5_history ||
    !typed.closure_provenance ||
    typed.closure_provenance.case_id !== caseId ||
    typed.closure_provenance.work_order_id !== typed.work_order.work_order_id ||
    typed.closure_provenance.closed_at !== typed.case_record.closed_at
  ) {
    throw new Error(`W6 case ${caseId} lacks a repository-authoritative W5 closed context`);
  }
  return typed;
}

async function loadClosedContexts(
  command: W6ImprovementCommand,
  repository: W6ImprovementRepository,
): Promise<W6ClosedCaseContext[]> {
  const contexts = await Promise.all(
    command.case_ids.map(async (caseId) =>
      validateClosedContext(await repository.getW6ClosedCaseContext(caseId), caseId)
    ),
  );
  return contexts.sort((left, right) => left.case_record.case_id.localeCompare(right.case_record.case_id));
}

async function independentResolution(
  caseId: string,
  repository: W6ImprovementRepository,
): Promise<"not_required" | "keep_separate"> {
  const [check, resolution] = await Promise.all([
    repository.findSameEventCheckByCaseId(caseId),
    repository.findSameEventResolutionByCaseId(caseId),
  ]);
  if (
    check?.node_status === "ok" &&
    check.candidate === null &&
    check.review_state === "not_required"
  ) return "not_required";
  if (resolution?.decision === "keep_separate") return "keep_separate";
  throw new Error(`W6 case ${caseId} has no authoritative independent same-event resolution`);
}

async function buildN5CrossEventRequest(
  contexts: W6ClosedCaseContext[],
  repository: W6ImprovementRepository,
  currentCaseId: string,
  projectedClusterId: (caseId: string) => string | null,
): Promise<AiNodeRunRequest<JsonValue>> {
  const resolutions = new Map(await Promise.all(contexts.map(async (context) => [
    context.case_record.case_id,
    await independentResolution(context.case_record.case_id, repository),
  ] as const)));
  const toFact = (context: W6ClosedCaseContext) => ({
    case_id: context.case_record.case_id,
    status: context.case_record.status,
    workflow_readiness: context.case_record.workflow_readiness,
    summary: context.case_record.summary,
    same_event_resolution: resolutions.get(context.case_record.case_id) as "not_required" | "keep_separate",
    cluster_id: projectedClusterId(context.case_record.case_id),
  });
  const toTime = (context: W6ClosedCaseContext) => ({
    case_id: context.case_record.case_id,
    closed_at: context.case_record.closed_at,
  });
  const toEntity = (context: W6ClosedCaseContext) => ({
    case_id: context.case_record.case_id,
    formal_entity: cloneJson(context.case_record.formal_entity),
  });
  const toSource = (context: W6ClosedCaseContext) => ({
    case_id: context.case_record.case_id,
    source_ref: `case:${context.case_record.case_id}`,
  });
  const current = contexts.find((context) => context.case_record.case_id === currentCaseId);
  if (!current) throw new Error(`W6 N5 current case ${currentCaseId} is missing`);
  const candidates = contexts.filter((context) => context.case_record.case_id !== currentCaseId);
  const request: AiNodeRunRequest<JsonValue> = {
    node: "N5",
    mode: AI_NODE_DEFINITIONS.N5_CROSS_EVENT.mode,
    version: AI_NODE_DEFINITIONS.N5_CROSS_EVENT.version,
    object_ref: { object_type: "case", object_id: current.case_record.case_id },
    input: {
      case_facts: { current: toFact(current), candidates: candidates.map(toFact) },
      time: { current: toTime(current), candidates: candidates.map(toTime) },
      confirmed_entities: { current: toEntity(current), candidates: candidates.map(toEntity) },
      source_reference: { current: toSource(current), candidates: candidates.map(toSource) },
    },
  };
  const validation = validateNodeRequestDefinition(request);
  if (!validation.valid) throw new Error(`W6 N5 request is invalid: ${validation.errors.join("; ")}`);
  return request;
}

async function buildN5Request(
  command: W6CreateClusterCandidateCommand,
  contexts: W6ClosedCaseContext[],
  repository: W6ImprovementRepository,
): Promise<AiNodeRunRequest<JsonValue>> {
  return buildN5CrossEventRequest(
    contexts,
    repository,
    contexts[0].case_record.case_id,
    (caseId) => contexts.find((context) => context.case_record.case_id === caseId)?.case_record.cluster_id ?? null,
  );
}

async function buildActiveIntakeN5Request(
  command: W6ActiveObservationRecurrenceIntakeCommand,
  contexts: W6ClosedCaseContext[],
  repository: W6ImprovementRepository,
  existingMemberCaseIds: readonly string[],
): Promise<AiNodeRunRequest<JsonValue>> {
  return buildN5CrossEventRequest(
    contexts,
    repository,
    command.triggering_case_ids[0],
    (caseId) => existingMemberCaseIds.includes(caseId) ? command.cluster_id : null,
  );
}

function validatedEnvelope<TPayload extends JsonValue>(
  raw: unknown,
  request: AiNodeRunRequest<JsonValue>,
): AiNodeEnvelope<TPayload> {
  const snapshot = snapshotPlainJson(raw, `${request.node} ${request.mode} envelope`);
  const boundary = validateAiNodeEnvelope(snapshot);
  if (!boundary.valid) throw new Error(`${request.node} envelope is invalid: ${boundary.errors.join("; ")}`);
  const envelope = boundary.value as AiNodeEnvelope<TPayload>;
  const candidate = validateNodeCandidate(request, {
    payload: envelope.payload,
    evidence_spans: envelope.evidence_spans,
    missing_fields: envelope.missing_fields,
    confidence: envelope.confidence,
    status: envelope.status,
  });
  if (
    envelope.node !== request.node ||
    envelope.mode !== request.mode ||
    envelope.version !== request.version ||
    envelope.object_ref.object_type !== request.object_ref.object_type ||
    envelope.object_ref.object_id !== request.object_ref.object_id ||
    envelope.input_hash !== createAiInputHash(request) ||
    envelope.status !== "ok" ||
    envelope.validation.valid !== true ||
    envelope.payload === null ||
    envelope.human_revision.state !== "none" ||
    !candidate.valid
  ) {
    throw new Error(`${request.node} ${request.mode} stopped without one validated bound result`);
  }
  return envelope;
}

function validateN5Selection(
  envelope: AiNodeEnvelope<N5CrossEventPayload>,
  command: W6CreateClusterCandidateCommand,
): void {
  const candidate = envelope.payload?.cluster_candidate;
  const memberIds = candidate?.member_cases.map((entry) => entry.case_id).sort((left, right) => left.localeCompare(right));
  if (
    !candidate ||
    candidate.candidate_kind !== "new_cluster" ||
    candidate.suggested_cluster_id !== null ||
    !sameCaseIds(memberIds ?? [], command.case_ids) ||
    envelope.payload?.human_review_required !== true ||
    envelope.payload.automatic_merge !== false ||
    envelope.payload.automatic_case_relink !== false
  ) {
    throw new Error("W6 accepts only one new-cluster N5 candidate covering the exact closed cases");
  }
}

function validateActiveIntakeN5Selection(
  envelope: AiNodeEnvelope<N5CrossEventPayload>,
  command: W6ActiveObservationRecurrenceIntakeCommand,
): void {
  const candidate = envelope.payload?.cluster_candidate;
  const memberIds = candidate?.member_cases
    .map((entry) => entry.case_id)
    .sort((left, right) => left.localeCompare(right));
  if (
    !candidate ||
    candidate.candidate_kind !== "existing_cluster" ||
    candidate.suggested_cluster_id !== command.cluster_id ||
    !sameCaseIds(memberIds ?? [], command.case_ids) ||
    envelope.payload?.human_review_required !== true ||
    envelope.payload.automatic_merge !== false ||
    envelope.payload.automatic_case_relink !== false
  ) {
    throw new Error(
      "W6 active recurrence intake accepts only one exact existing-cluster N5 candidate without merge or relink",
    );
  }
}

function latestById<T extends Record<string, unknown>>(
  records: T[],
  idField: keyof T,
  id: string,
  label: string,
): T {
  const record = records.find((entry) => entry[idField] === id);
  if (!record) throw new Error(`W6 closed context lacks ${label} ${id}`);
  return record;
}

async function buildN6Request(
  command: W6StartImprovementCommand,
  cluster: RuntimeProblemCluster,
  contexts: W6ClosedCaseContext[],
  ports: W6ImprovementPorts,
): Promise<AiNodeRunRequest<JsonValue>> {
  const rawCatalog = await ports.hypothesis_catalog_provider.getCatalog({
    node: "N6",
    mode: AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.mode,
    version: AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.version,
    object_ref: { object_type: "cluster", object_id: command.cluster_id },
    member_case_ids: [...command.case_ids],
  });
  const catalog = snapshotPlainJson(rawCatalog, "N6 hypothesis catalog");
  const evidence = contexts.flatMap((context) => {
    const provenance = context.closure_provenance;
    const submission = latestById(
      context.w5_history.evidence_submissions as unknown as Record<string, unknown>[],
      "submission_id",
      provenance.evidence_submission_id,
      "evidence submission",
    );
    return [
      {
        case_id: context.case_record.case_id,
        source_ref: `case:${context.case_record.case_id}:summary`,
        text: context.case_record.summary,
      },
      {
        case_id: context.case_record.case_id,
        source_ref: `w5:evidence:${provenance.evidence_submission_id}`,
        text: submission.text as string,
      },
    ];
  });
  const resolutionRecords = contexts.map((context) => {
    const provenance = context.closure_provenance;
    const closure = latestById(
      context.w5_history.closure_decisions as unknown as Record<string, unknown>[],
      "decision_id",
      provenance.closure_decision_id,
      "closure decision",
    );
    return {
      case_id: context.case_record.case_id,
      source_ref: `w5:closure:${provenance.closure_decision_id}`,
      text: closure.reason as string,
      review_status: "approved",
    };
  });
  const request: AiNodeRunRequest<JsonValue> = {
    node: "N6",
    mode: AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.mode,
    version: AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.version,
    object_ref: { object_type: "cluster", object_id: command.cluster_id },
    input: {
      evidence,
      issue_cluster: {
        cluster_id: cluster.cluster_id,
        member_case_ids: [...cluster.member_case_ids],
        status: cluster.status,
      },
      resolution_records: resolutionRecords,
      hypothesis_catalog: catalog,
    },
  };
  const validation = validateNodeRequestDefinition(request);
  if (!validation.valid) throw new Error(`W6 N6 request is invalid: ${validation.errors.join("; ")}`);
  return request;
}

function rootCauseRecord(
  envelope: AiNodeEnvelope<N6RootCausePayload>,
): W6RootCauseHypothesis {
  const payload = envelope.payload;
  if (
    !payload ||
    payload.hypotheses.length !== 1 ||
    payload.human_review_required !== true ||
    payload.final_root_cause !== false
  ) {
    throw new Error("W6 start_improvement requires exactly one controlled non-final N6 hypothesis");
  }
  const hypothesis = payload.hypotheses[0] as N6RootCausePayloadHypothesis;
  const selectEvidence = (indices: number[]): EvidenceSpan[] => indices.map((index) => {
    const span = envelope.evidence_spans[index];
    if (!span) throw new Error(`W6 N6 hypothesis references missing evidence ${index}`);
    return cloneJson(span);
  });
  return {
    hypothesis_id: hypothesis.hypothesis_id,
    node_run_id: envelope.run_id,
    node_version: "N6-root-cause-1.0.0-draft.3",
    input_hash: envelope.input_hash,
    statement: hypothesis.statement,
    supporting_evidence: selectEvidence(hypothesis.supporting_evidence_indices),
    counter_evidence: selectEvidence(hypothesis.counter_evidence_indices),
    uncertainties: [...hypothesis.uncertainties],
    final_root_cause: false,
  };
}

function trustedPrincipal(value: unknown): value is W3AuthorizedPrincipal {
  return isObject(value) &&
    hasExactKeys(value, ["principal_id", "principal_type", "canonical_role", "authority_source"]) &&
    isNonEmptyString(value.principal_id, 160) &&
    value.principal_type === "synthetic_human" &&
    isNonEmptyString(value.canonical_role, 160) &&
    value.authority_source === "synthetic_allowlist";
}

function inspectAuthorizationDecision(
  value: unknown,
): W6AuthorizationDecision | W6AuthorizationDenial {
  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("decision must be an object");
    }
    prototype = Object.getPrototypeOf(value) as object | null;
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new Error("W6 authorization decision could not be inspected safely");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("W6 authorization decision has an untrusted prototype");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === "symbol")) {
    throw new Error("W6 authorization decision contains symbol fields");
  }
  const read = (key: string): unknown => descriptorValue(descriptors[key]);
  const allowed = read("allowed");
  if (allowed === false) {
    if (!haveExactDescriptorKeys(descriptors, keys, ["allowed", "reason"]) || !isNonEmptyString(read("reason"), 512)) {
      throw new Error("W6 authorization denial is malformed");
    }
    return { allowed: false, reason: read("reason") as string };
  }
  if (
    allowed !== true ||
    !haveExactDescriptorKeys(descriptors, keys, ["allowed", "principal", "policy_version", "grant"])
  ) {
    throw new Error("W6 authorization decision is malformed");
  }
  const principalSnapshot = snapshotPlainJson(read("principal"), "W6 authorization principal");
  if (
    !trustedPrincipal(principalSnapshot) ||
    !isNonEmptyString(read("policy_version"), 160) ||
    typeof read("grant") !== "object" ||
    read("grant") === null
  ) {
    throw new Error("W6 authorization grant metadata is malformed");
  }
  return {
    allowed: true,
    principal: principalSnapshot,
    policy_version: read("policy_version") as string,
    grant: read("grant") as W6AuthorizationGrant,
  };
}

async function authorizeTransition(
  command:
    | W6ReviewCandidateCommand
    | W6StartImprovementCommand
    | W6EnterObservationCommand
    | W6ArchiveObservationCommand
    | W6ReopenRecurrenceCommand
    | W6ActiveObservationRecurrenceIntakeCommand,
  transitionSnapshot: W6AtomicTransition,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<
  | { allowed: true; decision: W6AuthorizationDecision; claims: W6AuthorizationGrantClaims }
  | { allowed: false; reason: string; error_class: "authorization_failure" | "authorization_port_failure" }
> {
  const binding = createW6AuthorizationBinding(transitionSnapshot);
  const expectedPhase = command.action === "review_candidate"
    ? "cluster_review"
    : command.action === "start_improvement"
      ? "improvement"
      : command.action === "enter_observation" || command.action === "archive_observation"
        ? "observation"
        : "recurrence";
  if (binding.phase !== expectedPhase || binding.action !== command.action) {
    return {
      allowed: false,
      reason: "W6 authorization binding does not match the requested action",
      error_class: "authorization_port_failure",
    };
  }
  let raw: unknown;
  try {
    raw = await ports.action_authorizer.authorize({
      event_id: command.event_id,
      actor: cloneJson(command.actor),
      action: command.action,
      phase: expectedPhase,
      object_ref: commandObjectRef(command),
      case_ids: [...binding.case_ids],
      improvement_id: binding.improvement_id,
      transition: cloneJson(transitionSnapshot) as unknown as JsonValue,
      target_fingerprint: binding.target_fingerprint,
      command_fingerprint: commandFingerprint,
    });
  } catch {
    return {
      allowed: false,
      reason: "W6 authorization could not be verified",
      error_class: "authorization_port_failure",
    };
  }
  let decision: W6AuthorizationDecision | W6AuthorizationDenial;
  try {
    decision = inspectAuthorizationDecision(raw);
  } catch {
    return {
      allowed: false,
      reason: "W6 authorization decision was malformed",
      error_class: "authorization_port_failure",
    };
  }
  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason, error_class: "authorization_failure" };
  }
  return {
    allowed: true,
    decision,
    claims: {
      workflow: "W6",
      event_id: command.event_id,
      phase: binding.phase,
      case_ids: [...binding.case_ids],
      cluster_id: binding.cluster_id,
      improvement_id: binding.improvement_id,
      action: binding.action,
      target_fingerprint: binding.target_fingerprint,
      command_fingerprint: commandFingerprint,
      principal: cloneJson(decision.principal),
      policy_version: decision.policy_version,
    },
  };
}

async function authorizeRecurrenceRequest(
  command: W6ReopenRecurrenceCommand,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<
  | { allowed: true; decision: W6AuthorizationDecision; claims: W6AuthorizationGrantClaims }
  | { allowed: false; reason: string; error_class: "authorization_failure" | "authorization_port_failure" }
> {
  const binding = createW6RecurrenceRequestAuthorizationBinding(command);
  let raw: unknown;
  try {
    raw = await ports.action_authorizer.authorize({
      event_id: command.event_id,
      actor: cloneJson(command.actor),
      action: "reopen_recurrence",
      phase: "recurrence",
      object_ref: commandObjectRef(command),
      case_ids: [...binding.case_ids],
      improvement_id: binding.improvement_id,
      transition: cloneJson(binding.authorization_target),
      target_fingerprint: binding.target_fingerprint,
      command_fingerprint: commandFingerprint,
    });
  } catch {
    return {
      allowed: false,
      reason: "W6 recurrence replay authorization could not be verified",
      error_class: "authorization_port_failure",
    };
  }
  let decision: W6AuthorizationDecision | W6AuthorizationDenial;
  try {
    decision = inspectAuthorizationDecision(raw);
  } catch {
    return {
      allowed: false,
      reason: "W6 recurrence replay authorization decision was malformed",
      error_class: "authorization_port_failure",
    };
  }
  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason, error_class: "authorization_failure" };
  }
  return {
    allowed: true,
    decision,
    claims: {
      workflow: "W6",
      event_id: command.event_id,
      phase: "recurrence",
      case_ids: [...binding.case_ids],
      cluster_id: binding.cluster_id,
      improvement_id: binding.improvement_id,
      action: "reopen_recurrence",
      target_fingerprint: binding.target_fingerprint,
      command_fingerprint: commandFingerprint,
      principal: cloneJson(decision.principal),
      policy_version: decision.policy_version,
    },
  };
}

function resourcesFor(command: W6ImprovementCommand): W6ResourceSet {
  return {
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: "improvement_id" in command ? command.improvement_id : null,
  };
}

function successfulResult(
  command: W6ImprovementCommand,
  status: "completed" | "idempotent" | "needs_human",
  actions: string[],
  output: Record<string, JsonValue>,
  states?: { previous: string; next: string },
): WorkflowResult<JsonValue> {
  return {
    workflow: "W6",
    event_id: command.event_id,
    status,
    object_ref: commandObjectRef(command),
    ...(states ? { previous_state: states.previous, next_state: states.next } : {}),
    actions,
    errors: [],
    output: {
      evidence_class: "synthetic_experiment",
      human_review_required: status === "needs_human",
      final_root_cause: false,
      external_effects: {
        automatic_case_merge: false,
        automatic_feedback_relink: false,
        automatic_final_root_cause: false,
        automatic_case_closure: false,
        automatic_knowledge_publication: false,
        vehicle_control_performed: false,
      },
      ...output,
    },
  };
}

async function executeCreate(
  command: W6CreateClusterCandidateCommand,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  let contexts: W6ClosedCaseContext[];
  try {
    contexts = await loadClosedContexts(command, ports.repository);
  } catch {
    return safeFailure(command, "w5_closure_provenance_failure", "W6 requires repository-issued W5 closure provenance", [
      "preserve_closed_cases",
      "stop_before_N5",
    ]);
  }
  let request: AiNodeRunRequest<JsonValue>;
  let envelope: AiNodeEnvelope<N5CrossEventPayload>;
  try {
    request = await buildN5Request(command, contexts, ports.repository);
    envelope = validatedEnvelope<N5CrossEventPayload>(
      await ports.ai_runner.run(cloneJson(request)),
      request,
    );
    validateN5Selection(envelope, command);
  } catch {
    return safeFailure(command, "n5_failure", "N5 cross-event clustering did not yield one validated new-cluster candidate", [
      "preserve_closed_cases",
      "stop_before_cluster_write",
      "route_cluster_candidate_to_human",
    ]);
  }
  const candidateInput: W6ClusterCandidateInput = {
    cluster_id: command.cluster_id,
    name: command.name,
    category_domain: command.category_domain,
    proposal_id: ports.ids.nextId("w6-cross-event-proposal"),
    history_id: ports.ids.nextId("w6-cluster-history"),
    receipt_id: ports.ids.nextId("w6-cluster-receipt"),
    created_at: ports.clock.now().toISOString(),
    request,
    envelope,
  };
  try {
    const committed = await ports.repository.runW6ResourcesExclusive(
      resourcesFor(command),
      () => ports.repository.createW6ClusterCandidateIfAbsent(candidateInput),
    );
    return successfulResult(
      command,
      "needs_human",
      [
        committed.outcome === "created" ? "create_N5_cross_event_candidate" : "return_existing_cluster_candidate",
        "await_authorized_human_cluster_review",
        "do_not_merge_cases",
        "do_not_relink_feedback",
      ],
      {
        candidate_outcome: committed.outcome,
        cluster: asJson(committed.cluster),
        proposal: asJson(committed.proposal),
        history: asJson(committed.history),
        receipt: asJson(committed.receipt),
      },
      { previous: "已关闭", next: "候选" },
    );
  } catch {
    return safeFailure(command, "repository_failure", "W6 candidate persistence rejected a stale or non-authoritative snapshot", [
      "preserve_closed_cases",
      "stop_cluster_candidate_write",
    ]);
  }
}

async function loadBoundCluster(
  command: W6ReviewCandidateCommand | W6StartImprovementCommand,
  ports: W6ImprovementPorts,
): Promise<RuntimeProblemCluster> {
  const cluster = await ports.repository.findW6ClusterById(command.cluster_id);
  if (!cluster) throw new Error("W6 cluster does not exist");
  if (
    cluster.data_scope !== "synthetic_experiment" ||
    cluster.evidence_class !== "synthetic_experiment" ||
    !sameCaseIds(cluster.member_case_ids, command.case_ids)
  ) {
    throw new Error("W6 command is not bound to the authoritative synthetic cluster membership");
  }
  return cluster;
}

async function commitAuthorizedTransition(
  command:
    | W6ReviewCandidateCommand
    | W6StartImprovementCommand
    | W6EnterObservationCommand
    | W6ArchiveObservationCommand
    | W6ReopenRecurrenceCommand
    | W6ActiveObservationRecurrenceIntakeCommand,
  transitionSnapshot: W6AtomicTransition,
  authorization: Extract<Awaited<ReturnType<typeof authorizeTransition>>, { allowed: true }>,
  ports: W6ImprovementPorts,
  aiValidation?: { grant: W6AiValidationGrant; claims: W6AiValidationGrantClaims },
  revalidateInsideLock?: () => void,
  commitOperation?: () => Promise<W6CommitResult>,
): Promise<W6CommitResult> {
  return ports.repository.runW6ResourcesExclusive(resourcesFor(command), () =>
    ports.repository.runAuthorizedW6Action(
      { grant: authorization.decision.grant, claims: authorization.claims },
      () => {
        revalidateInsideLock?.();
        return aiValidation
          ? ports.repository.runValidatedW6AiAction(
              aiValidation,
              () => commitOperation?.() ?? ports.repository.commitW6Transition(transitionSnapshot),
            )
          : commitOperation?.() ?? ports.repository.commitW6Transition(transitionSnapshot);
      },
    )
  );
}

async function executeReview(
  command: W6ReviewCandidateCommand,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  let cluster: RuntimeProblemCluster;
  try {
    cluster = await loadBoundCluster(command, ports);
  } catch {
    return safeFailure(command, "record_not_found", "W6 candidate cluster or authoritative membership was not found", [
      "stop_candidate_review",
    ]);
  }
  if (cluster.status !== "候选") {
    return safeFailure(command, "invalid_state", "W6 candidate review requires cluster status 候选", [
      "preserve_cluster_state",
      "stop_candidate_review",
    ], { cluster: asJson(cluster) });
  }
  const transitionSnapshot = snapshotW6AtomicTransition({
    action: "review_candidate",
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: null,
    expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster as unknown as JsonValue),
    expected_improvement_fingerprint: null,
    history_id: ports.ids.nextId("w6-review-history"),
    receipt_id: ports.ids.nextId("w6-review-receipt"),
    occurred_at: ports.clock.now().toISOString(),
    decision: command.decision,
    reason: command.reason,
  });
  const authorization = await authorizeTransition(command, transitionSnapshot, commandFingerprint, ports);
  if (!authorization.allowed) {
    return safeFailure(command, authorization.error_class, authorization.reason, [
      "preserve_candidate_cluster",
      "stop_candidate_review",
    ], { cluster: asJson(cluster), action_authorization: { state: "denied_or_indeterminate", authorized: false } });
  }
  try {
    const committed = await commitAuthorizedTransition(command, transitionSnapshot, authorization, ports);
    if (committed.outcome === "concurrency_conflict") {
      return safeFailure(command, "concurrency_conflict", "W6 candidate changed during authorization; stale review was not written", [
        "preserve_current_cluster_state",
        "stop_stale_candidate_review",
      ], { cluster: asJson(committed.cluster), receipt: asJson(committed.receipt) });
    }
    const next = command.decision === "submit_for_review" ? "待审核" : "已驳回";
    return successfulResult(
      command,
      "completed",
      command.decision === "submit_for_review"
        ? ["record_authorized_candidate_review", "submit_cluster_for_review", "preserve_case_ownership"]
        : ["record_authorized_candidate_rejection", "reject_cluster_candidate", "preserve_case_ownership"],
      {
        commit_outcome: committed.outcome,
        cluster: asJson(committed.cluster),
        history: asJson(committed.history),
        receipt: asJson(committed.receipt),
        action_authorization: { state: "authorized", authorized: true },
      },
      { previous: "候选", next },
    );
  } catch {
    return safeFailure(command, "authorization_capability_invalid", "W6 authorization capability or repository transition was rejected", [
      "preserve_candidate_cluster",
      "stop_candidate_review",
    ], { cluster: asJson(cluster) });
  }
}

async function executeStart(
  command: W6StartImprovementCommand,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  let cluster: RuntimeProblemCluster;
  let contexts: W6ClosedCaseContext[];
  try {
    cluster = await loadBoundCluster(command, ports);
    if (cluster.status !== "待审核" || cluster.active_improvement_id !== null) {
      throw new Error("cluster is not ready for improvement");
    }
    contexts = await loadClosedContexts(command, ports.repository);
  } catch {
    return safeFailure(command, "w5_closure_provenance_failure", "W6 start requires a reviewed cluster and unchanged W5 closure provenance", [
      "preserve_reviewed_cluster",
      "stop_before_N6",
    ]);
  }
  let envelope: AiNodeEnvelope<N6RootCausePayload>;
  let rootCause: W6RootCauseHypothesis;
  let request: AiNodeRunRequest<JsonValue>;
  try {
    request = await buildN6Request(command, cluster, contexts, ports);
    envelope = validatedEnvelope<N6RootCausePayload>(
      await ports.ai_runner.run(cloneJson(request)),
      request,
    );
    rootCause = rootCauseRecord(envelope);
  } catch (error) {
    const catalogFailure = error instanceof W6ImprovementBoundaryError ||
      (error instanceof Error && /catalog|directory/u.test(error.message));
    return safeFailure(
      command,
      catalogFailure ? "hypothesis_catalog_failure" : "n6_failure",
      catalogFailure
        ? "N6 controlled hypothesis catalog was rejected before an improvement write"
        : "N6 root-cause mode did not yield one validated controlled non-final hypothesis",
      ["preserve_reviewed_cluster", "stop_before_improvement_write", "keep_root_cause_as_unconfirmed"],
      { cluster: asJson(cluster) },
    );
  }
  const transitionSnapshot = snapshotW6AtomicTransition({
    action: "start_improvement",
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: command.improvement_id,
    expected_cluster_fingerprint: createWorkflowEventFingerprint(cluster as unknown as JsonValue),
    expected_improvement_fingerprint: null,
    history_id: ports.ids.nextId("w6-improvement-history"),
    receipt_id: ports.ids.nextId("w6-improvement-receipt"),
    occurred_at: ports.clock.now().toISOString(),
    improvement: cloneJson(command.improvement),
    root_cause_hypothesis: rootCause,
    reason: command.reason,
  });
  let aiValidation: { grant: W6AiValidationGrant; claims: W6AiValidationGrantClaims };
  try {
    aiValidation = ports.repository.validateAndIssueW6AiAction({
      event_id: command.event_id,
      command_fingerprint: commandFingerprint,
      transition: transitionSnapshot,
      request,
      envelope: envelope as AiNodeEnvelope<JsonValue>,
    });
  } catch {
    return safeFailure(command, "n6_failure", "Repository rejected the N6 validation provenance before authorization", [
      "preserve_reviewed_cluster",
      "discard_uncommitted_N6_hypothesis",
      "stop_before_authorization",
    ], { cluster: asJson(cluster) });
  }
  const authorization = await authorizeTransition(command, transitionSnapshot, commandFingerprint, ports);
  if (!authorization.allowed) {
    return safeFailure(command, authorization.error_class, authorization.reason, [
      "preserve_reviewed_cluster",
      "discard_uncommitted_N6_hypothesis",
      "stop_improvement_start",
    ], { cluster: asJson(cluster) });
  }
  try {
    const committed = await commitAuthorizedTransition(
      command,
      transitionSnapshot,
      authorization,
      ports,
      aiValidation,
    );
    if (committed.outcome === "concurrency_conflict") {
      return safeFailure(command, "concurrency_conflict", "W6 cluster changed during authorization; stale improvement was not written", [
        "preserve_current_cluster_state",
        "discard_stale_N6_hypothesis",
        "stop_improvement_start",
      ], { cluster: asJson(committed.cluster), receipt: asJson(committed.receipt) });
    }
    return successfulResult(
      command,
      "completed",
      [
        "record_authorized_improvement_start",
        "store_controlled_root_cause_hypothesis",
        "mark_hypothesis_non_final",
        "create_versioned_improvement_project",
        "do_not_publish_knowledge",
      ],
      {
        commit_outcome: committed.outcome,
        cluster: asJson(committed.cluster),
        improvement: committed.improvement ? asJson(committed.improvement) : null,
        root_cause_hypothesis: asJson(rootCause),
        human_review_required: true,
        hypothesis_state: "controlled_hypothesis_pending_human_validation",
        history: asJson(committed.history),
        receipt: asJson(committed.receipt),
        action_authorization: { state: "authorized", authorized: true },
      },
      { previous: "待审核", next: "改进中" },
    );
  } catch {
    return safeFailure(command, "authorization_capability_invalid", "W6 authorization capability or improvement transition was rejected", [
      "preserve_reviewed_cluster",
      "discard_uncommitted_N6_hypothesis",
      "stop_improvement_start",
    ], { cluster: asJson(cluster) });
  }
}

async function loadObservationRecords(
  command: W6EnterObservationCommand | W6ObservationCheckpointCommand | W6ArchiveObservationCommand,
  ports: W6ImprovementPorts,
): Promise<{
  cluster: RuntimeProblemCluster;
  improvement: RuntimeImprovementProject;
  history: W6History;
}> {
  const [cluster, improvement, history] = await Promise.all([
    ports.repository.findW6ClusterById(command.cluster_id),
    ports.repository.findW6ImprovementById(command.improvement_id),
    ports.repository.getW6History(command.cluster_id),
  ]);
  if (
    !cluster ||
    !improvement ||
    cluster.data_scope !== "synthetic_experiment" ||
    cluster.evidence_class !== "synthetic_experiment" ||
    cluster.source_kind !== "scenario_runtime" ||
    improvement.data_scope !== "synthetic_experiment" ||
    improvement.evidence_class !== "synthetic_experiment" ||
    improvement.source_kind !== "scenario_runtime" ||
    cluster.active_improvement_id !== improvement.improvement_id ||
    improvement.cluster_id !== cluster.cluster_id ||
    !sameCaseIds(cluster.member_case_ids, command.case_ids)
  ) {
    throw new W6ObservationStateError(
      "W6 observation command is not bound to one authoritative synthetic cluster and improvement",
    );
  }
  return { cluster, improvement, history };
}

async function executeEnterObservation(
  command: W6EnterObservationCommand,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  let state: Awaited<ReturnType<typeof loadObservationRecords>>;
  let occurredAt: string;
  try {
    state = await loadObservationRecords(command, ports);
    occurredAt = ports.clock.now().toISOString();
    if (
      state.cluster.status !== "改进中" ||
      state.improvement.status !== "执行中" ||
      state.improvement.current_observation_cycle_id !== null ||
      state.history.observation_cycles.length !== 0 ||
      ports.clock.source !== state.improvement.clock_source
    ) {
      throw new W6ObservationStateError(
        "W6 improvement is not ready for its initial observation cycle",
      );
    }
  } catch (error) {
    const repositoryFailure = !(error instanceof W6ObservationStateError);
    return safeFailure(command, repositoryFailure ? "repository_failure" : "invalid_state", repositoryFailure
      ? "W6 enter-observation could not read its authoritative repository state"
      : "W6 enter-observation requires one unchanged executing synthetic improvement and trusted clock", [
      "preserve_improvement_state",
      "stop_before_observation_authorization",
    ]);
  }
  const transitionSnapshot = snapshotW6AtomicTransition({
    action: "enter_observation",
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: command.improvement_id,
    expected_cluster_fingerprint: createWorkflowEventFingerprint(state.cluster as unknown as JsonValue),
    expected_improvement_fingerprint: createWorkflowEventFingerprint(state.improvement as unknown as JsonValue),
    history_id: ports.ids.nextId("w6-observation-history"),
    receipt_id: ports.ids.nextId("w6-observation-receipt"),
    occurred_at: occurredAt,
    cycle_id: ports.ids.nextId("w6-observation-cycle"),
    clock_source: state.improvement.clock_source,
    reason: command.reason,
  });
  const authorization = await authorizeTransition(command, transitionSnapshot, commandFingerprint, ports);
  if (!authorization.allowed) {
    return safeFailure(command, authorization.error_class, authorization.reason, [
      "preserve_executing_improvement",
      "stop_enter_observation",
    ], {
      cluster: asJson(state.cluster),
      improvement: asJson(state.improvement),
      action_authorization: { state: "denied_or_indeterminate", authorized: false },
    });
  }
  try {
    const committed = await commitAuthorizedTransition(
      command,
      transitionSnapshot,
      authorization,
      ports,
      undefined,
      () => {
        if (
          ports.clock.source !== state.improvement.clock_source ||
          ports.clock.now().toISOString() !== occurredAt
        ) {
          throw new W6ObservationStateError(
            "W6 observation authorization crossed its trusted clock boundary",
          );
        }
      },
    );
    if (committed.outcome === "concurrency_conflict") {
      return safeFailure(command, "concurrency_conflict", "W6 cluster or improvement changed during observation authorization", [
        "preserve_current_improvement_state",
        "discard_stale_observation_transition",
      ], {
        cluster: asJson(committed.cluster),
        improvement: committed.improvement ? asJson(committed.improvement) : null,
        receipt: asJson(committed.receipt),
      });
    }
    return successfulResult(
      command,
      "completed",
      [
        "record_authorized_observation_entry",
        "open_trusted_observation_cycle",
        "preserve_case_and_work_order_state",
      ],
      {
        commit_outcome: committed.outcome,
        cluster: asJson(committed.cluster),
        improvement: committed.improvement ? asJson(committed.improvement) : null,
        observation_cycle: committed.observation_cycle ? asJson(committed.observation_cycle) : null,
        history: asJson(committed.history),
        receipt: asJson(committed.receipt),
        action_authorization: { state: "authorized", authorized: true },
      },
      { previous: "改进中", next: "观察中" },
    );
  } catch (error) {
    const clockBoundaryChanged = error instanceof W6ObservationStateError;
    return safeFailure(
      command,
      clockBoundaryChanged ? "invalid_state" : "authorization_capability_invalid",
      clockBoundaryChanged
        ? "W6 observation authorization crossed its trusted clock boundary before commit"
        : "W6 observation authorization capability or transition was rejected",
      [
        "preserve_executing_improvement",
        "stop_enter_observation",
      ],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }
}

function observationExpectedAt(openedAt: string, horizonDays: 7 | 30): string {
  const opened = Date.parse(openedAt);
  if (!Number.isFinite(opened)) throw new Error("W6 observation cycle opened_at is invalid");
  return new Date(opened + horizonDays * 24 * 60 * 60 * 1000).toISOString();
}

async function deriveRecurrenceCaseIds(
  cycle: W6History["observation_cycles"][number],
  history: W6History,
  expectedAt: string,
  repository: W6ImprovementRepository,
): Promise<string[]> {
  const sources = new Set<string>();
  if (cycle.trigger === "recurrence_reopen") {
    for (const caseId of cycle.triggering_case_ids) sources.add(caseId);
  }
  const intakeCaseIds = history.active_recurrence_intakes
    .filter((record) => record.cycle_id === cycle.cycle_id)
    .flatMap((record) => record.triggering_case_ids);
  const contexts = await Promise.all(intakeCaseIds.map(async (caseId) =>
    validateClosedContext(await repository.getW6ClosedCaseContext(caseId), caseId)
  ));
  for (const context of contexts) {
    const closedAt = context.case_record.closed_at;
    if (
      closedAt !== null &&
      Date.parse(closedAt) > Date.parse(cycle.opened_at) &&
      Date.parse(closedAt) <= Date.parse(expectedAt)
    ) {
      sources.add(context.case_record.case_id);
    }
  }
  return [...sources].sort((left, right) => left.localeCompare(right));
}

async function executeObservationCheckpoint(
  command: W6ObservationCheckpointCommand,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  const horizonDays = command.action === "record_day_7" ? 7 : 30;
  let state: Awaited<ReturnType<typeof loadObservationRecords>>;
  let cycle: W6History["observation_cycles"][number];
  let expectedAt: string;
  let recurrenceCaseIds: string[];
  try {
    state = await loadObservationRecords(command, ports);
    const activeCycle = state.history.observation_cycles.at(-1);
    if (
      state.cluster.status !== "观察中" ||
      state.improvement.status !== "观察中" ||
      state.improvement.current_observation_cycle_id !== command.cycle_id ||
      !activeCycle ||
      activeCycle.cycle_id !== command.cycle_id ||
      activeCycle.cluster_id !== command.cluster_id ||
      activeCycle.improvement_id !== command.improvement_id ||
      ports.clock.source !== activeCycle.clock_source
    ) {
      throw new W6ObservationStateError("W6 checkpoint does not target the active observation cycle");
    }
    cycle = activeCycle;
    expectedAt = observationExpectedAt(cycle.opened_at, horizonDays);
    if (ports.clock.now().toISOString() !== expectedAt) {
      throw new W6ObservationStateError("W6 checkpoint did not run at the exact trusted horizon");
    }
    recurrenceCaseIds = await deriveRecurrenceCaseIds(cycle, state.history, expectedAt, ports.repository);
    const day7 = state.history.observation_checkpoints.find((record) =>
      record.cycle_id === cycle.cycle_id && record.horizon_days === 7
    );
    if (
      (horizonDays === 30 && !day7) ||
      (
        horizonDays === 30 &&
        day7?.recurrence_case_ids.some((caseId) => !recurrenceCaseIds.includes(caseId))
      ) ||
      (
        command.related_task_volume !== null &&
        command.related_task_volume < recurrenceCaseIds.length
      )
    ) {
      throw new W6ObservationStateError(
        "W6 checkpoint lacks the required cumulative observation facts or denominator",
      );
    }
  } catch (error) {
    const repositoryFailure = !(error instanceof W6ObservationStateError);
    return safeFailure(command, repositoryFailure ? "repository_failure" : "invalid_state", repositoryFailure
      ? `W6 day-${horizonDays} checkpoint could not read authoritative repository facts`
      : `W6 day-${horizonDays} checkpoint requires the exact active cycle, trusted clock, and cumulative recurrence facts`, [
      "preserve_observation_state",
      `stop_day_${horizonDays}_checkpoint`,
    ]);
  }
  const transitionSnapshot = snapshotW6AtomicTransition({
    action: command.action,
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: command.improvement_id,
    expected_cluster_fingerprint: createWorkflowEventFingerprint(state.cluster as unknown as JsonValue),
    expected_improvement_fingerprint: createWorkflowEventFingerprint(state.improvement as unknown as JsonValue),
    history_id: ports.ids.nextId(`w6-day-${horizonDays}-history`),
    receipt_id: ports.ids.nextId(`w6-day-${horizonDays}-receipt`),
    occurred_at: expectedAt,
    cycle_id: cycle.cycle_id,
    clock_source: cycle.clock_source,
    recurrence_case_ids: recurrenceCaseIds,
    related_task_volume: command.related_task_volume,
    checkpoint_id: ports.ids.nextId(`w6-day-${horizonDays}-checkpoint`),
  });
  try {
    const committed = await ports.repository.runW6ResourcesExclusive(resourcesFor(command), () => {
      if (
        ports.clock.source !== cycle.clock_source ||
        ports.clock.now().toISOString() !== expectedAt
      ) {
        throw new W6ObservationStateError(
          "W6 checkpoint crossed its exact trusted-clock boundary while waiting for resources",
        );
      }
      return ports.repository.commitW6Transition(transitionSnapshot);
    });
    if (committed.outcome === "concurrency_conflict") {
      return safeFailure(command, "concurrency_conflict", `W6 observation state changed before day-${horizonDays} commit`, [
        "preserve_current_observation_state",
        `discard_stale_day_${horizonDays}_checkpoint`,
      ], {
        cluster: asJson(committed.cluster),
        improvement: committed.improvement ? asJson(committed.improvement) : null,
        receipt: asJson(committed.receipt),
      });
    }
    return successfulResult(
      command,
      "completed",
      [
        `record_deterministic_day_${horizonDays}_checkpoint`,
        "derive_recurrence_sources_from_authorized_history",
        "preserve_case_work_order_and_sla_state",
      ],
      {
        commit_outcome: committed.outcome,
        cluster: asJson(committed.cluster),
        improvement: committed.improvement ? asJson(committed.improvement) : null,
        observation_cycle: committed.observation_cycle ? asJson(committed.observation_cycle) : null,
        observation_checkpoint: committed.observation_checkpoint
          ? asJson(committed.observation_checkpoint)
          : null,
        history: asJson(committed.history),
        receipt: asJson(committed.receipt),
        action_authorization: { state: "not_required", authorized: false },
      },
      { previous: "观察中", next: "观察中" },
    );
  } catch (error) {
    const clockBoundaryChanged = error instanceof W6ObservationStateError;
    return safeFailure(
      command,
      clockBoundaryChanged ? "invalid_state" : "repository_failure",
      clockBoundaryChanged
        ? `W6 day-${horizonDays} checkpoint crossed its exact trusted-clock boundary before commit`
        : `W6 day-${horizonDays} checkpoint was rejected without a partial observation write`,
      [
        "preserve_observation_state",
        `stop_day_${horizonDays}_checkpoint`,
      ],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }
}

function checkpointMatchesCycle(
  checkpoint: W6History["observation_checkpoints"][number],
  cycle: W6History["observation_cycles"][number],
  horizonDays: 7 | 30,
): boolean {
  const expectedAt = observationExpectedAt(cycle.opened_at, horizonDays);
  return checkpoint.cluster_id === cycle.cluster_id &&
    checkpoint.improvement_id === cycle.improvement_id &&
    checkpoint.cycle_id === cycle.cycle_id &&
    checkpoint.horizon_days === horizonDays &&
    checkpoint.clock_source === cycle.clock_source &&
    checkpoint.window_opened_at === cycle.opened_at &&
    checkpoint.expected_at === expectedAt &&
    checkpoint.recorded_at === expectedAt;
}

async function executeArchiveObservation(
  command: W6ArchiveObservationCommand,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  let state: Awaited<ReturnType<typeof loadObservationRecords>>;
  let cycle: W6History["observation_cycles"][number];
  let occurredAt: string;
  try {
    state = await loadObservationRecords(command, ports);
    occurredAt = ports.clock.now().toISOString();
    const activeCycle = state.history.observation_cycles.at(-1);
    const cycleCheckpoints = state.history.observation_checkpoints.filter((record) =>
      record.cycle_id === command.cycle_id
    );
    const day7Checkpoints = cycleCheckpoints.filter((record) => record.horizon_days === 7);
    const day30Checkpoints = cycleCheckpoints.filter((record) => record.horizon_days === 30);
    const day7 = day7Checkpoints[0];
    const day30 = day30Checkpoints[0];
    if (
      state.cluster.status !== "观察中" ||
      state.improvement.status !== "观察中" ||
      state.improvement.current_observation_cycle_id !== command.cycle_id ||
      !activeCycle ||
      activeCycle.cycle_id !== command.cycle_id ||
      activeCycle.cluster_id !== command.cluster_id ||
      activeCycle.improvement_id !== command.improvement_id ||
      activeCycle.clock_source !== state.improvement.clock_source ||
      ports.clock.source !== activeCycle.clock_source ||
      cycleCheckpoints.length !== 2 ||
      day7Checkpoints.length !== 1 ||
      day30Checkpoints.length !== 1 ||
      !day7 ||
      !day30 ||
      !checkpointMatchesCycle(day7, activeCycle, 7) ||
      !checkpointMatchesCycle(day30, activeCycle, 30) ||
      Date.parse(occurredAt) < Date.parse(day30.recorded_at)
    ) {
      throw new W6ObservationStateError(
        "W6 archive requires the latest active cycle with exact day-7/day-30 trusted-clock checkpoints",
      );
    }
    cycle = activeCycle;
  } catch (error) {
    const repositoryFailure = !(error instanceof W6ObservationStateError);
    return safeFailure(
      command,
      repositoryFailure ? "repository_failure" : "invalid_state",
      repositoryFailure
        ? "W6 archive could not read its authoritative repository state"
        : "W6 archive requires one unchanged observed cycle, exact checkpoints, and the trusted clock",
      ["preserve_observation_state", "stop_before_archive_authorization"],
    );
  }

  const transitionSnapshot = snapshotW6AtomicTransition({
    action: "archive_observation",
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: command.improvement_id,
    expected_cluster_fingerprint: createWorkflowEventFingerprint(state.cluster as unknown as JsonValue),
    expected_improvement_fingerprint: createWorkflowEventFingerprint(state.improvement as unknown as JsonValue),
    history_id: ports.ids.nextId("w6-archive-history"),
    receipt_id: ports.ids.nextId("w6-archive-receipt"),
    occurred_at: occurredAt,
    cycle_id: cycle.cycle_id,
    human_conclusion: command.human_conclusion,
    reason: command.reason,
  });
  const authorization = await authorizeTransition(command, transitionSnapshot, commandFingerprint, ports);
  if (!authorization.allowed) {
    return safeFailure(command, authorization.error_class, authorization.reason, [
      "preserve_observation_state",
      "stop_archive_observation",
    ], {
      cluster: asJson(state.cluster),
      improvement: asJson(state.improvement),
      action_authorization: { state: "denied_or_indeterminate", authorized: false },
    });
  }
  try {
    const committed = await commitAuthorizedTransition(
      command,
      transitionSnapshot,
      authorization,
      ports,
      undefined,
      () => {
        if (
          ports.clock.source !== cycle.clock_source ||
          ports.clock.now().toISOString() !== occurredAt
        ) {
          throw new W6ObservationStateError(
            "W6 archive authorization crossed its trusted clock boundary",
          );
        }
      },
    );
    if (committed.outcome === "concurrency_conflict") {
      return safeFailure(
        command,
        "concurrency_conflict",
        "W6 observation state changed during archive authorization; stale archive was not written",
        ["preserve_current_observation_state", "discard_stale_archive_transition"],
        {
          cluster: asJson(committed.cluster),
          improvement: committed.improvement ? asJson(committed.improvement) : null,
          receipt: asJson(committed.receipt),
        },
      );
    }
    return successfulResult(
      command,
      "completed",
      [
        "record_authorized_observation_archive",
        "preserve_observation_cycles_and_checkpoints",
        "preserve_case_work_order_and_sla_state",
      ],
      {
        commit_outcome: committed.outcome,
        cluster: asJson(committed.cluster),
        improvement: committed.improvement ? asJson(committed.improvement) : null,
        observation_cycle: committed.observation_cycle ? asJson(committed.observation_cycle) : null,
        history: asJson(committed.history),
        receipt: asJson(committed.receipt),
        action_authorization: { state: "authorized", authorized: true },
      },
      { previous: "观察中", next: "已归档" },
    );
  } catch (error) {
    const clockBoundaryChanged = error instanceof W6ObservationStateError;
    return safeFailure(
      command,
      clockBoundaryChanged ? "invalid_state" : "authorization_capability_invalid",
      clockBoundaryChanged
        ? "W6 archive authorization crossed its trusted clock boundary before commit"
        : "W6 archive authorization capability or transition was rejected",
      ["preserve_observation_state", "stop_archive_observation"],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }
}

async function loadReopenRecords(
  command: W6ReopenRecurrenceCommand,
  ports: W6ImprovementPorts,
): Promise<{
  cluster: RuntimeProblemCluster;
  improvement: RuntimeImprovementProject;
  history: W6History;
  clusters: RuntimeProblemCluster[];
}> {
  const [cluster, improvement, history, clusters] = await Promise.all([
    ports.repository.findW6ClusterById(command.cluster_id),
    ports.repository.findW6ImprovementById(command.improvement_id),
    ports.repository.getW6History(command.cluster_id),
    ports.repository.listW6Clusters(),
  ]);
  if (
    !cluster ||
    !improvement ||
    cluster.data_scope !== "synthetic_experiment" ||
    cluster.evidence_class !== "synthetic_experiment" ||
    cluster.source_kind !== "scenario_runtime" ||
    improvement.data_scope !== "synthetic_experiment" ||
    improvement.evidence_class !== "synthetic_experiment" ||
    improvement.source_kind !== "scenario_runtime" ||
    cluster.active_improvement_id !== improvement.improvement_id ||
    improvement.cluster_id !== cluster.cluster_id
  ) {
    throw new W6ObservationStateError(
      "W6 recurrence reopen is not bound to one authoritative synthetic cluster and improvement",
    );
  }
  return { cluster, improvement, history, clusters };
}

async function loadReopenTriggerContexts(
  command: W6ReopenRecurrenceCommand,
  repository: W6ImprovementRepository,
): Promise<W6ClosedCaseContext[]> {
  const contexts = await Promise.all(command.triggering_case_ids.map(async (caseId) => {
    let context: W6ClosedCaseContext;
    try {
      context = await repository.getW6ClosedCaseContext(caseId);
    } catch (error) {
      throw error;
    }
    try {
      return validateClosedContext(context, caseId);
    } catch {
      throw new W6TransitionFailure(
        "w5_closure_provenance_failure",
        `W6 case ${caseId} closure context failed the closed synthetic boundary`,
      );
    }
  }));
  return contexts.sort((left, right) =>
    left.case_record.case_id.localeCompare(right.case_record.case_id)
  );
}

function recurrenceReplayQuery(
  command: W6ReopenRecurrenceCommand,
  commandFingerprint: string,
): W6RecurrenceReplayQuery {
  return {
    stable_semantic_fingerprint: fingerprintW6RecurrenceStableSemantic(command),
    command_fingerprint: commandFingerprint,
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: command.improvement_id,
    triggering_case_ids: [...command.triggering_case_ids],
    reason: command.reason,
  };
}

function classifyReopenRepositoryError(error: unknown): {
  error_class:
    | "authorization_capability_invalid"
    | "concurrency_conflict"
    | "w5_closure_provenance_failure"
    | "invalid_state"
    | "repository_failure";
  message: string;
} {
  if (error instanceof W6AuthorizationCapabilityError) {
    return {
      error_class: "authorization_capability_invalid",
      message: "W6 recurrence authorization grant, claims, binding, or consumption was rejected",
    };
  }
  if (error instanceof W6TransitionFailure) {
    const messages = {
      concurrency_conflict: "W6 recurrence state changed concurrently after authorization",
      w5_closure_provenance_failure: "W6 recurrence trigger lost repository-issued W5 closure provenance",
      invalid_state: "W6 recurrence chronology or authoritative state changed after authorization",
    } as const;
    return { error_class: error.error_class, message: messages[error.error_class] };
  }
  if (error instanceof W6ObservationStateError) {
    return {
      error_class: "invalid_state",
      message: "W6 recurrence authorization crossed its trusted state boundary before commit",
    };
  }
  return {
    error_class: "repository_failure",
    message: "W6 recurrence repository rejected the transition for an unclassified infrastructure reason",
  };
}

async function executeAuthorizedRecurrenceReplay(
  command: W6ReopenRecurrenceCommand,
  query: W6RecurrenceReplayQuery,
  privateProofFingerprint: string,
  authorization: Extract<Awaited<ReturnType<typeof authorizeRecurrenceRequest>>, { allowed: true }>,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  try {
    const committed = await ports.repository.runW6ResourcesExclusive(
      resourcesFor(command),
      () => ports.repository.runAuthorizedW6Action(
        { grant: authorization.decision.grant, claims: authorization.claims },
        () => ports.repository.resolveAuthorizedW6RecurrenceReplay({
          ...query,
          target_fingerprint: authorization.claims.target_fingerprint,
          private_proof_fingerprint: privateProofFingerprint,
        }),
      ),
    );
    return successfulResult(
      command,
      "idempotent",
      [
        "return_existing_authorized_recurrence_reopen",
        "do_not_generate_recurrence_business_ids",
        "do_not_repeat_W6_domain_writes",
        "preserve_current_cluster_and_improvement_state",
        "do_not_merge_cases",
        "do_not_relink_feedback",
      ],
      {
        commit_outcome: "idempotent",
        semantic_replayed: true,
        existing_result: {
          cluster_id: committed.cluster.cluster_id,
          cluster_status: committed.cluster.status,
          improvement_id: committed.improvement?.improvement_id ?? null,
          improvement_status: committed.improvement?.status ?? null,
        },
      },
      { previous: committed.cluster.status, next: committed.cluster.status },
    );
  } catch (error) {
    const classified = classifyReopenRepositoryError(error);
    return safeFailure(
      command,
      classified.error_class,
      classified.message,
      ["preserve_current_W6_state", "stop_recurrence_semantic_replay"],
    );
  }
}

async function consumeAuthorizedRecurrenceRequest(
  command: W6ReopenRecurrenceCommand,
  authorization: Extract<Awaited<ReturnType<typeof authorizeRecurrenceRequest>>, { allowed: true }>,
  ports: W6ImprovementPorts,
): Promise<void> {
  await ports.repository.runW6ResourcesExclusive(
    resourcesFor(command),
    () => ports.repository.runAuthorizedW6Action(
      { grant: authorization.decision.grant, claims: authorization.claims },
      async () => undefined,
    ),
  );
}

async function failAfterAuthorizedRecurrenceRequest(
  command: W6ReopenRecurrenceCommand,
  authorization: Extract<Awaited<ReturnType<typeof authorizeRecurrenceRequest>>, { allowed: true }>,
  ports: W6ImprovementPorts,
  errorClass: Exclude<W6ImprovementErrorClass, "none">,
  message: string,
  actions: string[],
  output: Record<string, JsonValue> = {},
): Promise<WorkflowResult<JsonValue>> {
  try {
    await consumeAuthorizedRecurrenceRequest(command, authorization, ports);
  } catch (error) {
    const classified = classifyReopenRepositoryError(error);
    return safeFailure(
      command,
      classified.error_class,
      classified.message,
      ["preserve_current_W6_state", "stop_recurrence_request_after_authorization"],
    );
  }
  return safeFailure(command, errorClass, message, actions, output);
}

async function executeReopenRecurrence(
  command: W6ReopenRecurrenceCommand,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  const replayQuery = recurrenceReplayQuery(command, commandFingerprint);
  const authorization = await authorizeRecurrenceRequest(command, commandFingerprint, ports);
  if (!authorization.allowed) {
    return safeFailure(
      command,
      authorization.error_class,
      authorization.error_class === "authorization_failure"
        ? "W6 recurrence request authorization was denied"
        : "W6 recurrence request authorization could not be verified",
      ["preserve_current_W6_state", "stop_recurrence_request_before_private_lookup"],
      { action_authorization: { state: "denied_or_indeterminate", authorized: false } },
    );
  }
  let replayCandidate: W6RecurrenceReplayCandidate;
  try {
    replayCandidate = await ports.repository.findW6RecurrenceReplayCandidate(replayQuery);
  } catch {
    return failAfterAuthorizedRecurrenceRequest(
      command,
      authorization,
      ports,
      "repository_failure",
      "W6 recurrence replay proof could not be read from the authoritative repository",
      ["preserve_current_W6_state", "stop_after_recurrence_request_authorization"],
    );
  }
  if (replayCandidate.outcome === "conflict") {
    return failAfterAuthorizedRecurrenceRequest(
      command,
      authorization,
      ports,
      "event_conflict",
      "W6 recurrence trigger has a committed result with different stable semantics",
      ["preserve_current_W6_state", "reject_cross_event_recurrence_semantic_conflict"],
    );
  }
  if (replayCandidate.outcome === "candidate") {
    return executeAuthorizedRecurrenceReplay(
      command,
      replayQuery,
      replayCandidate.target_fingerprint,
      authorization,
      ports,
    );
  }
  let state: Awaited<ReturnType<typeof loadReopenRecords>>;
  let occurredAt: string;
  let occurredClockSource: ClockSource;
  let latestCycle: W6History["observation_cycles"][number];
  let archiveReceipt: W6History["receipts"][number];
  try {
    state = await loadReopenRecords(command, ports);
    occurredClockSource = ports.clock.source;
    occurredAt = ports.clock.now().toISOString();
    const cycle = state.history.observation_cycles.at(-1);
    const receipt = state.history.receipts.filter((record) =>
      record.action === "archive_observation" &&
      record.improvement_id === command.improvement_id
    ).at(-1);
    const expectedUnion = [...new Set([
      ...state.cluster.member_case_ids,
      ...command.triggering_case_ids,
    ])].sort((left, right) => left.localeCompare(right));
    const otherClusterOwnsTrigger = state.clusters.some((cluster) =>
      cluster.cluster_id !== command.cluster_id &&
      command.triggering_case_ids.some((caseId) => cluster.member_case_ids.includes(caseId))
    );
    if (
      state.cluster.status !== "已归档" ||
      state.improvement.status !== "已完成" ||
      otherClusterOwnsTrigger
    ) {
      throw new W6TransitionFailure(
        "concurrency_conflict",
        "W6 recurrence target or trigger ownership is no longer the archived authorization target",
      );
    }
    if (
      !cycle ||
      state.improvement.current_observation_cycle_id !== cycle.cycle_id ||
      cycle.cluster_id !== command.cluster_id ||
      cycle.improvement_id !== command.improvement_id ||
      cycle.clock_source !== state.improvement.clock_source ||
      !receipt ||
      state.history.receipts.at(-1)?.receipt_id !== receipt.receipt_id ||
      receipt.cycle_id !== cycle.cycle_id ||
      !Number.isFinite(Date.parse(receipt.committed_at)) ||
      occurredClockSource !== state.improvement.clock_source ||
      Date.parse(occurredAt) < Math.max(
        Date.parse(state.cluster.updated_at),
        Date.parse(state.improvement.updated_at),
      ) ||
      command.triggering_case_ids.some((caseId) => state.cluster.member_case_ids.includes(caseId)) ||
      !sameCaseIds(command.case_ids, expectedUnion)
    ) {
      throw new W6ObservationStateError(
        "W6 recurrence reopen requires one latest archived cycle, exact disjoint union, and trusted clock",
      );
    }
    latestCycle = cycle;
    archiveReceipt = receipt;
  } catch (error) {
    const classified = classifyReopenRepositoryError(error);
    return failAfterAuthorizedRecurrenceRequest(
      command,
      authorization,
      ports,
      classified.error_class,
      classified.message,
      ["preserve_archived_state", "stop_before_recurrence_provenance_check"],
    );
  }

  let triggerContexts: W6ClosedCaseContext[];
  try {
    triggerContexts = await loadReopenTriggerContexts(command, ports.repository);
  } catch (error) {
    const classified = classifyReopenRepositoryError(error);
    return failAfterAuthorizedRecurrenceRequest(
      command,
      authorization,
      ports,
      classified.error_class,
      classified.message,
      ["preserve_archived_state", "stop_before_recurrence_authorization"],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }
  if (triggerContexts.some((context) => {
    const closedAt = context.case_record.closed_at;
    return closedAt === null ||
      !Number.isFinite(Date.parse(closedAt)) ||
      Date.parse(closedAt) <= Date.parse(archiveReceipt.committed_at) ||
      Date.parse(closedAt) > Date.parse(occurredAt);
  })) {
    return failAfterAuthorizedRecurrenceRequest(
      command,
      authorization,
      ports,
      "invalid_state",
      "W6 recurrence triggers must close strictly after archive and no later than the trusted reopen time",
      ["preserve_archived_state", "stop_before_recurrence_authorization"],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }

  const transitionSnapshot = snapshotW6AtomicTransition({
    action: "reopen_recurrence",
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: command.improvement_id,
    expected_cluster_fingerprint: createWorkflowEventFingerprint(state.cluster as unknown as JsonValue),
    expected_improvement_fingerprint: createWorkflowEventFingerprint(state.improvement as unknown as JsonValue),
    history_id: ports.ids.nextId("w6-recurrence-history"),
    receipt_id: ports.ids.nextId("w6-recurrence-receipt"),
    occurred_at: occurredAt,
    cycle_id: ports.ids.nextId("w6-recurrence-cycle"),
    triggering_case_ids: [...command.triggering_case_ids],
    clock_source: latestCycle.clock_source,
    reason: command.reason,
  });
  try {
    const committed = await commitAuthorizedTransition(
      command,
      transitionSnapshot,
      authorization,
      ports,
      undefined,
      () => {
        if (
          ports.clock.source !== latestCycle.clock_source ||
          ports.clock.now().toISOString() !== occurredAt
        ) {
          throw new W6ObservationStateError(
            "W6 recurrence reopen authorization crossed its trusted clock boundary",
          );
        }
      },
      () => ports.repository.commitW6RecurrenceTransition(
        transitionSnapshot as Extract<W6AtomicTransition, { action: "reopen_recurrence" }>,
        replayQuery.stable_semantic_fingerprint,
      ),
    );
    if (committed.outcome === "concurrency_conflict") {
      return safeFailure(
        command,
        "concurrency_conflict",
        "W6 archived state changed during recurrence authorization; stale reopen was not written",
        ["preserve_current_archived_state", "discard_stale_recurrence_transition"],
        {
          cluster: asJson(committed.cluster),
          improvement: committed.improvement ? asJson(committed.improvement) : null,
          receipt: asJson(committed.receipt),
        },
      );
    }
    return successfulResult(
      command,
      "completed",
      [
        committed.outcome === "idempotent"
          ? "return_existing_authorized_recurrence_reopen"
          : "record_authorized_recurrence_reopen",
        "open_new_trusted_observation_cycle",
        "extend_private_cluster_membership",
        "preserve_case_feedback_work_order_and_sla_state",
        "do_not_merge_cases",
        "do_not_relink_feedback",
      ],
      {
        commit_outcome: committed.outcome,
        cluster: asJson(committed.cluster),
        improvement: committed.improvement ? asJson(committed.improvement) : null,
        observation_cycle: committed.observation_cycle ? asJson(committed.observation_cycle) : null,
        history: asJson(committed.history),
        receipt: asJson(committed.receipt),
        action_authorization: { state: "authorized", authorized: true },
      },
      { previous: "已归档", next: "观察中" },
    );
  } catch (error) {
    const classified = classifyReopenRepositoryError(error);
    return safeFailure(
      command,
      classified.error_class,
      classified.message,
      ["preserve_archived_state", "stop_recurrence_reopen"],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }
}

async function loadActiveObservationState(
  command: W6ActiveObservationRecurrenceIntakeCommand,
  ports: W6ImprovementPorts,
): Promise<{
  cluster: RuntimeProblemCluster;
  improvement: RuntimeImprovementProject;
  history: W6History;
  state_fingerprint: string;
}> {
  const [cluster, improvement, history] = await Promise.all([
    ports.repository.findW6ClusterById(command.cluster_id),
    ports.repository.findW6ImprovementById(command.improvement_id),
    ports.repository.getW6History(command.cluster_id),
  ]);
  if (
    !cluster ||
    !improvement ||
    cluster.data_scope !== "synthetic_experiment" ||
    cluster.evidence_class !== "synthetic_experiment" ||
    improvement.data_scope !== "synthetic_experiment" ||
    improvement.evidence_class !== "synthetic_experiment" ||
    cluster.status !== "观察中" ||
    improvement.status !== "观察中" ||
    cluster.active_improvement_id !== improvement.improvement_id ||
    improvement.cluster_id !== cluster.cluster_id ||
    improvement.current_observation_cycle_id !== command.cycle_id ||
    history.observation_cycles.at(-1)?.cycle_id !== command.cycle_id
  ) {
    throw new Error("W6 active recurrence intake requires one authoritative active observation cycle");
  }
  const expectedUnion = [...new Set([
    ...cluster.member_case_ids,
    ...command.triggering_case_ids,
  ])].sort((left, right) => left.localeCompare(right));
  if (
    !sameCaseIds(command.case_ids, expectedUnion) ||
    command.triggering_case_ids.some((caseId) => cluster.member_case_ids.includes(caseId))
  ) {
    throw new Error("W6 active recurrence intake must bind the exact disjoint member union");
  }
  const receipt = history.receipts.at(-1);
  if (!receipt || !/^[a-f0-9]{64}$/iu.test(receipt.state_fingerprint)) {
    throw new Error("W6 active recurrence intake requires the latest immutable state receipt");
  }
  return {
    cluster,
    improvement,
    history,
    state_fingerprint: receipt.state_fingerprint,
  };
}

async function executeActiveObservationRecurrenceIntake(
  command: W6ActiveObservationRecurrenceIntakeCommand,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  let state: Awaited<ReturnType<typeof loadActiveObservationState>>;
  let contexts: W6ClosedCaseContext[];
  try {
    state = await loadActiveObservationState(command, ports);
    contexts = await loadClosedContexts(command, ports.repository);
  } catch {
    return safeFailure(
      command,
      "w5_closure_provenance_failure",
      "W6 active recurrence intake requires one unchanged synthetic observation state and repository-issued W5 closures",
      ["preserve_observation_state", "stop_before_N5", "do_not_add_cluster_members"],
    );
  }

  let request: AiNodeRunRequest<JsonValue>;
  let envelope: AiNodeEnvelope<N5CrossEventPayload>;
  try {
    request = await buildActiveIntakeN5Request(
      command,
      contexts,
      ports.repository,
      state.cluster.member_case_ids,
    );
    envelope = validatedEnvelope<N5CrossEventPayload>(
      await ports.ai_runner.run(cloneJson(request)),
      request,
    );
    validateActiveIntakeN5Selection(envelope, command);
  } catch {
    return safeFailure(
      command,
      "n5_failure",
      "N5 cross-event clustering did not yield the exact existing-cluster recurrence candidate",
      ["preserve_observation_state", "stop_before_recurrence_authorization", "do_not_add_cluster_members"],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }

  const transitionSnapshot = snapshotW6AtomicTransition({
    action: "intake_active_observation_recurrence",
    case_ids: [...command.case_ids],
    cluster_id: command.cluster_id,
    improvement_id: command.improvement_id,
    expected_cluster_fingerprint: createWorkflowEventFingerprint(state.cluster as unknown as JsonValue),
    expected_improvement_fingerprint: createWorkflowEventFingerprint(state.improvement as unknown as JsonValue),
    expected_w6_state_fingerprint: state.state_fingerprint,
    history_id: ports.ids.nextId("w6-active-recurrence-history"),
    receipt_id: ports.ids.nextId("w6-active-recurrence-receipt"),
    occurred_at: ports.clock.now().toISOString(),
    cycle_id: command.cycle_id,
    triggering_case_ids: [...command.triggering_case_ids],
    intake_id: ports.ids.nextId("w6-active-recurrence-intake"),
    clock_source: ports.clock.source,
    n5_validation_fingerprint: createW6N5ValidationFingerprint(
      request,
      envelope as AiNodeEnvelope<JsonValue>,
    ),
    reason: command.reason,
  });
  let aiValidation: { grant: W6AiValidationGrant; claims: W6AiValidationGrantClaims };
  try {
    aiValidation = ports.repository.validateAndIssueW6AiAction({
      event_id: command.event_id,
      command_fingerprint: commandFingerprint,
      transition: transitionSnapshot,
      request,
      envelope: envelope as AiNodeEnvelope<JsonValue>,
    });
  } catch {
    return safeFailure(
      command,
      "recurrence_intake_failure",
      "Repository rejected the N5 active-observation recurrence provenance before authorization",
      ["preserve_observation_state", "discard_uncommitted_N5_candidate", "stop_before_recurrence_authorization"],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }

  const authorization = await authorizeTransition(command, transitionSnapshot, commandFingerprint, ports);
  if (!authorization.allowed) {
    return safeFailure(command, authorization.error_class, authorization.reason, [
      "preserve_observation_state",
      "discard_uncommitted_N5_candidate",
      "stop_active_recurrence_intake",
    ], {
      cluster: asJson(state.cluster),
      improvement: asJson(state.improvement),
      action_authorization: { state: "denied_or_indeterminate", authorized: false },
    });
  }
  try {
    const committed = await commitAuthorizedTransition(
      command,
      transitionSnapshot,
      authorization,
      ports,
      aiValidation,
      () => {
        const cycle = state.history.observation_cycles.at(-1);
        const currentTime = ports.clock.now().toISOString();
        const day30ExpectedAt = cycle
          ? new Date(Date.parse(cycle.opened_at) + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null;
        if (
          !cycle ||
          cycle.cycle_id !== command.cycle_id ||
          ports.clock.source !== cycle.clock_source ||
          currentTime < transitionSnapshot.occurred_at ||
          day30ExpectedAt === null ||
          currentTime > day30ExpectedAt
        ) {
          throw new Error("W6 active recurrence authorization crossed its trusted observation clock boundary");
        }
      },
    );
    if (committed.outcome === "concurrency_conflict") {
      return safeFailure(
        command,
        "concurrency_conflict",
        "W6 observation state changed during authorization; stale recurrence intake was not written",
        ["preserve_current_observation_state", "discard_stale_N5_candidate", "stop_active_recurrence_intake"],
        {
          cluster: asJson(committed.cluster),
          improvement: committed.improvement ? asJson(committed.improvement) : null,
          receipt: asJson(committed.receipt),
        },
      );
    }
    return successfulResult(
      command,
      "completed",
      [
        "record_authorized_active_recurrence_intake",
        "extend_private_cluster_membership",
        "preserve_case_and_feedback_records",
        "preserve_observation_cycle",
        "do_not_merge_cases",
        "do_not_relink_feedback",
      ],
      {
        commit_outcome: committed.outcome,
        cluster: asJson(committed.cluster),
        improvement: committed.improvement ? asJson(committed.improvement) : null,
        active_recurrence_intake: committed.active_recurrence_intake
          ? asJson(committed.active_recurrence_intake)
          : null,
        observation_cycle: committed.observation_cycle ? asJson(committed.observation_cycle) : null,
        history: asJson(committed.history),
        receipt: asJson(committed.receipt),
        action_authorization: { state: "authorized", authorized: true },
      },
      { previous: "观察中", next: "观察中" },
    );
  } catch {
    return safeFailure(
      command,
      "authorization_capability_invalid",
      "W6 recurrence authorization, N5 validation capability, or repository transition was rejected",
      ["preserve_observation_state", "discard_uncommitted_N5_candidate", "stop_active_recurrence_intake"],
      { cluster: asJson(state.cluster), improvement: asJson(state.improvement) },
    );
  }
}

async function executeCommand(
  command: W6ImprovementCommand,
  commandFingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  if (command.action === "create_cluster_candidate") return executeCreate(command, ports);
  if (command.action === "review_candidate") return executeReview(command, commandFingerprint, ports);
  if (command.action === "start_improvement") return executeStart(command, commandFingerprint, ports);
  if (command.action === "enter_observation") {
    return executeEnterObservation(command, commandFingerprint, ports);
  }
  if (command.action === "record_day_7" || command.action === "record_day_30") {
    return executeObservationCheckpoint(command, ports);
  }
  if (command.action === "archive_observation") {
    return executeArchiveObservation(command, commandFingerprint, ports);
  }
  if (command.action === "reopen_recurrence") {
    return executeReopenRecurrence(command, commandFingerprint, ports);
  }
  if (command.action === "intake_active_observation_recurrence") {
    return executeActiveObservationRecurrenceIntake(command, commandFingerprint, ports);
  }
  return safeFailure(command, "invalid_command", "W6 action is not implemented", [
    "reject_unimplemented_action",
  ]);
}

function replayResult(
  result: WorkflowResult<JsonValue>,
  action: W6ImprovementCommand["action"],
): WorkflowResult<JsonValue> {
  const cloned = cloneJson(result);
  const replayActions = isObservationBatchEAction(action)
    ? [
        "return_existing_W6_observation_batch_e_result",
        "do_not_repeat_W6_observation_effects",
      ]
    : isObservationBatchDAction(action)
      ? [
        "return_existing_W6_observation_batch_d_result",
        "do_not_repeat_W6_observation_effects",
      ]
      : [
          "return_existing_W6_batch_c_result",
          "do_not_repeat_N5_or_N6",
        ];
  return {
    ...cloned,
    status: cloned.status === "completed" || cloned.status === "needs_human" ? "idempotent" : cloned.status,
    actions: [
      ...replayActions,
      "do_not_repeat_authorization",
      "do_not_repeat_domain_writes",
      ...cloned.actions,
    ],
    output: {
      ...(isObject(cloned.output) ? cloned.output : {}),
      event_replayed: true,
    },
  };
}

function workflowAuditId(fingerprint: string): string {
  return `W6-BATCH-C-WORKFLOW-AUDIT-${fingerprint}`;
}

function withWorkflowAuditState(
  result: WorkflowResult<JsonValue>,
  auditId: string,
  state: "recorded" | "pending",
  eventResultCached: boolean,
): WorkflowResult<JsonValue> {
  const output = isObject(result.output) ? result.output : {};
  const pending = state === "pending";
  return {
    ...result,
    actions: pending
      ? [...new Set([
          ...result.actions,
          "workflow_audit_pending",
          "retry_audit_without_repeating_business_effects",
        ])]
      : result.actions.filter((action) =>
          action !== "workflow_audit_pending" &&
          action !== "retry_audit_without_repeating_business_effects"
        ),
    output: {
      ...output,
      workflow_audit_id: auditId,
      audit_state: state,
      audit_pending: pending,
      event_result_cached: eventResultCached,
    },
  };
}

function replaceCachedResult(
  target: WorkflowResult<JsonValue>,
  next: WorkflowResult<JsonValue>,
): WorkflowResult<JsonValue> {
  Object.assign(target, cloneJson(next));
  return target;
}

async function appendAudit(
  result: WorkflowResult<JsonValue>,
  auditId: string,
  ports: W6ImprovementPorts,
): Promise<void> {
  const audit: AuditRecord = {
    audit_id: auditId,
    object_ref: { ...result.object_ref },
    category: "workflow",
    occurred_at: ports.clock.now().toISOString(),
    clock_source: ports.clock.source,
    payload: {
      workflow: "W6",
      event_id: result.event_id,
      evidence_class: "synthetic_experiment",
      result: cloneJson(result) as unknown as JsonValue,
      statement_boundary: {
        real_feishu_connected: false,
        enterprise_data_used: false,
        root_cause_is_final: false,
        business_effect_claimed: false,
      },
    },
  };
  await ports.audit.append(cloneJson(audit));
}

async function ensureCachedWorkflowAudit(
  cachedResult: WorkflowResult<JsonValue>,
  fingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  const output = isObject(cachedResult.output) ? cachedResult.output : {};
  if (output.audit_state === "recorded") return cachedResult;
  const auditId = typeof output.workflow_audit_id === "string" && output.workflow_audit_id.length > 0
    ? output.workflow_audit_id
    : workflowAuditId(fingerprint);
  const recorded = withWorkflowAuditState(cachedResult, auditId, "recorded", true);
  try {
    await appendAudit(recorded, auditId, ports);
    return replaceCachedResult(cachedResult, recorded);
  } catch {
    return replaceCachedResult(
      cachedResult,
      withWorkflowAuditState(cachedResult, auditId, "pending", true),
    );
  }
}

async function appendTransientAudit(
  result: WorkflowResult<JsonValue>,
  fingerprint: string,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  const auditId = workflowAuditId(fingerprint);
  const recorded = withWorkflowAuditState(result, auditId, "recorded", false);
  try {
    await appendAudit(recorded, auditId, ports);
    return recorded;
  } catch {
    return withWorkflowAuditState(result, auditId, "pending", false);
  }
}

export async function runW6Improvement(
  command: W6ImprovementCommand,
  ports: W6ImprovementPorts,
): Promise<WorkflowResult<JsonValue>> {
  let authoritativeCommand: W6ImprovementCommand;
  try {
    authoritativeCommand = snapshotCommand(command);
  } catch (error) {
    const message = error instanceof Error ? error.message : "W6 command boundary rejected";
    return invalidCommandResult(message);
  }
  const fingerprint = fingerprintCommandSnapshot(authoritativeCommand);
  let execution: { replayed: boolean; result: WorkflowResult<JsonValue> };
  try {
    execution = await ports.repository.runWorkflowEvent(
      authoritativeCommand.event_id,
      fingerprint,
      () => executeCommand(authoritativeCommand, fingerprint, ports),
    );
  } catch (error) {
    const conflict = error instanceof WorkflowEventConflictError;
    const observationBatchD = isObservationBatchDAction(authoritativeCommand.action);
    const observationBatchE = isObservationBatchEAction(authoritativeCommand.action);
    const failed = safeFailure(
      authoritativeCommand,
      conflict ? "event_conflict" : "repository_failure",
      conflict
        ? error.message
        : observationBatchE
          ? "W6 observation Batch E event repository failed"
          : observationBatchD
            ? "W6 observation Batch D event repository failed"
            : "W6 Batch C event repository failed",
      [
        "preserve_W6_domain_state",
        observationBatchE
          ? "stop_W6_observation_batch_e"
          : observationBatchD
            ? "stop_W6_observation_batch_d"
            : "stop_W6_batch_c",
      ],
    );
    return appendTransientAudit(failed, fingerprint, ports);
  }
  let audited: WorkflowResult<JsonValue>;
  try {
    audited = await ports.repository.runWorkflowAuditExclusive(
      authoritativeCommand.event_id,
      () => ensureCachedWorkflowAudit(execution.result, fingerprint, ports),
    );
  } catch {
    audited = replaceCachedResult(
      execution.result,
      withWorkflowAuditState(
        execution.result,
        workflowAuditId(fingerprint),
        "pending",
        true,
      ),
    );
  }
  return execution.replayed ? replayResult(audited, authoritativeCommand.action) : cloneJson(audited);
}
