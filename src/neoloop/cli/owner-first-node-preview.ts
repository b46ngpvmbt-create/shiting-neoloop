import {
  createOwnerFirstNodePreviewSession,
  isOwnerFirstNodeProfileId,
  makeOwnerFirstNodeFailureReport,
  type OwnerFirstNodePreviewReport,
} from "../ai/owner-first-node-preview.js";
import { StrictJsonSequenceParser } from "../io/strict-json-sequence.js";

type ParserResult = ReturnType<StrictJsonSequenceParser["push"]>[number];

function writeReport(report: OwnerFirstNodePreviewReport): void {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

async function run(): Promise<void> {
  const profileId = process.argv[2];
  if (process.argv.length !== 3) {
    writeReport(makeOwnerFirstNodeFailureReport(profileId, "input_frame_invalid", 0));
    process.exitCode = 1;
    return;
  }
  if (!isOwnerFirstNodeProfileId(profileId)) {
    writeReport(makeOwnerFirstNodeFailureReport(profileId, "profile_not_allowed", 0));
    process.exitCode = 1;
    return;
  }

  const parser = new StrictJsonSequenceParser();
  const session = createOwnerFirstNodePreviewSession(profileId);
  let attemptCount = 0;
  let terminal = false;

  const processResults = async (results: ParserResult[]): Promise<void> => {
    const failureIndex = results.findIndex((result) => !result.ok);
    if (failureIndex !== -1) {
      const failure = results[failureIndex];
      if (!failure.ok) {
        const completeFramesBeforeFailure = results
          .slice(0, failureIndex)
          .filter((result) => result.ok)
          .length;
        const reportAttemptCount = failure.issue_code === "attempt_limit_reached"
          ? Math.min(2, attemptCount + completeFramesBeforeFailure)
          : attemptCount;
        writeReport(makeOwnerFirstNodeFailureReport(
          profileId,
          failure.issue_code,
          reportAttemptCount,
        ));
        terminal = true;
        process.exitCode = 1;
      }
      return;
    }

    for (const result of results) {
      if (!result.ok || terminal) break;
      const report = await session.submit(result.value);
      attemptCount = report.attempt_count;
      writeReport(report);
      if (
        report.exact_14_generated
        || report.attempt_count >= 2
        || report.issue_codes.includes("internal_validation_error")
      ) {
        terminal = true;
        process.exitCode = report.classification === "exact_candidate_validated" ? 0 : 1;
      }
    }
  };

  try {
    for await (const chunk of process.stdin) {
      await processResults(parser.push(chunk as Uint8Array));
      if (terminal) {
        process.stdin.destroy();
        break;
      }
    }
    if (!terminal) await processResults(parser.finish());
    if (!terminal) process.exitCode = 1;
  } catch {
    if (!terminal) {
      writeReport(makeOwnerFirstNodeFailureReport(
        profileId,
        "internal_validation_error",
        attemptCount,
      ));
    }
    process.exitCode = 1;
  } finally {
    session.dispose();
  }
}

void run().catch(() => {
  writeReport(makeOwnerFirstNodeFailureReport(
    process.argv[2],
    "internal_validation_error",
    0,
  ));
  process.exitCode = 1;
});
