import {
  createOwnerFirstN1PreviewSession,
  makeOwnerFirstN1FailureReport,
} from "../ai/owner-first-n1-preview.js";
import { StrictJsonSequenceParser } from "../io/strict-json-sequence.js";

type ParserResult = ReturnType<StrictJsonSequenceParser["push"]>[number];

function writeReport(report: ReturnType<typeof makeOwnerFirstN1FailureReport>): void {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

async function run(): Promise<void> {
  if (process.argv.length !== 2) {
    writeReport(makeOwnerFirstN1FailureReport("input_frame_invalid", 0));
    process.exitCode = 1;
    return;
  }

  const parser = new StrictJsonSequenceParser();
  const session = createOwnerFirstN1PreviewSession();
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
        writeReport(makeOwnerFirstN1FailureReport(failure.issue_code, reportAttemptCount));
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

    if (!terminal) {
      await processResults(parser.finish());
    }
    if (!terminal) {
      process.exitCode = 1;
    }
  } catch {
    if (!terminal) {
      writeReport(makeOwnerFirstN1FailureReport("internal_validation_error", attemptCount));
    }
    process.exitCode = 1;
  } finally {
    session.dispose();
  }
}

void run().catch(() => {
  writeReport(makeOwnerFirstN1FailureReport("internal_validation_error", 0));
  process.exitCode = 1;
});
