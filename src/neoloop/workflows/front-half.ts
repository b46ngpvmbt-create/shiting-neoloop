import type { IngestRequest, WorkflowResult } from "../contracts/model.js";
import type { FrontHalfRunResult, FrontHalfStage } from "./model.js";
import type { W1Ports } from "./w1.js";
import { runW1 } from "./w1.js";
import type { W2Ports } from "./w2.js";
import { runW2 } from "./w2.js";
import { runW6SameEvent } from "./w6-same-event.js";

export type FrontHalfPorts = W1Ports & W2Ports;

function stage(phase: FrontHalfStage["phase"], result: WorkflowResult): FrontHalfStage {
  return { phase, result };
}

export async function runFrontHalf(
  request: IngestRequest,
  ports: FrontHalfPorts,
): Promise<FrontHalfRunResult> {
  const stages: FrontHalfStage[] = [];
  const w1 = await runW1(request, ports);
  stages.push(stage("W1", w1));
  if (w1.status === "failed" || w1.status === "needs_human") {
    return {
      status: w1.status,
      stopped_at: "W1",
      feedback_id: w1.object_ref.object_id,
      case_id: null,
      stages,
      request,
    };
  }

  const feedbackId = w1.object_ref.object_id;
  const w2 = await runW2(feedbackId, ports);
  stages.push(stage("W2", w2));
  if (w2.status === "failed" || w2.status === "needs_human") {
    return {
      status: w2.status,
      stopped_at: "W2",
      feedback_id: feedbackId,
      case_id: null,
      stages,
      request,
    };
  }

  const caseId = w2.object_ref.object_id;
  const w6 = await runW6SameEvent(caseId, ports);
  stages.push(stage("W6.same_event", w6));
  if (w6.status === "failed" || w6.status === "needs_human") {
    return {
      status: w6.status,
      stopped_at: "W6.same_event",
      feedback_id: feedbackId,
      case_id: caseId,
      stages,
      request,
    };
  }

  return {
    status: stages.every((entry) => entry.result.status === "idempotent") ? "idempotent" : "completed",
    stopped_at: null,
    feedback_id: feedbackId,
    case_id: caseId,
    stages,
    request,
  };
}
