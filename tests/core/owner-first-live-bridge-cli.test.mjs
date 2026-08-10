import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WRAPPER = fileURLToPath(new URL(
  "../../feishu/scripts/run-owner-first-live-bridge.mjs",
  import.meta.url,
));
const RS = "\u001e";

function validInput() {
  const text = "合成演示：车辆 SYN-VEHICLE-X6-107 舱门无法解锁。";
  const id = "SYN-LIVE-DEMO-FEEDBACK-CLI-001";
  return {
    schema_version: "owner_first_live_bridge_input.v1",
    profile_id: "n1-default",
    data_scope: "synthetic_experiment",
    observed_at: "2026-08-11T04:00:00.000Z",
    request: {
      node: "N1",
      mode: "default",
      version: "N1-1.0.0-draft.2",
      object_ref: { object_type: "raw_feedback", object_id: id },
      input: { original_text: text, channel_metadata: { channel: "owner-first-live-demo" } },
    },
    candidates: [{
      payload: {
        fact_spans: [{ fact: text, evidence_span_index: 0 }],
        request: text,
        request_evidence_span_index: 0,
        entity_clues: { vehicle_ids: ["SYN-VEHICLE-X6-107"], task_ids: [], station_names: [] },
      },
      evidence_spans: [{ source_ref: id, quote: text }],
      missing_fields: [],
      confidence: 0.91,
      status: "ok",
    }],
  };
}

function run(input) {
  return spawnSync(process.execPath, [WRAPPER], {
    input,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

test("live bridge CLI accepts one strict JSON sequence frame and emits one report", () => {
  const result = run(`${RS}${JSON.stringify(validInput())}\n`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.classification, "exact_14_ready_for_owner_confirmation");
  assert.equal(report.write_plan.confirmation_required, true);
});

test("live bridge CLI rejects duplicate frames and duplicate keys without echoing input", () => {
  const value = JSON.stringify(validInput());
  const duplicateFrames = run(`${RS}${value}\n${RS}${value}\n`);
  assert.equal(duplicateFrames.status, 1);
  assert.equal(duplicateFrames.stderr, "");
  const frameReport = JSON.parse(duplicateFrames.stdout);
  assert.equal(frameReport.classification, "needs_human");
  assert.deepEqual(frameReport.issue_codes, ["input_frame_invalid"]);

  const duplicateKey = run(`${RS}{"schema_version":"owner_first_live_bridge_input.v1","schema_version":"owner_first_live_bridge_input.v1"}\n`);
  assert.equal(duplicateKey.status, 1);
  assert.equal(duplicateKey.stderr, "");
  assert.doesNotMatch(duplicateKey.stdout, /owner-first-live-demo|SYN-LIVE-DEMO/u);
});
