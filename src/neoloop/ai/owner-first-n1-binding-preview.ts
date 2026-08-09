import { snapshotPlainJsonData } from "../io/plain-json.js";
import { AI_NODE_CANDIDATE_REQUIRED_FIELDS } from "./definitions.js";
import {
  OWNER_FIRST_N1_BINDING_ALGORITHM,
  OWNER_FIRST_N1_BINDING_CONTRACT_VERSION,
  bindOwnerFirstN1Evidence,
  type OwnerFirstN1BindingReasonCode,
  type OwnerFirstN1BindingResult,
} from "./owner-first-n1-evidence-binding.js";
import {
  OWNER_FIRST_N1_REQUEST,
  createOwnerFirstN1PreviewSession,
  makeOwnerFirstN1FailureReport,
  type OwnerFirstN1IssueCode,
} from "./owner-first-n1-preview.js";

export const OWNER_FIRST_N1_BINDING_REPORT_VERSION = "owner_first_n1_preview_report.v2";

export interface OwnerFirstN1BindingReportDetails {
  contract_version: typeof OWNER_FIRST_N1_BINDING_CONTRACT_VERSION;
  algorithm: typeof OWNER_FIRST_N1_BINDING_ALGORITHM;
  offset_unit: "ecmascript_utf16_code_unit";
  normalization: "none";
  status: "bound" | "refused";
  span_count: number | null;
  source_sha256: string | null;
  candidate_before_sha256: string | null;
  candidate_after_sha256: string | null;
  reason_codes: OwnerFirstN1BindingReasonCode[];
}

export interface OwnerFirstN1BindingPreviewReport {
  schema_version: typeof OWNER_FIRST_N1_BINDING_REPORT_VERSION;
  classification: "candidate_validated_after_deterministic_binding" | "needs_human";
  attempt_count: number;
  candidate_top_level_keys: typeof AI_NODE_CANDIDATE_REQUIRED_FIELDS | null;
  exact_14_generated: boolean;
  issue_codes: OwnerFirstN1IssueCode[];
  binding: OwnerFirstN1BindingReportDetails;
}

export interface OwnerFirstN1BindingPreviewDiagnostics {
  attempt_count: number;
  runner_invocation_count: number;
  audit_count: number;
  retained_candidate_count: number;
  disposed: boolean;
}

export interface OwnerFirstN1BindingPreviewSession {
  readonly diagnostics: OwnerFirstN1BindingPreviewDiagnostics;
  submit(candidate: unknown): Promise<OwnerFirstN1BindingPreviewReport>;
  dispose(): void;
}

function sanitizedAttemptCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, 2);
}

export function makeOwnerFirstN1BindingFailureReport(
  issueCode: unknown,
  attemptCount: number,
): OwnerFirstN1BindingPreviewReport {
  const safeIssueCodes = makeOwnerFirstN1FailureReport(issueCode, attemptCount).issue_codes;
  const internal = safeIssueCodes.includes("internal_validation_error");
  return {
    schema_version: OWNER_FIRST_N1_BINDING_REPORT_VERSION,
    classification: "needs_human",
    attempt_count: sanitizedAttemptCount(attemptCount),
    candidate_top_level_keys: null,
    exact_14_generated: false,
    issue_codes: safeIssueCodes,
    binding: {
      contract_version: OWNER_FIRST_N1_BINDING_CONTRACT_VERSION,
      algorithm: OWNER_FIRST_N1_BINDING_ALGORITHM,
      offset_unit: "ecmascript_utf16_code_unit",
      normalization: "none",
      status: "refused",
      span_count: null,
      source_sha256: null,
      candidate_before_sha256: null,
      candidate_after_sha256: null,
      reason_codes: [internal ? "binding_internal_error" : "binding_input_invalid"],
    },
  };
}

function candidateTopLevelKeys(
  candidate: unknown,
): typeof AI_NODE_CANDIDATE_REQUIRED_FIELDS | null {
  const boundary = snapshotPlainJsonData(candidate);
  if (!boundary.ok || boundary.value === null || Array.isArray(boundary.value)) return null;
  if (typeof boundary.value !== "object") return null;
  const actual = Object.keys(boundary.value);
  if (
    actual.length !== AI_NODE_CANDIDATE_REQUIRED_FIELDS.length
    || !AI_NODE_CANDIDATE_REQUIRED_FIELDS.every((key) => actual.includes(key))
  ) {
    return null;
  }
  return AI_NODE_CANDIDATE_REQUIRED_FIELDS;
}

