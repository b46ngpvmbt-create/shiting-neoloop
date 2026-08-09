import {
  AI_NODE_STATUSES,
  RISK_LEVELS,
  type EvidenceSpan,
  type JsonValue,
} from "../contracts/model.js";
import type { AiNodeRunRequest } from "../contracts/ports.js";
import {
  AI_NODE_CANDIDATE_REQUIRED_FIELDS,
  AI_NODE_DEFINITIONS,
  type AiNodeCandidate,
  type N7Mode,
} from "./definitions.js";
import { FORBIDDEN_OUTPUT_FIELDS, inspectUntrustedText } from "./policy.js";

export type NodeCandidateValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: string[] };

const BLOCKED_KEYS = new Set<string>([
  ...FORBIDDEN_OUTPUT_FIELDS,
  "tool_calls",
  "formal_entity",
  "final_responsibility",
  "final_assignee",
  "final_owner",
  "assignee_id",
  "root_cause",
]);
const N3_ALLOWED_EXPLANATIONS = [
  "仅依据已引用原文片段给出风险建议；最终风险由硬规则与该建议取较高值。",
  "已引用原文未显示额外高风险信号；最终风险仍由硬规则与该建议取较高值。",
] as const;
const PROHIBITED_FINAL_DECISION_TEXT = [
  /(?:最终责任|责任归属|承担全责|判定.{0,8}全责)/u,
  /(?:承诺.{0,8}(?:赔偿|赔付|补偿)|(?:赔偿|赔付|补偿).{0,8}(?:金额|全部|元))/u,
  /(?:承诺.{0,8}(?:恢复|修复)|(?:恢复|修复).{0,8}(?:小时|分钟|时间|之前|以后))/u,
  /(?:最终根因|根因.{0,5}(?:是|为|已确定)|技术问题由.{0,12}(?:导致|引起))/u,
  /(?:最终责任人|指定.{0,8}责任人|负责人.{0,4}(?:是|为))/u,
  /(?:打开|关闭|控制|启动|停止).{0,5}(?:车辆|车门|舱门)/u,
  /(?:final\s+(?:technical\s+)?root\s+cause|root\s+cause\s+is)/iu,
  /(?:final\s+(?:assignee|owner|responsibility)|is\s+the\s+final\s+(?:assignee|owner))/iu,
  /(?:fully\s+liable|liability\s+is\s+assigned|compensation\s+(?:will|must)\s+be)/iu,
  /(?:will\s+(?:recover|be\s+restored)\s+(?:in|by)|recovery\s+time\s+is)/iu,
] as const;
const N6_HYPOTHESIS_ID = /^HYP(?:-[A-Z0-9]+)+$/u;
const N6_UNCERTAINTY_ID = /^UNC(?:-[A-Z0-9]+)+$/u;
const N6_CATALOG_LABEL = /^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u;
const N6_CATALOG_FORBIDDEN_LABEL_TEXT = [
  /(?:最终|根因|结论|足以证明|证明|查明|唯一|导致|造成|引起|致使|确定|确认|核验)/u,
  /(?:请|应当|应该|必须|归入|纳入|分配|创建|合并|调用|执行|发布|写入|更新|标记|结案)/u,
  /\b(?:final|conclusive|root\s+cause|prove(?:s|d|n)?|proof|determin(?:e|es|ed|ing)|confirm(?:s|ed|ing)?|verif(?:y|ies|ied|ication)|establish(?:es|ed|ing)?|caus(?:e|es|ed|ing)|lead(?:s|ing)?\s+to|result(?:s|ed|ing)?\s+in)\b/iu,
  /\b(?:please|should|must|assign(?:s|ed|ing)?|allocate(?:s|d|ing)?|create(?:s|d|ing)?|merge(?:s|d|ing)?|move(?:s|d|ing)?|mark(?:s|ed|ing)?|call(?:s|ed|ing)?|invoke(?:s|d|ing)?|execute(?:s|d|ing)?|publish(?:es|ed|ing)?|writ(?:e|es|ten|ing)|update(?:s|d|ing)?|close(?:s|d|ing)?|resolv(?:e|es|ed|ing))\b/iu,
] as const;
const MAX_N6_CATALOG_ITEMS = 32;
const MAX_N6_UNCERTAINTY_OPTIONS = 16;
const MAX_N6_TERM_ID_LENGTH = 64;
const MAX_N6_FACTOR_LABEL_LENGTH = 48;
const MAX_N6_PHENOMENON_LABEL_LENGTH = 48;
const MAX_N6_UNCERTAINTY_LABEL_LENGTH = 80;

export function renderN6RootCauseStatement(factorLabel: string, phenomenonLabel: string): string {
  return `待验证假设：${factorLabel}可能与${phenomenonLabel}相关，需人工结合支持证据、反证和不确定项验证。`;
}

