import type { JsonValue } from "../contracts/model.js";
import type { AiNodeRunRequest } from "../contracts/ports.js";
import { canonicalJsonSha256, snapshotPlainJsonData } from "../io/plain-json.js";
import type { AiNodeCandidate } from "./definitions.js";
import {
  classifyOwnerFirstN1ValidationErrors,
  type OwnerFirstN1IssueCode,
} from "./owner-first-n1-preview.js";
import { validateNodeCandidate } from "./validation.js";

export const OWNER_FIRST_N1_BINDING_CONTRACT_VERSION = "owner_first_n1_candidate_binding.v1";
export const OWNER_FIRST_N1_BINDING_ALGORITHM = "utf16_exact_unique_v1";

export const OWNER_FIRST_N1_BINDING_REASON_CODES = [
  "binding_input_invalid",
  "binding_span_shape_invalid",
  "binding_empty_quote",
  "binding_source_ref_mismatch",
  "binding_source_snapshot_mismatch",
  "binding_quote_not_found",
  "binding_quote_ambiguous",
  "binding_unicode_invalid",
  "binding_grapheme_boundary_invalid",
  "binding_span_overlap",
  "binding_post_validation_failed",
  "binding_internal_error",
] as const;

export type OwnerFirstN1BindingReasonCode =
  (typeof OWNER_FIRST_N1_BINDING_REASON_CODES)[number];

interface BindingEvidence {
  span_count: number | null;
  source_sha256: string | null;
  candidate_before_sha256: string | null;
  candidate_after_sha256: string | null;
}

export type OwnerFirstN1BindingResult =
  | (BindingEvidence & {
      status: "bound";
      candidate: AiNodeCandidate;
      issue_codes: [];
      reason_codes: [];
    })
  | (BindingEvidence & {
      status: "refused";
      candidate: null;
      issue_codes: OwnerFirstN1IssueCode[];
      reason_codes: OwnerFirstN1BindingReasonCode[];
    });

const CANDIDATE_KEYS = [
  "payload",
  "evidence_spans",
  "missing_fields",
  "confidence",
  "status",
] as const;
const SPAN_KEYS = ["source_ref", "quote"] as const;

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, JsonValue>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

function sortReasonCodes(
  codes: Iterable<OwnerFirstN1BindingReasonCode>,
): OwnerFirstN1BindingReasonCode[] {
  const present = new Set(codes);
  return OWNER_FIRST_N1_BINDING_REASON_CODES.filter((code) => present.has(code));
}

function refused(
  issueCodes: readonly OwnerFirstN1IssueCode[],
  reasonCodes: Iterable<OwnerFirstN1BindingReasonCode>,
  evidence: Partial<BindingEvidence> = {},
): OwnerFirstN1BindingResult {
  return {
    status: "refused",
    candidate: null,
    issue_codes: [...issueCodes],
    reason_codes: sortReasonCodes(reasonCodes),
    span_count: evidence.span_count ?? null,
    source_sha256: evidence.source_sha256 ?? null,
    candidate_before_sha256: evidence.candidate_before_sha256 ?? null,
    candidate_after_sha256: null,
  };
}

function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function occurrenceOffsets(source: string, quote: string): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  while (cursor <= source.length - quote.length) {
    const found = source.indexOf(quote, cursor);
    if (found < 0) break;
    offsets.push(found);
    if (offsets.length > 1) break;
    cursor = found + 1;
  }
  return offsets;
}

function graphemeBoundaries(source: string): Set<number> | null {
  try {
    const boundaries = new Set<number>([0, source.length]);
    const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
    for (const segment of segmenter.segment(source)) boundaries.add(segment.index);
    return boundaries;
  } catch {
    return null;
  }
}