function bindingDetails(
  result: OwnerFirstN1BindingResult,
  forcedInternal = false,
): OwnerFirstN1BindingReportDetails {
  return {
    contract_version: OWNER_FIRST_N1_BINDING_CONTRACT_VERSION,
    algorithm: OWNER_FIRST_N1_BINDING_ALGORITHM,
    offset_unit: "ecmascript_utf16_code_unit",
    normalization: "none",
    status: forcedInternal ? "refused" : result.status,
    span_count: result.span_count,
    source_sha256: result.source_sha256,
    candidate_before_sha256: result.candidate_before_sha256,
    candidate_after_sha256: result.status === "bound" && !forcedInternal
      ? result.candidate_after_sha256
      : null,
    reason_codes: forcedInternal ? ["binding_internal_error"] : [...result.reason_codes],
  };
}

class BindingPreviewSession implements OwnerFirstN1BindingPreviewSession {
  private attempts = 0;
  private runnerInvocations = 0;
  private auditCount = 0;
  private terminal = false;
  private disposed = false;

  get diagnostics(): OwnerFirstN1BindingPreviewDiagnostics {
    return {
      attempt_count: this.attempts,
      runner_invocation_count: this.runnerInvocations,
      audit_count: this.auditCount,
      retained_candidate_count: 0,
      disposed: this.disposed,
    };
  }

  dispose(): void {
    this.terminal = true;
    this.disposed = true;
  }

  private makeReport(
    classification: OwnerFirstN1BindingPreviewReport["classification"],
    candidateKeys: typeof AI_NODE_CANDIDATE_REQUIRED_FIELDS | null,
    exact14Generated: boolean,
    issueCodes: readonly OwnerFirstN1IssueCode[],
    binding: OwnerFirstN1BindingReportDetails,
  ): OwnerFirstN1BindingPreviewReport {
    return {
      schema_version: OWNER_FIRST_N1_BINDING_REPORT_VERSION,
      classification,
      attempt_count: this.attempts,
      candidate_top_level_keys: candidateKeys,
      exact_14_generated: exact14Generated,
      issue_codes: [...issueCodes],
      binding,
    };
  }

  async submit(candidate: unknown): Promise<OwnerFirstN1BindingPreviewReport> {
    if (this.terminal || this.disposed) {
      throw new Error("owner-first N1 binding preview session is terminal or disposed");
    }
    if (this.attempts >= 2) {
      this.dispose();
      throw new Error("owner-first N1 binding preview session is terminal or disposed");
    }
    this.attempts += 1;
    const keys = candidateTopLevelKeys(candidate);
    const binding = bindOwnerFirstN1Evidence(
      OWNER_FIRST_N1_REQUEST,
      candidate,
    );

    if (binding.status === "refused") {
      if (this.attempts === 2) this.dispose();
      return this.makeReport(
        "needs_human",
        keys,
        false,
        binding.issue_codes,
        bindingDetails(binding),
      );
    }

    this.terminal = true;
    try {
      const strictSession = createOwnerFirstN1PreviewSession();
      const strictReport = await strictSession.submit(binding.candidate);
      const diagnostics = strictSession.diagnostics;
      this.runnerInvocations = diagnostics.invocation_count;
      this.auditCount = diagnostics.audit_count;
      if (
        strictReport.classification !== "exact_candidate_validated"
        || strictReport.exact_14_generated !== true
        || strictReport.issue_codes.length !== 0
      ) {
        this.disposed = true;
        return this.makeReport(
          "needs_human",
          keys,
          false,
          ["internal_validation_error"],
          bindingDetails(binding, true),
        );
      }
      this.disposed = true;
      return this.makeReport(
        "candidate_validated_after_deterministic_binding",
        keys,
        true,
        [],
        bindingDetails(binding),
      );
    } catch {
      this.disposed = true;
      return this.makeReport(
        "needs_human",
        keys,
        false,
        ["internal_validation_error"],
        bindingDetails(binding, true),
      );
    }
  }
}

export function createOwnerFirstN1BindingPreviewSession(): OwnerFirstN1BindingPreviewSession {
  return new BindingPreviewSession();
}