export function renderN6RootCauseUncertainty(label: string): string {
  return `待确认：${label}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isInteger);
}

function readObjectArray(value: unknown, path: string, errors: string[]): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!isObject(entry)) {
      errors.push(`${path}[${index}] must be an object`);
      return [];
    }
    return [entry];
  });
}

function validateExactFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  for (const field of allowed) {
    if (!(field in value)) {
      errors.push(`${path}.${field} is required`);
    }
  }
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) {
      errors.push(`${path}.${field} is not allowed`);
    }
  }
}

function scanBlockedKeys(value: unknown, path: string, errors: string[], depth = 0): void {
  if (depth > 16 || value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanBlockedKeys(entry, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (BLOCKED_KEYS.has(key) && !(key === "final_root_cause" && entry === false)) {
      errors.push(`${path}.${key} is a prohibited automatic output`);
    }
    scanBlockedKeys(entry, `${path}.${key}`, errors, depth + 1);
  }
}

function scanProhibitedDecisionText(value: unknown, path: string, errors: string[], depth = 0): void {
  if (depth > 16 || value === null) return;
  if (typeof value === "string") {
    if (PROHIBITED_FINAL_DECISION_TEXT.some((pattern) => pattern.test(value))) {
      errors.push(`${path} contains prohibited final decision text`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanProhibitedDecisionText(entry, `${path}[${index}]`, errors, depth + 1));
    return;
  }
  if (isObject(value)) {
    Object.entries(value).forEach(([key, entry]) => {
      scanProhibitedDecisionText(entry, `${path}.${key}`, errors, depth + 1);
    });
  }
}

function validateEvidenceSpan(value: unknown, path: string, errors: string[]): value is EvidenceSpan {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  for (const field of Object.keys(value)) {
    if (!["source_ref", "quote", "start_offset", "end_offset"].includes(field)) {
      errors.push(`${path}.${field} is not allowed`);
    }
  }
  if (!isNonEmptyString(value.source_ref)) {
    errors.push(`${path}.source_ref must be a non-empty string`);
  }
  if (!isNonEmptyString(value.quote)) {
    errors.push(`${path}.quote must be a non-empty string`);
  }
  for (const field of ["start_offset", "end_offset"] as const) {
    const offset = value[field];
    if (offset !== undefined && (!Number.isInteger(offset) || (offset as number) < 0)) {
      errors.push(`${path}.${field} must be a non-negative integer`);
    }
  }
  if (
    Number.isInteger(value.start_offset) &&
    Number.isInteger(value.end_offset) &&
    (value.end_offset as number) < (value.start_offset as number)
  ) {
    errors.push(`${path}.end_offset must not precede start_offset`);
  }
  return errors.length === 0;
}

function validateSpanAgainstOriginal(span: EvidenceSpan, original: string, path: string, errors: string[]): void {
  const start = span.start_offset;
  const end = span.end_offset;
  if (start !== undefined || end !== undefined) {
    if (start === undefined || end === undefined || original.slice(start, end) !== span.quote) {
      errors.push(`${path} offsets must select the exact quote from original_text`);
    }
    return;
  }
  if (!original.includes(span.quote)) {
    errors.push(`${path}.quote must occur in original_text`);
  }
}

function validateDefinition(request: AiNodeRunRequest<JsonValue>, errors: string[]): void {
  const definition =
    request.node === "N1" ? AI_NODE_DEFINITIONS.N1
    : request.node === "N2" ? AI_NODE_DEFINITIONS.N2
    : request.node === "N3" ? AI_NODE_DEFINITIONS.N3
    : request.node === "N4" ? AI_NODE_DEFINITIONS.N4
    : request.node === "N5" && request.mode === "same_event_duplicate" ? AI_NODE_DEFINITIONS.N5_SAME_EVENT
    : request.node === "N5" && request.mode === "cross_event_clustering" ? AI_NODE_DEFINITIONS.N5_CROSS_EVENT
    : request.node === "N6" && request.mode === "responsibility_routing" ? AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING
    : request.node === "N6" && request.mode === "root_cause_hypothesis" ? AI_NODE_DEFINITIONS.N6_ROOT_CAUSE
    : request.node === "N7" && request.mode === "customer_reply" ? AI_NODE_DEFINITIONS.N7_CUSTOMER_REPLY
    : request.node === "N7" && request.mode === "knowledge_draft" ? AI_NODE_DEFINITIONS.N7_KNOWLEDGE_DRAFT
    : request.node === "N7" && request.mode === "insight_summary" ? AI_NODE_DEFINITIONS.N7_INSIGHT_SUMMARY
    : undefined;
  if (!definition) {
    if (request.node === "N7") {
      errors.push("mode must be customer_reply, knowledge_draft, or insight_summary for N7");
      return;
    }
    errors.push(`node ${request.node} is not implemented by this runner`);
    return;
  }
  if (request.mode !== definition.mode) {
    errors.push(`mode must be ${definition.mode} for ${request.node}`);
  }
  if (request.version !== definition.version) {
    errors.push(`version must be ${definition.version} for ${request.node}`);
  }
}

export function validateNodeRequestDefinition(
  request: AiNodeRunRequest<JsonValue>,
): NodeCandidateValidationResult {
  const errors: string[] = [];
  validateDefinition(request, errors);
  if (request.node === "N5" && request.mode === "cross_event_clustering") {
    const context = validateN5CrossEventInput(request.input, errors);
    if (
      context &&
      (request.object_ref.object_type !== "case" || request.object_ref.object_id !== context.currentCaseId)
    ) {
      errors.push("N5 cross_event_clustering object_ref must identify the current case");
    }
  }
  if (request.node === "N6" && request.mode === "responsibility_routing") {
    validateN6Input(request.input, errors);
  }
  if (request.node === "N6" && request.mode === "root_cause_hypothesis") {
    const context = validateN6RootCauseInput(request.input, errors);
    if (
      context &&
      (request.object_ref.object_type !== "cluster" || request.object_ref.object_id !== context.clusterId)
    ) {
      errors.push("N6 root_cause_hypothesis object_ref must identify input.issue_cluster");
    }
  }
  if (request.node === "N7" && isN7Mode(request.mode)) {
    validateN7Input(request.input, request.mode, errors);
  }
  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

function isN7Mode(value: string): value is N7Mode {
  return value === "customer_reply" || value === "knowledge_draft" || value === "insight_summary";
}

function evidenceSpansOverlap(
  left: EvidenceSpan | undefined,
  right: EvidenceSpan | undefined,
  inputEvidence: Record<string, unknown>[],
): boolean {
  if (
    !left
    || !right
    || !isNonEmptyString(left.source_ref)
    || !isNonEmptyString(right.source_ref)
    || !isNonEmptyString(left.quote)
    || !isNonEmptyString(right.quote)
  ) {
    return false;
  }
  const leftQuote = left.quote.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const rightQuote = right.quote.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (leftQuote === rightQuote) return true;
  if (left.source_ref !== right.source_ref) return false;
  if (leftQuote.includes(rightQuote) || rightQuote.includes(leftQuote)) return true;

  return inputEvidence.some((entry) => {
    if (entry.source_ref !== left.source_ref || !isNonEmptyString(entry.text)) return false;
    const leftStart = entry.text.indexOf(left.quote);
    const rightStart = entry.text.indexOf(right.quote);
    if (leftStart < 0 || rightStart < 0) return false;
    return leftStart < rightStart + right.quote.length && rightStart < leftStart + left.quote.length;
  });
}

interface BoundEvidenceRange {
  sourceRef: string;
  start: number;
  end: number;
}

function bindN6RootEvidenceRange(
  span: EvidenceSpan,
  sourceText: string,
  path: string,
  errors: string[],
): BoundEvidenceRange | null {
  if (!isNonEmptyString(span.source_ref) || !isNonEmptyString(span.quote)) return null;
  const start = span.start_offset;
  const end = span.end_offset;
  if (start !== undefined || end !== undefined) {
    if (
      !Number.isInteger(start)
      || !Number.isInteger(end)
      || (start as number) < 0
      || (end as number) < (start as number)
    ) {
      errors.push(`${path} offsets must define a valid half-open range`);
      return null;
    }
    if (sourceText.slice(start as number, end as number) !== span.quote) {
      errors.push(`${path} offsets must select the exact source_text slice`);
      return null;
    }
    return { sourceRef: span.source_ref, start: start as number, end: end as number };
  }

  const first = sourceText.indexOf(span.quote);
  if (first < 0) {
    errors.push(`${path}.quote must be locatable in input.evidence source_text`);
    return null;
  }
  if (sourceText.indexOf(span.quote, first + 1) >= 0) {
    errors.push(`${path}.quote is ambiguous; omit offsets only when the quote is unique in source_text`);
    return null;
  }
  return { sourceRef: span.source_ref, start: first, end: first + span.quote.length };
}

function boundEvidenceRangesOverlap(
  left: BoundEvidenceRange | undefined,
  right: BoundEvidenceRange | undefined,
): boolean {
  return Boolean(
    left
    && right
    && left.sourceRef === right.sourceRef
    && left.start < right.end
    && right.start < left.end,
  );
}

function validateN6CatalogId(
  value: unknown,
  kind: "hypothesis" | "uncertainty",
  path: string,
  errors: string[],
): value is string {
  const pattern = kind === "hypothesis" ? N6_HYPOTHESIS_ID : N6_UNCERTAINTY_ID;
  if (
    !isNonEmptyString(value)
    || value.length > MAX_N6_TERM_ID_LENGTH
    || !pattern.test(value)
  ) {
    errors.push(`${path} must be a controlled ${kind === "hypothesis" ? "HYP" : "UNC"} term ID`);
    return false;
  }
  return true;
}

function validateN6CatalogLabel(
  value: unknown,
  path: string,
  maxLength: number,
  errors: string[],
): value is string {
  if (!isNonEmptyString(value)) {
    errors.push(`${path} must be a non-empty controlled label`);
    return false;
  }
  if (
    value !== value.trim()
    || [...value].length > maxLength
    || !N6_CATALOG_LABEL.test(value)
  ) {
    errors.push(`${path} must contain only letters, numbers, and single spaces with no sentence punctuation`);
    return false;
  }
  if (
    inspectUntrustedText(value).prompt_injection_detected
    || N6_CATALOG_FORBIDDEN_LABEL_TEXT.some((pattern) => pattern.test(value))
  ) {
    errors.push(`${path} must not contain a causal/final assertion or workflow instruction`);
    return false;
  }
  return true;
}

interface N6ValidatedCatalogItem {
  factorLabel: string;
  phenomenonLabel: string;
  uncertaintyById: Map<string, string>;
}

function validateN6HypothesisCatalog(
  value: unknown,
  errors: string[],
): Map<string, N6ValidatedCatalogItem> {
  const rows = readObjectArray(value, "input.hypothesis_catalog", errors);
  if (rows.length === 0) {
    errors.push("input.hypothesis_catalog must contain at least one controlled hypothesis term");
  }
  if (rows.length > MAX_N6_CATALOG_ITEMS) {
    errors.push(`input.hypothesis_catalog must contain at most ${MAX_N6_CATALOG_ITEMS} items`);
  }

  const byHypothesisId = new Map<string, N6ValidatedCatalogItem>();
  const allUncertaintyIds = new Set<string>();
  rows.forEach((row, index) => {
    const path = `input.hypothesis_catalog[${index}]`;
    validateExactFields(
      row,
      ["hypothesis_id", "factor_label", "phenomenon_label", "uncertainty_options"],
      path,
      errors,
    );
    const hypothesisIdValid = validateN6CatalogId(
      row.hypothesis_id,
      "hypothesis",
      `${path}.hypothesis_id`,
      errors,
    );
    if (hypothesisIdValid && byHypothesisId.has(row.hypothesis_id as string)) {
      errors.push(`${path}.hypothesis_id must be unique in input.hypothesis_catalog`);
    }
    const factorValid = validateN6CatalogLabel(
      row.factor_label,
      `${path}.factor_label`,
      MAX_N6_FACTOR_LABEL_LENGTH,
      errors,
    );
    const phenomenonValid = validateN6CatalogLabel(
      row.phenomenon_label,
      `${path}.phenomenon_label`,
      MAX_N6_PHENOMENON_LABEL_LENGTH,
      errors,
    );

    const uncertaintyRows = readObjectArray(
      row.uncertainty_options,
      `${path}.uncertainty_options`,
      errors,
    );
    if (uncertaintyRows.length === 0) {
      errors.push(`${path}.uncertainty_options must contain at least one controlled uncertainty term`);
    }
    if (uncertaintyRows.length > MAX_N6_UNCERTAINTY_OPTIONS) {
      errors.push(`${path}.uncertainty_options must contain at most ${MAX_N6_UNCERTAINTY_OPTIONS} items`);
    }
    const uncertaintyById = new Map<string, string>();
    uncertaintyRows.forEach((uncertainty, uncertaintyIndex) => {
      const uncertaintyPath = `${path}.uncertainty_options[${uncertaintyIndex}]`;
      validateExactFields(uncertainty, ["uncertainty_id", "label"], uncertaintyPath, errors);
      const idValid = validateN6CatalogId(
        uncertainty.uncertainty_id,
        "uncertainty",
        `${uncertaintyPath}.uncertainty_id`,
        errors,
      );
      if (idValid && allUncertaintyIds.has(uncertainty.uncertainty_id as string)) {
        errors.push(`${uncertaintyPath}.uncertainty_id must be globally unique in input.hypothesis_catalog`);
      }
      const labelValid = validateN6CatalogLabel(
        uncertainty.label,
        `${uncertaintyPath}.label`,
        MAX_N6_UNCERTAINTY_LABEL_LENGTH,
        errors,
      );
      if (idValid) allUncertaintyIds.add(uncertainty.uncertainty_id as string);
      if (idValid && labelValid && !uncertaintyById.has(uncertainty.uncertainty_id as string)) {
        uncertaintyById.set(uncertainty.uncertainty_id as string, uncertainty.label as string);
      }
    });

    if (
      hypothesisIdValid
      && factorValid
      && phenomenonValid
      && uncertaintyById.size > 0
      && !byHypothesisId.has(row.hypothesis_id as string)
    ) {
      byHypothesisId.set(row.hypothesis_id as string, {
        factorLabel: row.factor_label as string,
        phenomenonLabel: row.phenomenon_label as string,
        uncertaintyById,
      });
    }
  });
  return byHypothesisId;
}

function validateN1(
  input: JsonValue,
  payload: Record<string, unknown>,
  evidence: EvidenceSpan[],
  missingFields: unknown,
  expectedSourceRef: string,
  errors: string[],
): void {
  validateExactFields(payload, AI_NODE_DEFINITIONS.N1.payload_fields, "payload", errors);
  if (!isObject(input) || !isNonEmptyString(input.original_text)) {
    errors.push("input.original_text must be a non-empty string");
    return;
  }
  const original = input.original_text;
  evidence.forEach((span, index) => {
    validateSpanAgainstOriginal(span, original, `evidence_spans[${index}]`, errors);
    if (span.source_ref !== expectedSourceRef) {
      errors.push(`evidence_spans[${index}].source_ref must match request.object_ref.object_id`);
    }
  });

  if (!Array.isArray(payload.fact_spans)) {
    errors.push("payload.fact_spans must be an array");
  } else {
    payload.fact_spans.forEach((fact, index) => {
      if (!isObject(fact)) {
        errors.push(`payload.fact_spans[${index}] must be an object`);
        return;
      }
      validateExactFields(fact, ["fact", "evidence_span_index"], `payload.fact_spans[${index}]`, errors);
      const evidenceIndex = fact.evidence_span_index;
      if (!isNonEmptyString(fact.fact) || !Number.isInteger(evidenceIndex) || !evidence[evidenceIndex as number]) {
        errors.push(`payload.fact_spans[${index}] must reference original evidence`);
        return;
      }
      if (fact.fact !== evidence[evidenceIndex as number].quote) {
        errors.push(`payload.fact_spans[${index}] fact must equal its original evidence quote`);
      }
      if (inspectUntrustedText(evidence[evidenceIndex as number].quote).prompt_injection_detected) {
        errors.push(`payload.fact_spans[${index}] must not treat prompt-injection directives as facts`);
      }
    });
  }

  const requestText = payload.request;
  const requestIndex = payload.request_evidence_span_index;
  if (requestText === null) {
    if (requestIndex !== null) {
      errors.push("payload.request_evidence_span_index must be null when request is null");
    }
  } else if (
    !isNonEmptyString(requestText) ||
    !Number.isInteger(requestIndex) ||
    !evidence[requestIndex as number] ||
    requestText !== evidence[requestIndex as number].quote
  ) {
    errors.push("payload.request must reference an exact original evidence span");
  } else if (inspectUntrustedText(evidence[requestIndex as number].quote).prompt_injection_detected) {
    errors.push("payload.request must not treat prompt-injection directives as a request");
  }

  if (
    Array.isArray(payload.fact_spans) &&
    payload.fact_spans.length === 0 &&
    payload.request === null &&
    (!Array.isArray(missingFields) || missingFields.length === 0)
  ) {
    errors.push("N1 with no extracted fact or request must report at least one missing_field");
  }

  if (!isObject(payload.entity_clues)) {
    errors.push("payload.entity_clues must be an object");
  } else {
    validateExactFields(
      payload.entity_clues,
      ["vehicle_ids", "task_ids", "station_names"],
      "payload.entity_clues",
      errors,
    );
    for (const field of ["vehicle_ids", "task_ids", "station_names"] as const) {
      if (!isStringArray(payload.entity_clues[field]) && !Array.isArray(payload.entity_clues[field])) {
        errors.push(`payload.entity_clues.${field} must be a string array`);
      } else if (Array.isArray(payload.entity_clues[field]) && !(payload.entity_clues[field] as unknown[]).every(isNonEmptyString)) {
        errors.push(`payload.entity_clues.${field} must contain only non-empty strings`);
      } else if (Array.isArray(payload.entity_clues[field])) {
        (payload.entity_clues[field] as string[]).forEach((clue, index) => {
          if (!original.includes(clue) || !evidence.some((span) => span.quote.includes(clue))) {
            errors.push(`payload.entity_clues.${field}[${index}] must reference original evidence`);
          }
        });
      }
    }
  }
}

function validateN2(input: JsonValue, payload: Record<string, unknown>, errors: string[]): void {
  validateExactFields(payload, AI_NODE_DEFINITIONS.N2.payload_fields, "payload", errors);
  if (!isNonEmptyString(payload.business_domain)) errors.push("payload.business_domain must be a non-empty string");
  if (!isNonEmptyString(payload.subcategory)) errors.push("payload.subcategory must be a non-empty string");
  if (!isStringArray(payload.tags) && !(Array.isArray(payload.tags) && payload.tags.length === 0)) {
    errors.push("payload.tags must be a string array");
  }
  if (!isNonEmptyString(payload.taxonomy_version)) {
    errors.push("payload.taxonomy_version must be a non-empty string");
  }
  if (!isObject(input) || !isNonEmptyString(input.taxonomy_version)) {
    errors.push("input.taxonomy_version must be a non-empty string");
  } else if (payload.taxonomy_version !== input.taxonomy_version) {
    errors.push("payload.taxonomy_version must match input.taxonomy_version");
  }
  const domains = isObject(input) && isObject(input.taxonomy) ? input.taxonomy.domains : undefined;
  if (!isStringArray(domains) || !domains.includes(payload.business_domain as string)) {
    errors.push("payload.business_domain must be one of input.taxonomy.domains");
  }
  const subcategories = isObject(input) && isObject(input.taxonomy) ? input.taxonomy.subcategories : undefined;
  const allowedSubcategories = isObject(subcategories)
    ? subcategories[payload.business_domain as string]
    : undefined;
  if (!isStringArray(allowedSubcategories) || !allowedSubcategories.includes(payload.subcategory as string)) {
    errors.push("payload.subcategory must be one of input.taxonomy.subcategories for the selected domain");
  }
  const allowedTags = isObject(input) && isObject(input.taxonomy) ? input.taxonomy.tags : undefined;
  if (
    !isStringArray(allowedTags) ||
    !Array.isArray(payload.tags) ||
    !payload.tags.every((tag) => allowedTags.includes(tag as string))
  ) {
    errors.push("payload.tags must contain only values from input.taxonomy.tags");
  }
  if (payload.business_domain === "其他" && payload.subcategory === "待人工分类") {
    errors.push("catch-all taxonomy classification requires human handling");
  }
}

function validateN3(
  input: JsonValue,
  payload: Record<string, unknown>,
  evidence: EvidenceSpan[],
  expectedSourceRef: string,
  errors: string[],
): void {
  validateExactFields(payload, AI_NODE_DEFINITIONS.N3.payload_fields, "payload", errors);
  if (!RISK_LEVELS.includes(payload.risk_suggestion as (typeof RISK_LEVELS)[number])) {
    errors.push("payload.risk_suggestion must be P0, P1, P2, or P3");
  }
  if (!Array.isArray(payload.trigger_evidence) || !payload.trigger_evidence.every(Number.isInteger)) {
    errors.push("payload.trigger_evidence must be an integer array");
  } else {
    if (payload.trigger_evidence.length === 0) {
      errors.push("payload.trigger_evidence must contain at least one evidence index");
    }
    payload.trigger_evidence.forEach((index) => {
      if (!evidence[index as number]) errors.push(`payload.trigger_evidence references missing evidence ${index}`);
    });
  }
  if (!isNonEmptyString(payload.explanation)) {
    errors.push("payload.explanation must be a non-empty string");
  } else if (!N3_ALLOWED_EXPLANATIONS.includes(payload.explanation as (typeof N3_ALLOWED_EXPLANATIONS)[number])) {
    errors.push("payload.explanation contains a prohibited decision or must use an approved non-decisional template");
  }
  if (!isObject(input) || !isNonEmptyString(input.original_text)) {
    errors.push("input.original_text must be a non-empty string");
  } else {
    evidence.forEach((span, index) => {
      validateSpanAgainstOriginal(span, input.original_text as string, `evidence_spans[${index}]`, errors);
      if (span.source_ref !== expectedSourceRef) {
        errors.push(`evidence_spans[${index}].source_ref must match request.object_ref.object_id`);
      }
    });
  }
}

function validateN4(
  input: JsonValue,
  payload: Record<string, unknown>,
  evidence: EvidenceSpan[],
  missingFields: unknown,
  errors: string[],
): void {
  validateExactFields(payload, AI_NODE_DEFINITIONS.N4.payload_fields, "payload", errors);
  if (!isObject(input)) {
    errors.push("N4 input must be an object");
    return;
  }
  validateExactFields(input, AI_NODE_DEFINITIONS.N4.input_fields, "input", errors);

  const caseFacts = input.case_facts;
  let caseSourceRef: string | null = null;
  let facts: string[] = [];
  if (!isObject(caseFacts)) {
    errors.push("input.case_facts must be an object");
  } else {
    validateExactFields(caseFacts, ["source_ref", "facts"], "input.case_facts", errors);
    if (!isNonEmptyString(caseFacts.source_ref)) {
      errors.push("input.case_facts.source_ref must be a non-empty string");
    } else {
      caseSourceRef = caseFacts.source_ref;
    }
    if (!isStringArray(caseFacts.facts)) {
      errors.push("input.case_facts.facts must be a non-empty-string array");
    } else {
      facts = caseFacts.facts;
    }
  }

  const vehicles = readObjectArray(input.vehicle_candidates, "input.vehicle_candidates", errors);
  const tasks = readObjectArray(input.task_candidates, "input.task_candidates", errors);
  const sites = readObjectArray(input.site_candidates, "input.site_candidates", errors);
  if (vehicles.length !== 1) {
    errors.push("input.vehicle_candidates must contain exactly one vehicle candidate; missing or conflicting IDs require human review");
  }
  if (tasks.length !== 1) {
    errors.push("input.task_candidates must contain exactly one task candidate; missing or conflicting IDs require human review");
  }
  if (sites.length !== 1) {
    errors.push("input.site_candidates must contain exactly one station candidate; missing or conflicting IDs require human review");
  }

  vehicles.forEach((row, index) => {
    validateExactFields(
      row,
      ["vehicle_id", "station_id", "source_ref", "evidence_text"],
      `input.vehicle_candidates[${index}]`,
      errors,
    );
    for (const field of ["vehicle_id", "station_id", "source_ref", "evidence_text"] as const) {
      if (!isNonEmptyString(row[field])) errors.push(`input.vehicle_candidates[${index}].${field} must be a non-empty string`);
    }
  });
  tasks.forEach((row, index) => {
    validateExactFields(
      row,
      ["task_id", "vehicle_id", "station_id", "source_ref", "evidence_text"],
      `input.task_candidates[${index}]`,
      errors,
    );
    for (const field of ["task_id", "vehicle_id", "station_id", "source_ref", "evidence_text"] as const) {
      if (!isNonEmptyString(row[field])) errors.push(`input.task_candidates[${index}].${field} must be a non-empty string`);
    }
  });
  sites.forEach((row, index) => {
    validateExactFields(
      row,
      ["station_id", "source_ref", "evidence_text"],
      `input.site_candidates[${index}]`,
      errors,
    );
    for (const field of ["station_id", "source_ref", "evidence_text"] as const) {
      if (!isNonEmptyString(row[field])) errors.push(`input.site_candidates[${index}].${field} must be a non-empty string`);
    }
  });

  const vehicle = vehicles.length === 1 ? vehicles[0] : undefined;
  const task = tasks.length === 1 ? tasks[0] : undefined;
  const site = sites.length === 1 ? sites[0] : undefined;
  if (vehicle && task && site) {
    if (task.vehicle_id !== vehicle.vehicle_id) {
      errors.push("input task candidate vehicle_id conflicts with the vehicle candidate");
    }
    if (vehicle.station_id !== site.station_id || task.station_id !== site.station_id) {
      errors.push("input vehicle/task/station candidates have conflicting station IDs");
    }
  }

  evidence.forEach((span, index) => {
    if (!isNonEmptyString(span.source_ref) || !isNonEmptyString(span.quote)) return;
    const isCaseEvidence = caseSourceRef === span.source_ref && facts.some((fact) => fact.includes(span.quote));
    const isVehicleEvidence = vehicles.some(
      (row) => row.source_ref === span.source_ref && isNonEmptyString(row.evidence_text) && row.evidence_text.includes(span.quote),
    );
    const isTaskEvidence = tasks.some(
      (row) => row.source_ref === span.source_ref && isNonEmptyString(row.evidence_text) && row.evidence_text.includes(span.quote),
    );
    const isSiteEvidence = sites.some(
      (row) => row.source_ref === span.source_ref && isNonEmptyString(row.evidence_text) && row.evidence_text.includes(span.quote),
    );
    if (!isCaseEvidence && !isVehicleEvidence && !isTaskEvidence && !isSiteEvidence) {
      errors.push(`evidence_spans[${index}] must be locatable in N4 input evidence`);
    }
    if (inspectUntrustedText(span.quote).prompt_injection_detected) {
      errors.push(`evidence_spans[${index}] must not treat prompt-injection directives as entity evidence`);
    }
  });

  if (!Array.isArray(payload.candidate_objects)) {
    errors.push("payload.candidate_objects must be an array");
    return;
  }
  if (payload.candidate_objects.length !== 3) {
    errors.push("payload.candidate_objects must contain exactly one vehicle, task, and station candidate");
  }
  const seenTypes = new Set<string>();
  const referencedEvidence = new Set<number>();
  payload.candidate_objects.forEach((candidate, candidateIndex) => {
    const path = `payload.candidate_objects[${candidateIndex}]`;
    if (!isObject(candidate)) {
      errors.push(`${path} must be an object`);
      return;
    }
    validateExactFields(candidate, ["object_type", "object_id", "evidence_span_indices"], path, errors);
    const objectType = candidate.object_type;
    if (!isNonEmptyString(objectType) || !["vehicle", "delivery_task", "station"].includes(objectType)) {
      errors.push(`${path}.object_type must be vehicle, delivery_task, or station`);
      return;
    }
    if (seenTypes.has(objectType)) errors.push(`${path}.object_type duplicates ${objectType}`);
    seenTypes.add(objectType);
    if (!isNonEmptyString(candidate.object_id)) {
      errors.push(`${path}.object_id must be a non-empty string`);
      return;
    }
    if (!isIntegerArray(candidate.evidence_span_indices) || candidate.evidence_span_indices.length === 0) {
      errors.push(`${path}.evidence_span_indices must be a non-empty integer array`);
      return;
    }
    const indices = candidate.evidence_span_indices;
    if (new Set(indices).size !== indices.length) {
      errors.push(`${path}.evidence_span_indices must not contain duplicates`);
    }
    indices.forEach((index) => {
      referencedEvidence.add(index);
      if (!evidence[index]) errors.push(`${path} references missing evidence ${index}`);
    });

    const expectedRow = objectType === "vehicle" ? vehicle : objectType === "delivery_task" ? task : site;
    const expectedIdField = objectType === "vehicle" ? "vehicle_id" : objectType === "delivery_task" ? "task_id" : "station_id";
    if (!expectedRow || candidate.object_id !== expectedRow[expectedIdField]) {
      errors.push(`${path} references an unknown ${objectType === "delivery_task" ? "task" : objectType}`);
      return;
    }
    const objectId = candidate.object_id;
    const hasCaseFact = indices.some((index) => {
      const span = evidence[index];
      return span?.source_ref === caseSourceRef && facts.some((fact) => fact.includes(span.quote)) && span.quote.includes(objectId);
    });
    if (!hasCaseFact) {
      errors.push(`${path} ${objectType} requires a case fact containing its ID`);
    }
    const hasMasterEvidence = indices.some((index) => {
      const span = evidence[index];
      return span?.source_ref === expectedRow.source_ref &&
        isNonEmptyString(expectedRow.evidence_text) &&
        expectedRow.evidence_text.includes(span.quote) &&
        span.quote.includes(objectId);
    });
    if (!hasMasterEvidence) {
      errors.push(`${path} ${objectType} requires evidence from its input candidate record`);
    }
  });

  for (const requiredType of ["vehicle", "delivery_task", "station"]) {
    if (!seenTypes.has(requiredType)) errors.push(`payload.candidate_objects is missing ${requiredType}`);
  }
  evidence.forEach((_span, index) => {
    if (!referencedEvidence.has(index)) errors.push(`evidence_spans[${index}] is not referenced by an N4 candidate`);
  });
  if (payload.human_confirmation_required !== true) {
    errors.push("payload.human_confirmation_required must be true; N4 cannot write a formal entity");
  }
  if (Array.isArray(missingFields) && missingFields.length > 0) {
    errors.push("an ok N4 candidate must not retain missing_fields");
  }
}

interface N6InputContext {
  inputEvidence: Record<string, unknown>[];
  matchingRows: Record<string, unknown>[];
  expectedIds: string[];
  stationId: unknown;
  issueType: unknown;
}

function validateN6Input(input: JsonValue, errors: string[]): N6InputContext | null {
  if (!isObject(input)) {
    errors.push("N6 responsibility_routing input must be an object");
    return null;
  }
  validateExactFields(input, AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.input_fields, "input", errors);

  const inputEvidence = readObjectArray(input.evidence, "input.evidence", errors);
  inputEvidence.forEach((entry, index) => {
    validateExactFields(entry, ["source_ref", "text"], `input.evidence[${index}]`, errors);
    if (!isNonEmptyString(entry.source_ref)) errors.push(`input.evidence[${index}].source_ref must be a non-empty string`);
    if (!isNonEmptyString(entry.text)) errors.push(`input.evidence[${index}].text must be a non-empty string`);
  });
  const matrix = readObjectArray(input.responsibility_matrix, "input.responsibility_matrix", errors);
  const matrixFields = [
    "routing_rule_id",
    "rule_version",
    "station_id",
    "issue_type",
    "default_team",
    "reviewer_role",
    "sla_rule_version",
    "status",
    "evidence_class",
  ] as const;
  matrix.forEach((row, index) => {
    validateExactFields(row, matrixFields, `input.responsibility_matrix[${index}]`, errors);
    for (const field of matrixFields) {
      if (!isNonEmptyString(row[field])) errors.push(`input.responsibility_matrix[${index}].${field} must be a non-empty string`);
    }
    if (row.status !== "待企业验证" || row.evidence_class !== "enterprise_pending") {
      errors.push(
        `input.responsibility_matrix[${index}] must remain enterprise_pending with status 待企业验证`,
      );
    }
  });
  if (!isObject(input.issue_cluster)) {
    errors.push("input.issue_cluster must be an object");
    return null;
  }
  validateExactFields(input.issue_cluster, ["station_id", "issue_type"], "input.issue_cluster", errors);
  if (!isNonEmptyString(input.issue_cluster.station_id)) errors.push("input.issue_cluster.station_id must be a non-empty string");
  if (!isNonEmptyString(input.issue_cluster.issue_type)) errors.push("input.issue_cluster.issue_type must be a non-empty string");
  if (!Array.isArray(input.resolution_records)) errors.push("input.resolution_records must be an array");

  const stationId = input.issue_cluster.station_id;
  const issueType = input.issue_cluster.issue_type;
  const matchingRows = matrix.filter((row) => row.station_id === stationId && row.issue_type === issueType);
  if (matchingRows.length === 0) {
    errors.push("input.responsibility_matrix has no matching route; human review is required");
  }
  const expectedIds = matchingRows.flatMap((row) => isNonEmptyString(row.routing_rule_id) ? [row.routing_rule_id] : []);
  if (new Set(expectedIds).size !== expectedIds.length) {
    errors.push("input.responsibility_matrix contains duplicate matching routing_rule_id values");
  }
  return { inputEvidence, matchingRows, expectedIds, stationId, issueType };
}

function validateN6ResponsibilityRouting(
  input: JsonValue,
  payload: Record<string, unknown>,
  evidence: EvidenceSpan[],
  missingFields: unknown,
  errors: string[],
): void {
  validateExactFields(payload, AI_NODE_DEFINITIONS.N6_RESPONSIBILITY_ROUTING.payload_fields, "payload", errors);
  scanProhibitedDecisionText(payload, "payload", errors);
  const inputContext = validateN6Input(input, errors);
  if (!inputContext) return;
  const { inputEvidence, matchingRows, expectedIds, stationId, issueType } = inputContext;

  evidence.forEach((span, index) => {
    if (!isNonEmptyString(span.source_ref) || !isNonEmptyString(span.quote)) return;
    const located = inputEvidence.some(
      (entry) => entry.source_ref === span.source_ref && isNonEmptyString(entry.text) && entry.text.includes(span.quote),
    );
    if (!located) errors.push(`evidence_spans[${index}] must be locatable in input.evidence`);
    if (inspectUntrustedText(span.quote).prompt_injection_detected) {
      errors.push(`evidence_spans[${index}] must not treat prompt-injection directives as routing evidence`);
    }
  });

  if (!Array.isArray(payload.candidates)) {
    errors.push("payload.candidates must be an array");
    return;
  }
  const candidateFields = [
    "routing_rule_id",
    "rule_version",
    "candidate_team",
    "candidate_logical_role",
    "sla_rule_version",
    "supporting_evidence_indices",
    "counter_evidence_indices",
    "uncertainties",
  ] as const;
  const actualIds: string[] = [];
  const referencedEvidence = new Set<number>();
  payload.candidates.forEach((candidate, candidateIndex) => {
    const path = `payload.candidates[${candidateIndex}]`;
    if (!isObject(candidate)) {
      errors.push(`${path} must be an object`);
      return;
    }
    validateExactFields(candidate, candidateFields, path, errors);
    if (!isNonEmptyString(candidate.routing_rule_id)) {
      errors.push(`${path}.routing_rule_id must be a non-empty string`);
      return;
    }
    actualIds.push(candidate.routing_rule_id);
    const row = matchingRows.find((entry) => entry.routing_rule_id === candidate.routing_rule_id);
    if (!row) {
      errors.push(`${path}.routing_rule_id is not a matching responsibility_matrix row`);
      return;
    }
    const boundFields: Array<[string, unknown]> = [
      ["rule_version", row.rule_version],
      ["candidate_team", row.default_team],
      ["candidate_logical_role", row.reviewer_role],
      ["sla_rule_version", row.sla_rule_version],
    ];
    for (const [field, expected] of boundFields) {
      if (candidate[field] !== expected) {
        errors.push(`${path}.${field} must match the responsibility_matrix row`);
      }
    }

    const support = candidate.supporting_evidence_indices;
    const counter = candidate.counter_evidence_indices;
    if (!isIntegerArray(support) || support.length === 0) {
      errors.push(`${path}.supporting_evidence_indices must be a non-empty integer array`);
    }
    if (!isIntegerArray(counter) || counter.length === 0) {
      errors.push(`${path}.counter_evidence_indices must be a non-empty integer array`);
    }
    const supportIndices = isIntegerArray(support) ? support : [];
    const counterIndices = isIntegerArray(counter) ? counter : [];
    if (new Set(supportIndices).size !== supportIndices.length) {
      errors.push(`${path}.supporting_evidence_indices must not contain duplicates`);
    }
    if (new Set(counterIndices).size !== counterIndices.length) {
      errors.push(`${path}.counter_evidence_indices must not contain duplicates`);
    }
    for (const index of [...supportIndices, ...counterIndices]) {
      referencedEvidence.add(index);
      if (!evidence[index]) errors.push(`${path} references missing evidence ${index}`);
    }
    const supportCounterOverlap = supportIndices.some((supportIndex) =>
      counterIndices.some((counterIndex) =>
        evidenceSpansOverlap(evidence[supportIndex], evidence[counterIndex], inputEvidence)
      )
    );
    if (supportCounterOverlap) {
      errors.push(`${path} must not use overlapping evidence as support and counter-evidence`);
    }
    const hasIssueEvidence = supportIndices.some((index) => {
      const span = evidence[index];
      return span && span.source_ref !== candidate.routing_rule_id &&
        span.quote.includes(String(stationId)) && span.quote.includes(String(issueType));
    });
    if (!hasIssueEvidence) errors.push(`${path} requires supporting case evidence for station and issue type`);
    const hasRuleEvidence = supportIndices.some((index) => {
      const span = evidence[index];
      const sourceMatchesRule = span?.source_ref === candidate.routing_rule_id ||
        span?.source_ref.endsWith(`:${candidate.routing_rule_id}`);
      return sourceMatchesRule &&
        span.quote.includes(candidate.routing_rule_id as string) &&
        isNonEmptyString(candidate.candidate_team) && span.quote.includes(candidate.candidate_team);
    });
    if (!hasRuleEvidence) errors.push(`${path} requires supporting evidence for its responsibility_matrix row`);
    const hasBoundCounterEvidence = counterIndices.some((index) => {
      const span = evidence[index];
      if (!span) return false;
      const competingRule = matchingRows.some((entry) => {
        const ruleId = entry.routing_rule_id;
        const team = entry.default_team;
        const status = entry.status;
        if (
          ruleId === candidate.routing_rule_id
          || !isNonEmptyString(ruleId)
          || !isNonEmptyString(team)
          || !isNonEmptyString(status)
        ) {
          return false;
        }
        const sourceMatches = span.source_ref === ruleId || span.source_ref.endsWith(`:${ruleId}`);
        return sourceMatches
          && span.quote.includes(ruleId)
          && span.quote.includes(team)
          && span.quote.includes(status);
      });
      const pendingStatusCounter =
        (span.source_ref === candidate.routing_rule_id || span.source_ref.endsWith(`:${candidate.routing_rule_id}`)) &&
        span.quote.includes("待企业验证");
      return competingRule || pendingStatusCounter;
    });
    if (!hasBoundCounterEvidence) {
      errors.push(`${path}.counter_evidence_indices must bind a competing route or enterprise-pending status evidence`);
    }
    if (!isStringArray(candidate.uncertainties) || candidate.uncertainties.length === 0) {
      errors.push(`${path}.uncertainties must be a non-empty string array because N6 only suggests routing`);
    }
  });

  if (
    actualIds.length !== expectedIds.length ||
    [...actualIds].sort().join("\u0000") !== [...expectedIds].sort().join("\u0000")
  ) {
    errors.push("payload.candidates must preserve all matching responsibility_matrix rows exactly once");
  }
  if (new Set(actualIds).size !== actualIds.length) {
    errors.push("payload.candidates must not repeat a routing_rule_id");
  }
  evidence.forEach((_span, index) => {
    if (!referencedEvidence.has(index)) errors.push(`evidence_spans[${index}] is not referenced by an N6 candidate`);
  });
  if (payload.human_confirmation_required !== true) {
    errors.push("payload.human_confirmation_required must be true; N6 cannot assign final responsibility");
  }
  if (Array.isArray(missingFields) && missingFields.length > 0) {
    errors.push("an ok N6 responsibility-routing candidate must not retain missing_fields");
  }
}

interface N7InputContext {
  reviewedFacts: Record<string, unknown>[];
  resolutionResult: Record<string, unknown>;
  reviewedKnowledge: Record<string, unknown>[];
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function n7Definition(mode: N7Mode) {
  return mode === "customer_reply"
    ? AI_NODE_DEFINITIONS.N7_CUSTOMER_REPLY
    : mode === "knowledge_draft"
      ? AI_NODE_DEFINITIONS.N7_KNOWLEDGE_DRAFT
      : AI_NODE_DEFINITIONS.N7_INSIGHT_SUMMARY;
}

function validateN7Input(
  input: JsonValue,
  mode: N7Mode,
  errors: string[],
): N7InputContext | null {
  if (!isObject(input)) {
    errors.push("N7 input must be an object");
    return null;
  }
  validateExactFields(input, n7Definition(mode).input_fields, "input", errors);

  const reviewedFacts = readObjectArray(input.reviewed_facts, "input.reviewed_facts", errors);
  if (reviewedFacts.length === 0) {
    errors.push("input.reviewed_facts must contain at least one approved fact");
  }
  reviewedFacts.forEach((fact, index) => {
    const path = `input.reviewed_facts[${index}]`;
    validateExactFields(fact, ["source_ref", "text", "review_status", "review_ref"], path, errors);
    if (!isNonEmptyString(fact.source_ref)) errors.push(`${path}.source_ref must be a non-empty string`);
    if (!isNonEmptyString(fact.text)) errors.push(`${path}.text must be a non-empty string`);
    if (fact.review_status !== "approved") errors.push(`${path}.review_status must be approved`);
    if (!isNonEmptyString(fact.review_ref)) errors.push(`${path}.review_ref must be a non-empty string`);
  });

  if (!isObject(input.resolution_result)) {
    errors.push("input.resolution_result must be an object");
    return null;
  }
  const resolutionResult = input.resolution_result;
  validateExactFields(
    resolutionResult,
    ["source_ref", "text", "validation_status", "review_ref"],
    "input.resolution_result",
    errors,
  );
  if (!isNonEmptyString(resolutionResult.source_ref)) {
    errors.push("input.resolution_result.source_ref must be a non-empty string");
  }
  if (!isNonEmptyString(resolutionResult.text)) {
    errors.push("input.resolution_result.text must be a non-empty string");
  }
  if (resolutionResult.validation_status !== "verified") {
    errors.push("input.resolution_result.validation_status must be verified");
  }
  if (!isNonEmptyString(resolutionResult.review_ref)) {
    errors.push("input.resolution_result.review_ref must be a non-empty string");
  }

  const reviewedKnowledge = readObjectArray(
    input.reviewed_knowledge_index,
    "input.reviewed_knowledge_index",
    errors,
  );
  if (mode === "customer_reply" && reviewedKnowledge.length === 0) {
    errors.push("input.reviewed_knowledge_index must contain approved knowledge for a customer_reply citation");
  }
  const knowledgeIds = new Set<string>();
  reviewedKnowledge.forEach((knowledge, index) => {
    const path = `input.reviewed_knowledge_index[${index}]`;
    validateExactFields(
      knowledge,
      [
        "knowledge_id",
        "version",
        "approval_status",
        "effective_at",
        "citation_allowed_for_n7",
        "source_ref",
        "text",
      ],
      path,
      errors,
    );
    if (!isNonEmptyString(knowledge.knowledge_id)) {
      errors.push(`${path}.knowledge_id must be a non-empty string`);
    } else if (knowledgeIds.has(knowledge.knowledge_id)) {
      errors.push(`${path}.knowledge_id must not repeat an earlier knowledge entry`);
    } else {
      knowledgeIds.add(knowledge.knowledge_id);
    }
    if (!isNonEmptyString(knowledge.version)) errors.push(`${path}.version must be a non-empty string`);
    if (knowledge.approval_status !== "已审核") {
      errors.push(`${path}.approval_status must be 已审核; unreviewed knowledge is not an N7 source`);
    }
    if (!isIsoTimestamp(knowledge.effective_at)) {
      errors.push(`${path}.effective_at must be an approved, effective ISO timestamp`);
    }
    if (knowledge.citation_allowed_for_n7 !== true) {
      errors.push(`${path}.citation_allowed_for_n7 must be true`);
    }
    if (!isNonEmptyString(knowledge.source_ref)) errors.push(`${path}.source_ref must be a non-empty string`);
    if (!isNonEmptyString(knowledge.text)) errors.push(`${path}.text must be a non-empty string`);
  });

  return { reviewedFacts, resolutionResult, reviewedKnowledge };
}

function validateN7(
  request: AiNodeRunRequest<JsonValue>,
  payload: Record<string, unknown>,
  evidence: EvidenceSpan[],
  missingFields: unknown,
  errors: string[],
): void {
  if (!isN7Mode(request.mode)) {
    errors.push("N7 mode is not implemented");
    return;
  }
  const definition = n7Definition(request.mode);
  validateExactFields(payload, definition.payload_fields, "payload", errors);
  scanProhibitedDecisionText(payload, "payload", errors);
  const context = validateN7Input(request.input, request.mode, errors);
  if (!context) return;

  if (payload.draft_kind !== request.mode) {
    errors.push(`payload.draft_kind must be ${request.mode} for this N7 mode`);
  }
  if (!isNonEmptyString(payload.draft)) errors.push("payload.draft must be a non-empty string");
  if (payload.publication_state !== "draft_unpublished") {
    errors.push("payload.publication_state must be draft_unpublished");
  }
  if (payload.human_review_required !== true) {
    errors.push("payload.human_review_required must be true; N7 drafts cannot bypass human review");
  }
  if (payload.automatic_publication !== false) {
    errors.push("payload.automatic_publication must be false; N7 cannot publish or send a draft");
  }

  type LocatedEvidence =
    | { kind: "fact"; record: Record<string, unknown> }
    | { kind: "resolution"; record: Record<string, unknown> }
    | { kind: "knowledge"; record: Record<string, unknown> };
  const locatedEvidence = evidence.map((span, index): LocatedEvidence | null => {
    const fact = context.reviewedFacts.find((record) =>
      record.source_ref === span.source_ref && isNonEmptyString(record.text) && record.text.includes(span.quote)
    );
    if (fact) return { kind: "fact", record: fact };
    const resolution = context.resolutionResult;
    if (
      resolution.source_ref === span.source_ref &&
      isNonEmptyString(resolution.text) &&
      resolution.text.includes(span.quote)
    ) {
      return { kind: "resolution", record: resolution };
    }
    const knowledge = context.reviewedKnowledge.find((record) =>
      record.source_ref === span.source_ref && isNonEmptyString(record.text) && record.text.includes(span.quote)
    );
    if (knowledge) return { kind: "knowledge", record: knowledge };
    errors.push(`evidence_spans[${index}] must be locatable in reviewed N7 input`);
    return null;
  });
  evidence.forEach((span, index) => {
    if (inspectUntrustedText(span.quote).prompt_injection_detected) {
      errors.push(`evidence_spans[${index}] must not treat prompt-injection directives as draft evidence`);
    }
  });

  const support = isIntegerArray(payload.supporting_evidence_indices)
    ? payload.supporting_evidence_indices
    : [];
  if (!isIntegerArray(payload.supporting_evidence_indices) || support.length === 0) {
    errors.push("payload.supporting_evidence_indices must be a non-empty integer array");
  }
  if (new Set(support).size !== support.length) {
    errors.push("payload.supporting_evidence_indices must not contain duplicates");
  }
  support.forEach((index) => {
    if (!evidence[index]) errors.push(`payload.supporting_evidence_indices references missing evidence ${index}`);
  });
  if (!support.some((index) => locatedEvidence[index]?.kind === "fact")) {
    errors.push("payload.supporting_evidence_indices must include an approved fact citation");
  }
  if (!support.some((index) => locatedEvidence[index]?.kind === "resolution")) {
    errors.push("payload.supporting_evidence_indices must include the verified resolution result");
  }

  if (!Array.isArray(payload.citations)) {
    errors.push("payload.citations must be an array");
  }
  const citations = Array.isArray(payload.citations) ? payload.citations : [];
  if (request.mode === "customer_reply" && citations.length === 0) {
    errors.push("payload.citations must contain approved knowledge for customer_reply");
  }
  const citedKnowledge = new Set<string>();
  const citedIndices = new Set<number>();
  citations.forEach((citation, citationIndex) => {
    const path = `payload.citations[${citationIndex}]`;
    if (!isObject(citation)) {
      errors.push(`${path} must be an object`);
      return;
    }
    validateExactFields(citation, ["knowledge_id", "version", "evidence_span_indices"], path, errors);
    if (!isNonEmptyString(citation.knowledge_id)) {
      errors.push(`${path}.knowledge_id must be a non-empty string`);
      return;
    }
    if (citedKnowledge.has(citation.knowledge_id)) {
      errors.push(`${path}.knowledge_id must not repeat an earlier citation`);
    }
    citedKnowledge.add(citation.knowledge_id);
    const knowledge = context.reviewedKnowledge.find((record) =>
      record.knowledge_id === citation.knowledge_id && record.version === citation.version
    );
    if (!knowledge) {
      errors.push(`${path} citation must match an approved knowledge_id and version`);
    }
    const indices = isIntegerArray(citation.evidence_span_indices)
      ? citation.evidence_span_indices
      : [];
    if (!isIntegerArray(citation.evidence_span_indices) || indices.length === 0) {
      errors.push(`${path}.evidence_span_indices must be a non-empty integer array`);
    }
    if (new Set(indices).size !== indices.length) {
      errors.push(`${path}.evidence_span_indices must not contain duplicates`);
    }
    indices.forEach((index) => {
      citedIndices.add(index);
      const located = locatedEvidence[index];
      if (!evidence[index]) {
        errors.push(`${path} citation references missing evidence ${index}`);
      } else if (
        !knowledge ||
        located?.kind !== "knowledge" ||
        located.record.knowledge_id !== knowledge.knowledge_id ||
        located.record.version !== knowledge.version
      ) {
        errors.push(`${path} citation evidence ${index} must come only from its approved knowledge record`);
      }
      if (!support.includes(index)) {
        errors.push(`${path} citation evidence ${index} must also be supporting evidence`);
      }
    });
  });

  const referenced = new Set([...support, ...citedIndices]);
  evidence.forEach((_span, index) => {
    if (!referenced.has(index)) errors.push(`evidence_spans[${index}] is not referenced by the N7 draft`);
  });
  if (Array.isArray(missingFields) && missingFields.length > 0) {
    errors.push("an ok N7 draft must not retain missing_fields");
  }
}

function validateN5SameEvent(
  input: JsonValue,
  payload: Record<string, unknown>,
  evidence: EvidenceSpan[],
  errors: string[],
): void {
  validateExactFields(payload, AI_NODE_DEFINITIONS.N5_SAME_EVENT.payload_fields, "payload", errors);
  if (payload.automatic_merge !== false) errors.push("payload.automatic_merge must be false");
  if (payload.automatic_relink !== false) errors.push("payload.automatic_relink must be false");
  if (!isObject(input)) {
    errors.push("N5 input must be an object");
    return;
  }
  for (const field of AI_NODE_DEFINITIONS.N5_SAME_EVENT.input_fields) {
    if (!(field in input)) errors.push(`input.${field} is required for N5 same_event_duplicate`);
  }

  const duplicate = payload.duplicate_candidate;
  if (duplicate === null) {
    if (payload.human_confirmation_required !== false) {
      errors.push("payload.human_confirmation_required must be false without a candidate");
    }
    if (evidence.length !== 0) {
      errors.push("N5 without a duplicate candidate must not include evidence_spans");
    }
    return;
  }
  if (!isObject(duplicate)) {
    errors.push("payload.duplicate_candidate must be an object or null");
    return;
  }
  validateExactFields(
    duplicate,
    ["candidate_case_id", "similarity", "evidence_span_indices"],
    "payload.duplicate_candidate",
    errors,
  );
  if (!isNonEmptyString(duplicate.candidate_case_id)) {
    errors.push("payload.duplicate_candidate.candidate_case_id must be a non-empty string");
  }
  if (typeof duplicate.similarity !== "number" || duplicate.similarity < 0 || duplicate.similarity > 1) {
    errors.push("payload.duplicate_candidate.similarity must be from 0 to 1");
  }
  const evidenceIndices =
    Array.isArray(duplicate.evidence_span_indices) && duplicate.evidence_span_indices.every(Number.isInteger)
      ? duplicate.evidence_span_indices as number[]
      : [];
  if (evidenceIndices.length !== (Array.isArray(duplicate.evidence_span_indices) ? duplicate.evidence_span_indices.length : -1)) {
    errors.push("payload.duplicate_candidate.evidence_span_indices must be an integer array");
  } else {
    if (evidenceIndices.length === 0) {
      errors.push("payload.duplicate_candidate.evidence_span_indices must not be empty");
    }
    evidenceIndices.forEach((index) => {
      if (!evidence[index as number]) errors.push(`duplicate candidate references missing evidence ${index}`);
    });
  }
  if (payload.human_confirmation_required !== true) {
    errors.push("payload.human_confirmation_required must be true with a candidate");
  }

  const caseFacts = input.case_facts;
  const sourceReference = input.source_reference;
  const time = input.time;
  const confirmedEntities = input.confirmed_entities;
  if (!isObject(caseFacts) || !isObject(caseFacts.current) || !Array.isArray(caseFacts.candidates)) {
    errors.push("input.case_facts must contain current and candidates");
    return;
  }
  const currentFacts = caseFacts.current;
  if (!isStringArray(currentFacts.facts)) {
    errors.push("input.case_facts.current.facts must be a string array");
    return;
  }
  const candidateFacts = caseFacts.candidates.find(
    (entry) => isObject(entry) && entry.case_id === duplicate.candidate_case_id,
  );
  if (!isObject(candidateFacts) || !isStringArray(candidateFacts.facts)) {
    errors.push("duplicate candidate must exist in input.case_facts.candidates with facts");
    return;
  }
  if (!isObject(sourceReference) || !isObject(sourceReference.current) || !Array.isArray(sourceReference.candidates)) {
    errors.push("input.source_reference must contain current and candidates");
    return;
  }
  const currentSource = sourceReference.current;
  if (!isNonEmptyString(currentSource.source_ref)) {
    errors.push("current case must have an input source reference");
    return;
  }
  const candidateSource = sourceReference.candidates.find(
    (entry) => isObject(entry) && entry.case_id === duplicate.candidate_case_id,
  );
  if (!isObject(candidateSource) || !isNonEmptyString(candidateSource.source_ref)) {
    errors.push("duplicate candidate must have an input source reference");
    return;
  }
  if (currentSource.source_ref === candidateSource.source_ref) {
    errors.push("same-event comparison requires distinct current and candidate source references");
  }
  const candidateTime = isObject(time) && Array.isArray(time.candidates)
    ? time.candidates.find((entry) => isObject(entry) && entry.case_id === duplicate.candidate_case_id)
    : undefined;
  const currentTime = isObject(time) ? time.current : undefined;
  if (!isObject(currentTime) || !isObject(candidateTime)) {
    errors.push("duplicate candidate must have an input time dimension");
  } else if (!isNonEmptyString(currentTime.occurred_at) || !isNonEmptyString(candidateTime.occurred_at)) {
    errors.push("same-event time dimensions must contain occurred_at");
  } else if (
    !Number.isFinite(Date.parse(currentTime.occurred_at)) ||
    !Number.isFinite(Date.parse(candidateTime.occurred_at))
  ) {
    errors.push("same-event time dimensions must contain parseable timestamps");
  }
  const candidateEntity = isObject(confirmedEntities) && Array.isArray(confirmedEntities.candidates)
    ? confirmedEntities.candidates.find((entry) => isObject(entry) && entry.case_id === duplicate.candidate_case_id)
    : undefined;
  const currentEntity = isObject(confirmedEntities) ? confirmedEntities.current : undefined;
  if (!isObject(currentEntity) || !isObject(candidateEntity)) {
    errors.push("duplicate candidate must have an input confirmed-entity dimension");
  } else if (
    currentEntity.formal_entity !== null &&
    candidateEntity.formal_entity !== null &&
    JSON.stringify(currentEntity.formal_entity) !== JSON.stringify(candidateEntity.formal_entity)
  ) {
    errors.push("confirmed entities conflict for a same-event candidate");
  }

  const referencedEvidence = new Set(evidenceIndices);
  if (referencedEvidence.size !== evidenceIndices.length) {
    errors.push("duplicate candidate evidence_span_indices must not contain duplicates");
  }
  evidence.forEach((_span, index) => {
    if (!referencedEvidence.has(index)) {
      errors.push(`evidence_spans[${index}] is not referenced by the duplicate candidate`);
    }
  });

  let hasCurrentEvidence = false;
  let hasCandidateEvidence = false;
  for (const index of evidenceIndices) {
    const span = evidence[index];
    if (!span) continue;
    if (span.source_ref === currentSource.source_ref && (currentFacts.facts as string[]).some((fact) => fact.includes(span.quote))) {
      hasCurrentEvidence = true;
    } else if (
      span.source_ref === candidateSource.source_ref &&
      (candidateFacts.facts as string[]).some((fact) => fact.includes(span.quote))
    ) {
      hasCandidateEvidence = true;
    } else {
      errors.push(`evidence_spans[${index}] must match the current or candidate source and facts`);
    }
  }
  if (!hasCurrentEvidence || !hasCandidateEvidence) {
    errors.push("same-event candidate requires evidence from both cases");
  }
}

interface N5CrossEventInputContext {
  currentCaseId: string;
  caseById: Map<string, Record<string, unknown>>;
  sourceByCaseId: Map<string, string>;
  existingClusterIds: Set<string>;
}

function validateCrossEventCase(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  validateExactFields(
    value,
    ["case_id", "status", "workflow_readiness", "summary", "same_event_resolution", "cluster_id"],
    path,
    errors,
  );
  if (!isNonEmptyString(value.case_id)) errors.push(`${path}.case_id must be a non-empty string`);
  if (value.status !== "已关闭" || value.workflow_readiness !== "closed") {
    errors.push(`${path} must be an 已关闭 case with workflow_readiness closed`);
  }
  if (!isNonEmptyString(value.summary)) errors.push(`${path}.summary must be a non-empty string`);
  if (value.same_event_resolution !== "not_required" && value.same_event_resolution !== "keep_separate") {
    errors.push(`${path}.same_event_resolution must prove the case is independent with not_required or keep_separate`);
  }
  if (value.cluster_id !== null && !isNonEmptyString(value.cluster_id)) {
    errors.push(`${path}.cluster_id must be null or a non-empty string`);
  }
  return value;
}

function validateN5CrossEventInput(
  input: JsonValue,
  errors: string[],
): N5CrossEventInputContext | null {
  if (!isObject(input)) {
    errors.push("N5 cross_event_clustering input must be an object");
    return null;
  }
  validateExactFields(input, AI_NODE_DEFINITIONS.N5_CROSS_EVENT.input_fields, "input", errors);
  if (!isObject(input.case_facts)) {
    errors.push("input.case_facts must be an object");
    return null;
  }
  validateExactFields(input.case_facts, ["current", "candidates"], "input.case_facts", errors);
  const current = validateCrossEventCase(input.case_facts.current, "input.case_facts.current", errors);
  const candidates = readObjectArray(input.case_facts.candidates, "input.case_facts.candidates", errors)
    .flatMap((record, index) => {
      const validated = validateCrossEventCase(record, `input.case_facts.candidates[${index}]`, errors);
      return validated ? [validated] : [];
    });
  if (candidates.length === 0) {
    errors.push("input.case_facts.candidates must contain at least one closed independent case");
  }
  if (!current || !isNonEmptyString(current.case_id)) return null;

  const cases = [current, ...candidates];
  const caseIds = cases.flatMap((record) => isNonEmptyString(record.case_id) ? [record.case_id] : []);
  if (new Set(caseIds).size !== caseIds.length) {
    errors.push("cross-event input case_id values must be distinct");
  }
  const caseById = new Map(caseIds.map((caseId, index) => [caseId, cases[index]]));

  if (!isObject(input.time)) {
    errors.push("input.time must be an object");
  } else {
    validateExactFields(input.time, ["current", "candidates"], "input.time", errors);
    const timeRecords = [input.time.current, ...(Array.isArray(input.time.candidates) ? input.time.candidates : [])];
    if (!Array.isArray(input.time.candidates)) errors.push("input.time.candidates must be an array");
    const timeIds: string[] = [];
    timeRecords.forEach((record, index) => {
      const path = index === 0 ? "input.time.current" : `input.time.candidates[${index - 1}]`;
      if (!isObject(record)) {
        errors.push(`${path} must be an object`);
        return;
      }
      validateExactFields(record, ["case_id", "closed_at"], path, errors);
      if (!isNonEmptyString(record.case_id)) errors.push(`${path}.case_id must be a non-empty string`);
      else timeIds.push(record.case_id);
      if (!isIsoTimestamp(record.closed_at)) errors.push(`${path}.closed_at must be an ISO timestamp`);
    });
    if ([...timeIds].sort().join("\u0000") !== [...caseIds].sort().join("\u0000")) {
      errors.push("input.time must cover exactly the cross-event case ids");
    }
  }

  if (!isObject(input.confirmed_entities)) {
    errors.push("input.confirmed_entities must be an object");
  } else {
    validateExactFields(
      input.confirmed_entities,
      ["current", "candidates"],
      "input.confirmed_entities",
      errors,
    );
    const entityRecords = [
      input.confirmed_entities.current,
      ...(Array.isArray(input.confirmed_entities.candidates) ? input.confirmed_entities.candidates : []),
    ];
    if (!Array.isArray(input.confirmed_entities.candidates)) {
      errors.push("input.confirmed_entities.candidates must be an array");
    }
    const entityIds: string[] = [];
    entityRecords.forEach((record, index) => {
      const path = index === 0
        ? "input.confirmed_entities.current"
        : `input.confirmed_entities.candidates[${index - 1}]`;
      if (!isObject(record)) {
        errors.push(`${path} must be an object`);
        return;
      }
      validateExactFields(record, ["case_id", "formal_entity"], path, errors);
      if (!isNonEmptyString(record.case_id)) errors.push(`${path}.case_id must be a non-empty string`);
      else entityIds.push(record.case_id);
      if (!isObject(record.formal_entity)) {
        errors.push(`${path}.formal_entity must be an object confirmed before closure`);
        return;
      }
      validateExactFields(
        record.formal_entity,
        ["vehicle_id", "task_id", "station_id"],
        `${path}.formal_entity`,
        errors,
      );
      for (const field of ["vehicle_id", "task_id", "station_id"] as const) {
        if (!isNonEmptyString(record.formal_entity[field])) {
          errors.push(`${path}.formal_entity.${field} must be a non-empty string`);
        }
      }
    });
    if ([...entityIds].sort().join("\u0000") !== [...caseIds].sort().join("\u0000")) {
      errors.push("input.confirmed_entities must cover exactly the cross-event case ids");
    }
  }

  const sourceByCaseId = new Map<string, string>();
  if (!isObject(input.source_reference)) {
    errors.push("input.source_reference must be an object");
  } else {
    validateExactFields(input.source_reference, ["current", "candidates"], "input.source_reference", errors);
    const sourceRecords = [
      input.source_reference.current,
      ...(Array.isArray(input.source_reference.candidates) ? input.source_reference.candidates : []),
    ];
    if (!Array.isArray(input.source_reference.candidates)) {
      errors.push("input.source_reference.candidates must be an array");
    }
    sourceRecords.forEach((record, index) => {
      const path = index === 0 ? "input.source_reference.current" : `input.source_reference.candidates[${index - 1}]`;
      if (!isObject(record)) {
        errors.push(`${path} must be an object`);
        return;
      }
      validateExactFields(record, ["case_id", "source_ref"], path, errors);
      if (!isNonEmptyString(record.case_id) || !isNonEmptyString(record.source_ref)) {
        errors.push(`${path} must contain non-empty case_id and source_ref`);
        return;
      }
      if (sourceByCaseId.has(record.case_id)) errors.push(`input.source_reference repeats case ${record.case_id}`);
      sourceByCaseId.set(record.case_id, record.source_ref);
    });
    if ([...sourceByCaseId.keys()].sort().join("\u0000") !== [...caseIds].sort().join("\u0000")) {
      errors.push("input.source_reference must cover exactly the cross-event case ids");
    }
    if (new Set(sourceByCaseId.values()).size !== sourceByCaseId.size) {
      errors.push("cross-event cases must have distinct source references");
    }
  }

  const existingClusterIds = new Set(
    cases.flatMap((record) => isNonEmptyString(record.cluster_id) ? [record.cluster_id] : []),
  );
  return {
    currentCaseId: current.case_id,
    caseById,
    sourceByCaseId,
    existingClusterIds,
  };
}

function validateN5CrossEvent(
  requestObjectRef: { object_type: string; object_id: string },
  input: JsonValue,
  payload: Record<string, unknown>,
  evidence: EvidenceSpan[],
  missingFields: unknown,
  errors: string[],
): void {
  validateExactFields(payload, AI_NODE_DEFINITIONS.N5_CROSS_EVENT.payload_fields, "payload", errors);
  if (payload.human_review_required !== true) {
    errors.push("payload.human_review_required must be true for cross-event cluster membership");
  }
  if (payload.automatic_merge !== false) errors.push("payload.automatic_merge must be false");
  if (payload.automatic_case_relink !== false) errors.push("payload.automatic_case_relink must be false");
  const context = validateN5CrossEventInput(input, errors);
  if (!context) return;
  if (
    requestObjectRef.object_type !== "case" ||
    context.currentCaseId !== requestObjectRef.object_id
  ) {
    errors.push("request.object_ref must identify input.case_facts.current as a case");
  }
  if (!isObject(payload.cluster_candidate)) {
    errors.push("payload.cluster_candidate must be an object");
    return;
  }
  const clusterCandidate = payload.cluster_candidate;
  validateExactFields(
    clusterCandidate,
    ["candidate_kind", "suggested_cluster_id", "member_cases", "similarity"],
    "payload.cluster_candidate",
    errors,
  );
  if (clusterCandidate.candidate_kind !== "new_cluster" && clusterCandidate.candidate_kind !== "existing_cluster") {
    errors.push("payload.cluster_candidate.candidate_kind must be new_cluster or existing_cluster");
  }
  if (clusterCandidate.candidate_kind === "new_cluster") {
    if (clusterCandidate.suggested_cluster_id !== null) {
      errors.push("a new_cluster candidate must have suggested_cluster_id null");
    }
  } else if (
    !isNonEmptyString(clusterCandidate.suggested_cluster_id) ||
    !context.existingClusterIds.has(clusterCandidate.suggested_cluster_id)
  ) {
    errors.push("an existing_cluster suggested_cluster_id must be present in the input cases");
  }
  if (
    typeof clusterCandidate.similarity !== "number" ||
    !Number.isFinite(clusterCandidate.similarity) ||
    clusterCandidate.similarity < 0 ||
    clusterCandidate.similarity > 1
  ) {
    errors.push("payload.cluster_candidate.similarity must be from 0 to 1");
  }
  if (!Array.isArray(clusterCandidate.member_cases) || clusterCandidate.member_cases.length < 2) {
    errors.push("payload.cluster_candidate.member_cases must contain at least two independent cases");
    return;
  }

  const memberIds = new Set<string>();
  const referencedEvidence = new Set<number>();
  clusterCandidate.member_cases.forEach((member, memberIndex) => {
    const path = `payload.cluster_candidate.member_cases[${memberIndex}]`;
    if (!isObject(member)) {
      errors.push(`${path} must be an object`);
      return;
    }
    validateExactFields(member, ["case_id", "evidence_span_indices"], path, errors);
    if (!isNonEmptyString(member.case_id) || !context.caseById.has(member.case_id)) {
      errors.push(`${path}.case_id must reference an input case`);
      return;
    }
    if (memberIds.has(member.case_id)) errors.push(`${path}.case_id must not repeat another member case`);
    memberIds.add(member.case_id);
    const indices = member.evidence_span_indices;
    if (!isIntegerArray(indices) || indices.length === 0) {
      errors.push(`${path}.evidence_span_indices must be a non-empty integer array`);
      return;
    }
    if (new Set(indices).size !== indices.length) {
      errors.push(`${path}.evidence_span_indices must not contain duplicates`);
    }
    const caseRecord = context.caseById.get(member.case_id);
    const expectedSource = context.sourceByCaseId.get(member.case_id);
    for (const index of indices) {
      if (referencedEvidence.has(index)) {
        errors.push(`${path} must not share evidence ${index} with another case`);
      }
      referencedEvidence.add(index);
      const span = evidence[index];
      if (
        !span ||
        span.source_ref !== expectedSource ||
        !isNonEmptyString(caseRecord?.summary) ||
        !caseRecord.summary.includes(span.quote)
      ) {
        errors.push(`${path} case evidence ${index} must match that input case and source`);
      } else if (inspectUntrustedText(span.quote).prompt_injection_detected) {
        errors.push(`${path} must not treat prompt-injection directives as clustering evidence`);
      }
    }
  });
  if (!memberIds.has(context.currentCaseId)) {
    errors.push("payload.cluster_candidate.member_cases must include the current case");
  }
  if (clusterCandidate.candidate_kind === "new_cluster") {
    for (const caseId of memberIds) {
      if (isNonEmptyString(context.caseById.get(caseId)?.cluster_id)) {
        errors.push("a new_cluster candidate cannot include a case already assigned to a cluster");
      }
    }
  } else {
    const selectedClusterIds = new Set(
      [...memberIds].flatMap((caseId) => {
        const clusterId = context.caseById.get(caseId)?.cluster_id;
        return isNonEmptyString(clusterId) ? [clusterId] : [];
      }),
    );
    if (!selectedClusterIds.has(clusterCandidate.suggested_cluster_id as string)) {
      errors.push("an existing_cluster candidate must include a member already assigned to suggested_cluster_id");
    }
    for (const caseId of memberIds) {
      const clusterId = context.caseById.get(caseId)?.cluster_id;
      if (isNonEmptyString(clusterId) && clusterId !== clusterCandidate.suggested_cluster_id) {
        errors.push("an existing_cluster candidate cannot combine conflicting input clusters");
      }
    }
  }
  evidence.forEach((_span, index) => {
    if (!referencedEvidence.has(index)) errors.push(`evidence_spans[${index}] is not referenced by a member case`);
  });
  if (Array.isArray(missingFields) && missingFields.length > 0) {
    errors.push("an ok N5 cross-event candidate must not retain missing_fields");
  }
}

interface N6RootCauseInputContext {
  clusterId: string;
  evidenceBySource: Map<string, Record<string, unknown>>;
  memberCaseIds: Set<string>;
  hypothesisById: Map<string, N6ValidatedCatalogItem>;
}

function validateN6RootCauseInput(
  input: JsonValue,
  errors: string[],
): N6RootCauseInputContext | null {
  if (!isObject(input)) {
    errors.push("N6 root_cause_hypothesis input must be an object");
    return null;
  }
  validateExactFields(input, AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.input_fields, "input", errors);
  const hypothesisById = validateN6HypothesisCatalog(input.hypothesis_catalog, errors);
  if (!isObject(input.issue_cluster)) {
    errors.push("input.issue_cluster must be an object");
    return null;
  }
  validateExactFields(
    input.issue_cluster,
    ["cluster_id", "member_case_ids", "status"],
    "input.issue_cluster",
    errors,
  );
  if (!isNonEmptyString(input.issue_cluster.cluster_id)) {
    errors.push("input.issue_cluster.cluster_id must be a non-empty string");
  }
  if (
    !isStringArray(input.issue_cluster.member_case_ids) ||
    input.issue_cluster.member_case_ids.length < 2
  ) {
    errors.push("input.issue_cluster.member_case_ids must contain at least two distinct cases");
  }
  const memberCaseIds = new Set(
    isStringArray(input.issue_cluster.member_case_ids) ? input.issue_cluster.member_case_ids : [],
  );
  if (
    Array.isArray(input.issue_cluster.member_case_ids) &&
    memberCaseIds.size !== input.issue_cluster.member_case_ids.length
  ) {
    errors.push("input.issue_cluster.member_case_ids must not contain duplicates");
  }
  if (!["待审核", "改进中", "观察中"].includes(input.issue_cluster.status as string)) {
    errors.push("input.issue_cluster.status must be a human-reviewed cluster state");
  }

  const evidenceRecords = readObjectArray(input.evidence, "input.evidence", errors);
  if (evidenceRecords.length < 3) {
    errors.push("input.evidence must provide support and counter-evidence across member cases");
  }
  const evidenceBySource = new Map<string, Record<string, unknown>>();
  evidenceRecords.forEach((record, index) => {
    const path = `input.evidence[${index}]`;
    validateExactFields(record, ["case_id", "source_ref", "text"], path, errors);
    if (!isNonEmptyString(record.case_id) || !memberCaseIds.has(record.case_id)) {
      errors.push(`${path}.case_id must be a problem-cluster member`);
    }
    if (!isNonEmptyString(record.source_ref) || !isNonEmptyString(record.text)) {
      errors.push(`${path} must contain non-empty source_ref and text`);
      return;
    }
    if (evidenceBySource.has(record.source_ref)) errors.push(`${path}.source_ref must be unique`);
    evidenceBySource.set(record.source_ref, record);
  });

  const resolutionRecords = readObjectArray(input.resolution_records, "input.resolution_records", errors);
  if (resolutionRecords.length === 0) {
    errors.push("input.resolution_records must contain reviewed disposition evidence");
  }
  resolutionRecords.forEach((record, index) => {
    const path = `input.resolution_records[${index}]`;
    validateExactFields(record, ["case_id", "source_ref", "text", "review_status"], path, errors);
    if (!isNonEmptyString(record.case_id) || !memberCaseIds.has(record.case_id)) {
      errors.push(`${path}.case_id must be a problem-cluster member`);
    }
    if (!isNonEmptyString(record.source_ref) || !isNonEmptyString(record.text)) {
      errors.push(`${path} must contain non-empty source_ref and text`);
    }
    if (record.review_status !== "approved") {
      errors.push(`${path}.review_status must be approved`);
    }
  });
  return {
    clusterId: isNonEmptyString(input.issue_cluster.cluster_id) ? input.issue_cluster.cluster_id : "",
    evidenceBySource,
    memberCaseIds,
    hypothesisById,
  };
}

function validateN6RootCause(
  requestObjectRef: { object_type: string; object_id: string },
  input: JsonValue,
  payload: Record<string, unknown>,
  evidence: EvidenceSpan[],
  missingFields: unknown,
  errors: string[],
): void {
  validateExactFields(payload, AI_NODE_DEFINITIONS.N6_ROOT_CAUSE.payload_fields, "payload", errors);
  scanProhibitedDecisionText(payload, "payload", errors);
  if (payload.human_review_required !== true) {
    errors.push("payload.human_review_required must be true for a root-cause hypothesis");
  }
  if (payload.final_root_cause !== false) {
    errors.push("payload.final_root_cause must be false; N6 cannot decide the final technical root cause");
  }
  const context = validateN6RootCauseInput(input, errors);
  if (!context) return;
  if (
    requestObjectRef.object_type !== "cluster" ||
    requestObjectRef.object_id !== context.clusterId
  ) {
    errors.push("request.object_ref must identify input.issue_cluster as a cluster");
  }
  const boundEvidenceRanges = new Map<number, BoundEvidenceRange>();
  evidence.forEach((span, index) => {
    const source = context.evidenceBySource.get(span.source_ref);
    if (!source || !isNonEmptyString(source.text)) {
      errors.push(`evidence_spans[${index}] must be locatable in input.evidence`);
      return;
    }
    const boundRange = bindN6RootEvidenceRange(
      span,
      source.text,
      `evidence_spans[${index}]`,
      errors,
    );
    if (boundRange) boundEvidenceRanges.set(index, boundRange);
  });
  if (!Array.isArray(payload.hypotheses) || payload.hypotheses.length === 0) {
    errors.push("payload.hypotheses must be a non-empty array");
    return;
  }
  const hypothesisIds = new Set<string>();
  const referencedEvidence = new Set<number>();
  payload.hypotheses.forEach((hypothesis, hypothesisIndex) => {
    const path = `payload.hypotheses[${hypothesisIndex}]`;
    if (!isObject(hypothesis)) {
      errors.push(`${path} must be an object`);
      return;
    }
    validateExactFields(
      hypothesis,
      [
        "hypothesis_id",
        "statement",
        "supporting_evidence_indices",
        "counter_evidence_indices",
        "uncertainty_ids",
        "uncertainties",
      ],
      path,
      errors,
    );
    let catalogItem: N6ValidatedCatalogItem | undefined;
    if (!validateN6CatalogId(hypothesis.hypothesis_id, "hypothesis", `${path}.hypothesis_id`, errors)) {
      errors.push(`${path}.hypothesis_id must reference input.hypothesis_catalog`);
    } else if (hypothesisIds.has(hypothesis.hypothesis_id)) {
      errors.push(`${path}.hypothesis_id must be unique`);
    } else {
      hypothesisIds.add(hypothesis.hypothesis_id);
      catalogItem = context.hypothesisById.get(hypothesis.hypothesis_id);
      if (!catalogItem) {
        errors.push(`${path}.hypothesis_id must reference input.hypothesis_catalog`);
      }
    }
    if (!isNonEmptyString(hypothesis.statement)) {
      errors.push(`${path}.statement must be a non-empty deterministic catalog rendering`);
    } else if (
      catalogItem
      && hypothesis.statement !== renderN6RootCauseStatement(
        catalogItem.factorLabel,
        catalogItem.phenomenonLabel,
      )
    ) {
      errors.push(`${path}.statement must exactly equal the deterministic input.hypothesis_catalog rendering`);
    }
    const support = isIntegerArray(hypothesis.supporting_evidence_indices)
      ? hypothesis.supporting_evidence_indices
      : [];
    const counter = isIntegerArray(hypothesis.counter_evidence_indices)
      ? hypothesis.counter_evidence_indices
      : [];
    if (support.length === 0) {
      errors.push(`${path}.supporting_evidence_indices must be a non-empty integer array`);
    }
    if (counter.length === 0) {
      errors.push(`${path}.counter_evidence_indices must be a non-empty integer array`);
    }
    if (new Set(support).size !== support.length) {
      errors.push(`${path}.supporting_evidence_indices must not contain duplicates`);
    }
    if (new Set(counter).size !== counter.length) {
      errors.push(`${path}.counter_evidence_indices must not contain duplicates`);
    }
    if (support.some((index) => counter.includes(index))) {
      errors.push(`${path} must not overlap support and counter-evidence`);
    }
    if (
      support.some((supportIndex) =>
        counter.some((counterIndex) =>
          boundEvidenceRangesOverlap(
            boundEvidenceRanges.get(supportIndex),
            boundEvidenceRanges.get(counterIndex),
          )
        )
      )
    ) {
      errors.push(`${path} must not use overlapping evidence as support and counter-evidence`);
    }
    const supportCaseIds = new Set<string>();
    for (const [kind, indices] of [["support", support], ["counter", counter]] as const) {
      for (const index of indices) {
        referencedEvidence.add(index);
        const span = evidence[index];
        if (!span) {
          errors.push(`${path}.${kind} references missing evidence ${index}`);
          continue;
        }
        const source = context.evidenceBySource.get(span.source_ref);
        if (!source || !isNonEmptyString(source.case_id) || !context.memberCaseIds.has(source.case_id)) {
          errors.push(`${path}.${kind} evidence ${index} must belong to a cluster member case`);
          continue;
        }
        if (kind === "support") supportCaseIds.add(source.case_id);
        if (inspectUntrustedText(span.quote).prompt_injection_detected) {
          errors.push(`${path}.${kind} must not treat prompt-injection directives as root-cause evidence`);
        }
      }
    }
    if (supportCaseIds.size < 2) {
      errors.push(`${path} must cite supporting evidence from at least two member cases`);
    }
    const uncertaintyIds = isStringArray(hypothesis.uncertainty_ids)
      ? hypothesis.uncertainty_ids
      : [];
    if (uncertaintyIds.length === 0) {
      errors.push(`${path}.uncertainty_ids must be a non-empty controlled term ID array`);
    }
    if (new Set(uncertaintyIds).size !== uncertaintyIds.length) {
      errors.push(`${path}.uncertainty_ids must not contain duplicates`);
    }
    const expectedUncertainties = uncertaintyIds.flatMap((uncertaintyId, uncertaintyIndex) => {
      if (!validateN6CatalogId(
        uncertaintyId,
        "uncertainty",
        `${path}.uncertainty_ids[${uncertaintyIndex}]`,
        errors,
      )) {
        return [];
      }
      const label = catalogItem?.uncertaintyById.get(uncertaintyId);
      if (!label) {
        errors.push(`${path}.uncertainty_ids[${uncertaintyIndex}] must reference the selected catalog item`);
        return [];
      }
      return [renderN6RootCauseUncertainty(label)];
    });
    if (!isStringArray(hypothesis.uncertainties) || hypothesis.uncertainties.length === 0) {
      errors.push(`${path}.uncertainties must be a non-empty string array`);
    } else if (
      hypothesis.uncertainties.length !== uncertaintyIds.length
      || expectedUncertainties.length !== uncertaintyIds.length
      || hypothesis.uncertainties.some(
        (uncertainty, uncertaintyIndex) => uncertainty !== expectedUncertainties[uncertaintyIndex],
      )
    ) {
      errors.push(`${path}.uncertainties must exactly equal the deterministic selected catalog renderings`);
    }
  });
  evidence.forEach((_span, index) => {
    if (!referencedEvidence.has(index)) errors.push(`evidence_spans[${index}] is not referenced by a hypothesis`);
  });
  if (Array.isArray(missingFields) && missingFields.length > 0) {
    errors.push("an ok N6 root-cause hypothesis must not retain missing_fields");
  }
}

export function validateNodeCandidate(
  request: AiNodeRunRequest<JsonValue>,
  value: unknown,
): NodeCandidateValidationResult {
  const errors: string[] = [];
  validateDefinition(request, errors);
  scanBlockedKeys(value, "candidate", errors);
  if (!isObject(value)) {
    return { valid: false, errors: [...errors, "candidate must be an object"] };
  }
  validateExactFields(value, AI_NODE_CANDIDATE_REQUIRED_FIELDS, "candidate", errors);

  if (!Array.isArray(value.evidence_spans)) {
    errors.push("candidate.evidence_spans must be an array");
  } else {
    value.evidence_spans.forEach((span, index) => validateEvidenceSpan(span, `candidate.evidence_spans[${index}]`, errors));
  }
  if (!isStringArray(value.missing_fields) && !(Array.isArray(value.missing_fields) && value.missing_fields.length === 0)) {
    errors.push("candidate.missing_fields must be a string array");
  }
  if (
    value.confidence !== null &&
    (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)
  ) {
    errors.push("candidate.confidence must be null or a number from 0 to 1");
  }
  if (!AI_NODE_STATUSES.includes(value.status as (typeof AI_NODE_STATUSES)[number])) {
    errors.push("candidate.status is invalid");
  }

  if (value.status !== "ok") {
    if (value.payload !== null) errors.push("non-ok candidate.payload must be null");
    return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
  }
  if (!isObject(value.payload)) {
    errors.push("ok candidate.payload must be an object");
  } else if (Array.isArray(value.evidence_spans)) {
    const evidence = value.evidence_spans as EvidenceSpan[];
    if (request.node === "N1") {
      validateN1(
        request.input,
        value.payload,
        evidence,
        value.missing_fields,
        request.object_ref.object_id,
        errors,
      );
    }
    else if (request.node === "N2") validateN2(request.input, value.payload, errors);
    else if (request.node === "N3") {
      validateN3(request.input, value.payload, evidence, request.object_ref.object_id, errors);
    }
    else if (request.node === "N4") {
      validateN4(request.input, value.payload, evidence, value.missing_fields, errors);
    }
    else if (request.node === "N5" && request.mode === "same_event_duplicate") {
      validateN5SameEvent(request.input, value.payload, evidence, errors);
    }
    else if (request.node === "N5" && request.mode === "cross_event_clustering") {
      validateN5CrossEvent(
        request.object_ref,
        request.input,
        value.payload,
        evidence,
        value.missing_fields,
        errors,
      );
    }
    else if (request.node === "N6" && request.mode === "responsibility_routing") {
      validateN6ResponsibilityRouting(request.input, value.payload, evidence, value.missing_fields, errors);
    }
    else if (request.node === "N6" && request.mode === "root_cause_hypothesis") {
      validateN6RootCause(
        request.object_ref,
        request.input,
        value.payload,
        evidence,
        value.missing_fields,
        errors,
      );
    }
    else if (request.node === "N7") {
      validateN7(request, value.payload, evidence, value.missing_fields, errors);
    }
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

export function asValidatedCandidate(value: unknown): AiNodeCandidate {
  return value as AiNodeCandidate;
}