export function bindOwnerFirstN1Evidence(
  request: unknown,
  candidate: unknown,
): OwnerFirstN1BindingResult {
  try {
    const requestBoundary = snapshotPlainJsonData(request);
    const candidateBoundary = snapshotPlainJsonData(candidate);
    if (!requestBoundary.ok || !candidateBoundary.ok) {
      return refused(
        ["candidate_invalid_evidence_binding"],
        ["binding_input_invalid"],
      );
    }

    const requestSnapshot = requestBoundary.value;
    const candidateSnapshot = candidateBoundary.value;
    const candidateBeforeSha256 = canonicalJsonSha256(
      candidateSnapshot,
      "neoloop:owner-first-n1-candidate-before:v1",
    );
    const baseEvidence: Partial<BindingEvidence> = { candidate_before_sha256: candidateBeforeSha256 };
    if (!isRecord(requestSnapshot) || !isRecord(candidateSnapshot)) {
      return refused(["candidate_invalid_evidence_binding"], ["binding_input_invalid"], baseEvidence);
    }

    if (!hasExactKeys(candidateSnapshot, CANDIDATE_KEYS)) {
      const validation = validateNodeCandidate(
        requestSnapshot as unknown as AiNodeRunRequest<JsonValue>,
        candidateSnapshot,
      );
      const issues = validation.valid
        ? ["candidate_invalid_evidence_binding" as const]
        : classifyOwnerFirstN1ValidationErrors(validation.errors);
      return refused(issues, ["binding_input_invalid"], baseEvidence);
    }

    const spans = candidateSnapshot.evidence_spans;
    if (!Array.isArray(spans)) {
      return refused(
        ["candidate_invalid_evidence_binding"],
        ["binding_span_shape_invalid"],
        baseEvidence,
      );
    }
    baseEvidence.span_count = spans.length;
    if (spans.some((span) => !isRecord(span) || !hasExactKeys(span, SPAN_KEYS))) {
      return refused(
        ["candidate_invalid_evidence_binding"],
        ["binding_span_shape_invalid"],
        baseEvidence,
      );
    }

    const preValidation = validateNodeCandidate(
      requestSnapshot as unknown as AiNodeRunRequest<JsonValue>,
      candidateSnapshot,
    );
    if (!preValidation.valid) {
      return refused(
        classifyOwnerFirstN1ValidationErrors(preValidation.errors),
        ["binding_input_invalid"],
        baseEvidence,
      );
    }

    const objectRef = requestSnapshot.object_ref;
    const input = requestSnapshot.input;
    if (
      !isRecord(objectRef)
      || typeof objectRef.object_id !== "string"
      || !isRecord(input)
      || typeof input.original_text !== "string"
    ) {
      return refused(
        ["candidate_invalid_evidence_binding"],
        ["binding_input_invalid"],
        baseEvidence,
      );
    }
    const originalText = input.original_text;
    const sourceSha256 = canonicalJsonSha256(
      { object_id: objectRef.object_id, original_text: originalText },
      "neoloop:owner-first-n1-authoritative-source:v1",
    );
    baseEvidence.source_sha256 = sourceSha256;
    if (!isWellFormedUtf16(originalText)) {
      return refused(
        ["candidate_invalid_evidence_binding"],
        ["binding_unicode_invalid"],
        baseEvidence,
      );
    }
    const boundaries = graphemeBoundaries(originalText);
    if (boundaries === null) {
      return refused(
        ["candidate_invalid_evidence_binding"],
        ["binding_grapheme_boundary_invalid"],
        baseEvidence,
      );
    }

    const ranges: Array<{ start: number; end: number }> = [];
    for (const span of spans as Array<Record<string, JsonValue>>) {
      if (span.source_ref !== objectRef.object_id) {
        return refused(
          ["candidate_invalid_evidence_binding"],
          ["binding_source_ref_mismatch"],
          baseEvidence,
        );
      }
      if (typeof span.quote !== "string" || span.quote.trim().length === 0) {
        return refused(
          ["candidate_invalid_evidence_binding"],
          ["binding_empty_quote"],
          baseEvidence,
        );
      }
      if (!isWellFormedUtf16(span.quote)) {
        return refused(
          ["candidate_invalid_evidence_binding"],
          ["binding_unicode_invalid"],
          baseEvidence,
        );
      }
      const occurrences = occurrenceOffsets(originalText, span.quote);
      if (occurrences.length === 0) {
        return refused(
          ["candidate_invalid_evidence_binding"],
          ["binding_quote_not_found"],
          baseEvidence,
        );
      }
      if (occurrences.length !== 1) {
        return refused(
          ["candidate_invalid_evidence_binding"],
          ["binding_quote_ambiguous"],
          baseEvidence,
        );
      }
      const start = occurrences[0];
      const end = start + span.quote.length;
      if (!boundaries.has(start) || !boundaries.has(end)) {
        return refused(
          ["candidate_invalid_evidence_binding"],
          ["binding_grapheme_boundary_invalid"],
          baseEvidence,
        );
      }
      ranges.push({ start, end });
    }

    const sortedRanges = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
    for (let index = 1; index < sortedRanges.length; index += 1) {
      if (sortedRanges[index].start < sortedRanges[index - 1].end) {
        return refused(
          ["candidate_invalid_evidence_binding"],
          ["binding_span_overlap"],
          baseEvidence,
        );
      }
    }

    const boundCandidate = {
      ...candidateSnapshot,
      evidence_spans: (spans as Array<Record<string, JsonValue>>).map((span, index) => ({
        ...span,
        start_offset: ranges[index].start,
        end_offset: ranges[index].end,
      })),
    } as unknown as AiNodeCandidate;
    const postValidation = validateNodeCandidate(
      requestSnapshot as unknown as AiNodeRunRequest<JsonValue>,
      boundCandidate,
    );
    if (!postValidation.valid) {
      return refused(
        classifyOwnerFirstN1ValidationErrors(postValidation.errors),
        ["binding_post_validation_failed"],
        baseEvidence,
      );
    }

    const finalRequestBoundary = snapshotPlainJsonData(request);
    if (
      !finalRequestBoundary.ok
      || canonicalJsonSha256(
        finalRequestBoundary.value,
        "neoloop:owner-first-n1-request-snapshot:v1",
      ) !== canonicalJsonSha256(
        requestSnapshot,
        "neoloop:owner-first-n1-request-snapshot:v1",
      )
    ) {
      return refused(
        ["candidate_invalid_evidence_binding"],
        ["binding_source_snapshot_mismatch"],
        baseEvidence,
      );
    }

    return {
      status: "bound",
      candidate: structuredClone(boundCandidate),
      issue_codes: [],
      reason_codes: [],
      span_count: spans.length,
      source_sha256: sourceSha256,
      candidate_before_sha256: candidateBeforeSha256,
      candidate_after_sha256: canonicalJsonSha256(
        boundCandidate as unknown as JsonValue,
        "neoloop:owner-first-n1-candidate-after:v1",
      ),
    };
  } catch {
    return refused(["internal_validation_error"], ["binding_internal_error"]);
  }
}
