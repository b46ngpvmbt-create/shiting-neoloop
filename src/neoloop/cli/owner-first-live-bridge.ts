import {
  makeOwnerFirstLiveBridgeFailureReport,
  runOwnerFirstLiveBridge,
  type OwnerFirstLiveBridgeIssueCode,
} from "../ai/owner-first-live-bridge.js";
import { StrictJsonSequenceParser } from "../io/strict-json-sequence.js";
import type { StrictJsonSequenceIssueCode } from "../io/strict-json-sequence.js";

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function normalizeParserIssue(
  issueCode: StrictJsonSequenceIssueCode,
): OwnerFirstLiveBridgeIssueCode {
  return issueCode === "attempt_limit_reached" ? "input_frame_invalid" : issueCode;
}

async function run(): Promise<void> {
  if (process.argv.length !== 2) {
    write(makeOwnerFirstLiveBridgeFailureReport("input_frame_invalid"));
    process.exitCode = 1;
    return;
  }
  const parser = new StrictJsonSequenceParser();
  const frames: Record<string, unknown>[] = [];
  let parseIssue: OwnerFirstLiveBridgeIssueCode | null = null;

  for await (const chunk of process.stdin) {
    for (const result of parser.push(chunk as Uint8Array)) {
      if (!result.ok) {
        parseIssue = normalizeParserIssue(result.issue_code);
        break;
      }
      frames.push(result.value);
      if (frames.length > 1) {
        parseIssue = "input_frame_invalid";
        break;
      }
    }
    if (parseIssue !== null) {
      process.stdin.destroy();
      break;
    }
  }
  if (parseIssue === null) {
    for (const result of parser.finish()) {
      if (!result.ok) parseIssue = normalizeParserIssue(result.issue_code);
      else frames.push(result.value);
    }
  }
  if (parseIssue !== null || frames.length !== 1) {
    write(makeOwnerFirstLiveBridgeFailureReport(parseIssue ?? "input_frame_invalid"));
    process.exitCode = 1;
    return;
  }

  const frame = frames[0];
  const keys = Object.keys(frame);
  const expectedKeys = [
    "schema_version",
    "profile_id",
    "data_scope",
    "observed_at",
    "request",
    "candidates",
  ];
  if (
    keys.length !== expectedKeys.length
    || !expectedKeys.every((key) => keys.includes(key))
    || frame.schema_version !== "owner_first_live_bridge_input.v1"
  ) {
    write(makeOwnerFirstLiveBridgeFailureReport("input_shape_invalid"));
    process.exitCode = 1;
    return;
  }
  const report = await runOwnerFirstLiveBridge({
    profile_id: frame.profile_id,
    data_scope: frame.data_scope,
    observed_at: frame.observed_at,
    request: frame.request,
    candidates: frame.candidates,
  });
  write(report);
  process.exitCode = report.classification === "exact_14_ready_for_owner_confirmation" ? 0 : 1;
}

void run().catch(() => {
  write(makeOwnerFirstLiveBridgeFailureReport("internal_validation_error"));
  process.exitCode = 1;
});
