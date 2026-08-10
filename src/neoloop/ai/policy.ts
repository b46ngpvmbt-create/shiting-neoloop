export const FORBIDDEN_OUTPUT_FIELDS = [
  "vehicle_control",
  "liability_decision",
  "compensation_commitment",
  "recovery_time_commitment",
  "final_root_cause",
  "knowledge_publication",
] as const;

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/iu,
  /disregard\s+(the\s+)?system/iu,
  /(?:override|bypass|forget).{0,12}(?:rules?|instructions?|system)/iu,
  /忽略.{0,8}(之前|上述|系统).{0,8}指令/u,
  /无视.{0,8}(所有|全部|先前|之前|上述|系统)?.{0,8}(规则|指令|要求)/u,
  /(?:绕过|覆盖).{0,8}(?:规则|限制|系统|安全|指令)/u,
  /(调用|使用).{0,6}(工具|tool)/iu,
  /system\s*prompt/iu,
];

export interface UntrustedTextInspection {
  prompt_injection_detected: boolean;
  instructions_are_data_only: true;
  exposed_capabilities: [];
}

export function inspectUntrustedText(text: string): UntrustedTextInspection {
  return {
    prompt_injection_detected: PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text)),
    instructions_are_data_only: true,
    exposed_capabilities: [],
  };
}
