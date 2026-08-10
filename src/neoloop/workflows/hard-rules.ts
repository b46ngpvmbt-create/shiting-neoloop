import type { RiskLevel } from "../contracts/model.js";

export interface HardRuleResult {
  risk_level: RiskLevel;
  rule_version: "hard-rule-synthetic-v1";
  matched_terms: string[];
}

const RULES: Array<{ risk: RiskLevel; pattern: RegExp }> = [
  { risk: "P0", pattern: /起火|冒烟|人员受伤|人身伤害/u },
  { risk: "P1", pattern: /碰撞|制动异常|车辆失控/u },
  { risk: "P2", pattern: /延误|无法解锁|故障|中断/u },
];

export function evaluateHardRuleRisk(originalText: string): HardRuleResult {
  for (const rule of RULES) {
    const match = originalText.match(rule.pattern);
    if (match) {
      return {
        risk_level: rule.risk,
        rule_version: "hard-rule-synthetic-v1",
        matched_terms: [match[0]],
      };
    }
  }
  return { risk_level: "P3", rule_version: "hard-rule-synthetic-v1", matched_terms: [] };
}
