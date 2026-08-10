import type { RiskLevel } from "../contracts/model.js";

const RISK_SEVERITY: Record<RiskLevel, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function selectFinalRisk(hardRuleRisk: RiskLevel, aiSuggestion?: RiskLevel | null): RiskLevel {
  if (!aiSuggestion) {
    return hardRuleRisk;
  }
  return RISK_SEVERITY[aiSuggestion] < RISK_SEVERITY[hardRuleRisk] ? aiSuggestion : hardRuleRisk;
}

export type DecisionSource = "hard_rule" | "permission_rule" | "confirmed_master_data" | "ai_suggestion";

const DECISION_PRIORITY: Record<DecisionSource, number> = {
  hard_rule: 0,
  permission_rule: 1,
  confirmed_master_data: 2,
  ai_suggestion: 3,
};

export interface DecisionCandidate<T> {
  source: DecisionSource;
  value: T;
}

export function selectAuthoritativeDecision<T>(candidates: readonly DecisionCandidate<T>[]): DecisionCandidate<T> {
  if (candidates.length === 0) {
    throw new Error("At least one decision candidate is required");
  }
  return [...candidates].sort(
    (left, right) => DECISION_PRIORITY[left.source] - DECISION_PRIORITY[right.source],
  )[0];
}
