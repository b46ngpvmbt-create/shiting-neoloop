import type {
  CaseStatus,
  ClusterStatus,
  ImprovementStatus,
  RawFeedbackStatus,
  WorkOrderStatus,
} from "../contracts/model.js";

export type TransitionActor = "workflow" | "authorized_human";

export class InvalidStateTransitionError extends Error {
  constructor(entity: string, from: string, to: string, actor: TransitionActor) {
    super(`Invalid ${entity} transition: ${from} -> ${to} by ${actor}`);
    this.name = "InvalidStateTransitionError";
  }
}

const FEEDBACK_TRANSITIONS: Record<RawFeedbackStatus, Partial<Record<RawFeedbackStatus, TransitionActor[]>>> = {
  待分诊: { 人工处理: ["workflow"], 已建案: ["workflow"], 已忽略: ["authorized_human"] },
  人工处理: { 已建案: ["authorized_human"], 已忽略: ["authorized_human"] },
  已建案: {},
  已忽略: {},
};

const CASE_TRANSITIONS: Record<CaseStatus, Partial<Record<CaseStatus, TransitionActor[]>>> = {
  待补充: { 待关联: ["authorized_human"], 已合并: ["authorized_human"] },
  待关联: { 待补充: ["workflow", "authorized_human"], 待派单: ["authorized_human"], 已合并: ["authorized_human"] },
  待派单: { 处理中: ["authorized_human"] },
  处理中: { 待验证: ["authorized_human"] },
  待验证: { 处理中: ["workflow", "authorized_human"], 待回访: ["authorized_human"] },
  待回访: { 处理中: ["workflow", "authorized_human"], 已关闭: ["authorized_human"] },
  已关闭: { 处理中: ["authorized_human"] },
  已合并: {},
};

const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, Partial<Record<WorkOrderStatus, TransitionActor[]>>> = {
  待接单: { 处理中: ["authorized_human"], 已取消: ["authorized_human"] },
  处理中: { 待验证: ["authorized_human"], 已取消: ["authorized_human"] },
  待验证: { 处理中: ["workflow", "authorized_human"], 已完成: ["authorized_human"], 已取消: ["authorized_human"] },
  已完成: {},
  已取消: {},
};

const CLUSTER_TRANSITIONS: Record<ClusterStatus, Partial<Record<ClusterStatus, TransitionActor[]>>> = {
  候选: { 待审核: ["authorized_human"], 已驳回: ["authorized_human"] },
  待审核: { 改进中: ["authorized_human"], 已驳回: ["authorized_human"] },
  改进中: { 观察中: ["authorized_human"] },
  观察中: { 已归档: ["authorized_human"] },
  已归档: { 观察中: ["authorized_human"] },
  已驳回: {},
};

const IMPROVEMENT_TRANSITIONS: Record<ImprovementStatus, Partial<Record<ImprovementStatus, TransitionActor[]>>> = {
  待立项: { 执行中: ["authorized_human"], 已终止: ["authorized_human"] },
  执行中: { 观察中: ["authorized_human"], 已终止: ["authorized_human"] },
  观察中: { 已完成: ["authorized_human"], 已终止: ["authorized_human"] },
  已完成: { 观察中: ["authorized_human"] },
  已终止: {},
};

function transition<T extends string>(
  entity: string,
  transitions: Record<T, Partial<Record<T, TransitionActor[]>>>,
  from: T,
  to: T,
  actor: TransitionActor,
): T {
  if (!transitions[from][to]?.includes(actor)) {
    throw new InvalidStateTransitionError(entity, from, to, actor);
  }
  return to;
}

export const transitionFeedback = (from: RawFeedbackStatus, to: RawFeedbackStatus, actor: TransitionActor) =>
  transition("raw_feedback", FEEDBACK_TRANSITIONS, from, to, actor);

export const transitionCase = (from: CaseStatus, to: CaseStatus, actor: TransitionActor) =>
  transition("case", CASE_TRANSITIONS, from, to, actor);

export const transitionWorkOrder = (from: WorkOrderStatus, to: WorkOrderStatus, actor: TransitionActor) =>
  transition("work_order", WORK_ORDER_TRANSITIONS, from, to, actor);

export const transitionCluster = (from: ClusterStatus, to: ClusterStatus, actor: TransitionActor) =>
  transition("cluster", CLUSTER_TRANSITIONS, from, to, actor);

export const transitionImprovement = (
  from: ImprovementStatus,
  to: ImprovementStatus,
  actor: TransitionActor,
) => transition("improvement", IMPROVEMENT_TRANSITIONS, from, to, actor);
