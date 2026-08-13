import type { WorkbenchRole } from "./policy";

export type LiveActionKind =
  | "case-safe"
  | "work-order-safe"
  | "improvement-review"
  | "ai-review"
  | "knowledge-review";

export type LiveActionTarget = {
  kind: LiveActionKind;
  tableKey: "cases" | "work_orders" | "improvements" | "ai_audit" | "knowledge_index";
  recordId: string;
  businessId: string;
  dataScope: string;
  fields: Readonly<Record<string, unknown>>;
};

export type LiveActionInput = Readonly<Record<string, string>> & {
  actorId: string;
  observedAt: string;
};

export type LiveActionPlan = {
  kind: LiveActionKind;
  tableKey: LiveActionTarget["tableKey"];
  recordId: string;
  businessId: string;
  expected: Record<string, string>;
  changes: Record<string, string | number | boolean | null>;
  summary: string;
};

const CASE_STATUSES = new Set(["待补充", "待关联", "处理中", "待验证", "待回访"]);
const WORK_ORDER_STATUSES = new Set(["待接单", "处理中"]);
const AI_DECISIONS = new Set(["approved", "revision_requested", "rejected"]);
const KNOWLEDGE_DECISIONS = new Set(["approved", "rejected"]);

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    for (const key of ["text", "name", "value", "id"]) {
      if (candidate[key] !== undefined) return text(candidate[key]);
    }
  }
  return "";
}

function required(value: string | undefined, label: string, minimum = 1): string {
  const normalized = value?.trim() ?? "";
  if (normalized.length < minimum) throw new Error(`${label}至少需要 ${minimum} 个字符`);
  return normalized;
}

function assertAuthorized(role: WorkbenchRole, kind: LiveActionKind): void {
  const safeUpdate = kind === "case-safe" || kind === "work-order-safe";
  if (safeUpdate && role !== "owner" && role !== "operations") throw new Error("当前角色不能更新案件或工单");
  if (!safeUpdate && role !== "owner" && role !== "reviewer") throw new Error("当前角色不能提交审核结论");
}

function assertTarget(target: LiveActionTarget): void {
  if (target.dataScope !== "synthetic_experiment") throw new Error("仅允许处理 synthetic_experiment 记录");
  if (!target.recordId || !target.businessId) throw new Error("操作对象缺少可读回标识");
}

function auditValidationPassed(value: unknown): boolean {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (value as Record<string, unknown>).valid === true;
  }
  if (typeof value !== "string") return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as Record<string, unknown>).valid === true);
  } catch {
    return false;
  }
}

export function createLiveActionPlan(
  role: WorkbenchRole,
  target: LiveActionTarget,
  input: LiveActionInput,
): LiveActionPlan {
  assertAuthorized(role, target.kind);
  assertTarget(target);
  const actorId = required(input.actorId, "审核人");
  const observedAt = required(input.observedAt, "操作时间");
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("操作时间无效");

  if (target.kind === "case-safe") {
    const status = required(input.status, "案件状态");
    if (!CASE_STATUSES.has(status)) throw new Error("案件安全更新不允许该状态");
    const evidence = required(input.note, "证据摘要", 4);
    return {
      kind: target.kind,
      tableKey: target.tableKey,
      recordId: target.recordId,
      businessId: target.businessId,
      expected: {
        status: text(target.fields.status),
        evidence_summary: text(target.fields.evidence_summary),
      },
      changes: { status, evidence_summary: evidence },
      summary: `更新案件 ${target.businessId} 的非终态状态和证据摘要`,
    };
  }

  if (target.kind === "work-order-safe") {
    const status = required(input.status, "工单状态");
    if (!WORK_ORDER_STATUSES.has(status)) throw new Error("工单安全更新不允许该状态");
    const evidence = required(input.note, "处置证据", 4);
    return {
      kind: target.kind,
      tableKey: target.tableKey,
      recordId: target.recordId,
      businessId: target.businessId,
      expected: {
        status: text(target.fields.status),
        disposition_evidence: text(target.fields.disposition_evidence),
      },
      changes: { status, disposition_evidence: evidence },
      summary: `更新工单 ${target.businessId} 的非终态状态和处置证据`,
    };
  }

  if (target.kind === "improvement-review") {
    const decision = required(input.decision, "改进决策");
    const conclusion = required(input.note, "人工结论", 4);
    const changes: LiveActionPlan["changes"] = { human_conclusion: conclusion };
    if (decision !== "keep_observing") {
      throw new Error("改进决策不在允许范围内");
    }
    return {
      kind: target.kind,
      tableKey: target.tableKey,
      recordId: target.recordId,
      businessId: target.businessId,
      expected: {
        status: text(target.fields.status),
        human_conclusion: text(target.fields.human_conclusion),
      },
      changes,
      summary: `提交改进项目 ${target.businessId} 的观察结论`,
    };
  }

  if (target.kind === "ai-review") {
    const decision = required(input.decision, "AI 审核决策");
    if (!AI_DECISIONS.has(decision)) throw new Error("AI 审核决策不在允许范围内");
    if (decision === "approved" && !auditValidationPassed(target.fields.validation)) {
      throw new Error("确定性验证未通过的 AI 审计不得批准");
    }
    const note = required(input.note, "审核说明", 4);
    const state = decision === "approved" ? "accepted" : decision === "rejected" ? "rejected" : "pending";
    return {
      kind: target.kind,
      tableKey: target.tableKey,
      recordId: target.recordId,
      businessId: target.businessId,
      expected: {
        review_action: text(target.fields.review_action),
        reviewed_by: text(target.fields.reviewed_by),
        reviewed_at: text(target.fields.reviewed_at),
        human_revision: text(target.fields.human_revision),
      },
      changes: {
        review_action: decision,
        reviewed_by: actorId,
        reviewed_at: Date.parse(observedAt),
        human_revision: JSON.stringify({ state, note }),
      },
      summary: `提交 AI 审计 ${target.businessId} 的人工决策`,
    };
  }

  const decision = required(input.decision, "知识审核决策");
  if (!KNOWLEDGE_DECISIONS.has(decision)) throw new Error("知识审核决策不在允许范围内");
  const note = required(input.note, "审核说明", 4);
  return {
    kind: target.kind,
    tableKey: target.tableKey,
    recordId: target.recordId,
    businessId: target.businessId,
    expected: {
      approval_status: text(target.fields.approval_status),
      citation_allowed_for_n7: text(target.fields.citation_allowed_for_n7),
      effective_at: text(target.fields.effective_at),
    },
    changes: decision === "approved"
      ? { approval_status: `已审核：${note}`, citation_allowed_for_n7: "true", effective_at: observedAt }
      : { approval_status: `已驳回：${note}`, citation_allowed_for_n7: "false", effective_at: "" },
    summary: `提交知识 ${target.businessId} 的审核决策`,
  };
}
