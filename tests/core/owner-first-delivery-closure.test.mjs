import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOwnerFirstDeliveryAudit,
} from "../../scripts/competition/audit-owner-first-delivery-closure.mjs";

const report = buildOwnerFirstDeliveryAudit();

test("owner-first N1 and N2-N7 have a complete worktree dependency closure", () => {
  assert.equal(report.schema_version, "owner_first_delivery_dependency_audit.v1");
  assert.equal(report.checks.worktree_dependency_closure_complete, true);
  assert.equal(report.groups.n1.worktree_reproducible, true);
  assert.equal(report.groups.n2_n7.worktree_reproducible, true);
  assert.equal(report.groups.live_bridge.worktree_reproducible, true);
  assert.deepEqual(report.groups.n1.unresolved_local_imports, []);
  assert.deepEqual(report.groups.n2_n7.unresolved_local_imports, []);
  assert.deepEqual(report.groups.live_bridge.unresolved_local_imports, []);
  assert.deepEqual(report.groups.n1.missing_from_worktree, []);
  assert.deepEqual(report.groups.n2_n7.missing_from_worktree, []);
  assert.deepEqual(report.groups.live_bridge.missing_from_worktree, []);
});

test("audit exposes every worktree-only delivery path without making the gap permanent", () => {
  for (const group of Object.values(report.groups)) {
    const calculatedHeadGaps = group.required_paths
      .filter((path) => !path.head_tracked)
      .map((path) => path.path);
    assert.deepEqual(group.required_but_absent_from_head, calculatedHeadGaps);
    assert.equal(group.head_reproducible, calculatedHeadGaps.length === 0);
    for (const path of group.required_paths.filter((entry) => !entry.head_tracked)) {
      assert.equal(path.worktree_exists, true, `${path.path} must not be a phantom delivery path`);
      assert.match(path.worktree_sha256, /^[a-f0-9]{64}$/u);
    }
  }
  assert.equal(
    report.checks.head_dependency_closure_complete,
    Object.values(report.groups).every((group) => group.head_reproducible),
  );
});

test("synthetic baseline is bound to every current src/neoloop TypeScript source", () => {
  assert.equal(report.synthetic_baseline_binding.current_source_file_count, 44);
  assert.equal(report.synthetic_baseline_binding.matches_current_tree, true);
  assert.equal(report.checks.synthetic_baseline_covers_current_src_neoloop, true);
});

test("dependency audit does not stage any owner-first delivery path", () => {
  assert.equal(report.checks.no_owner_first_required_paths_staged, true);
  assert.deepEqual(report.groups.n1.staged_required_paths, []);
  assert.deepEqual(report.groups.n2_n7.staged_required_paths, []);
  assert.deepEqual(report.groups.live_bridge.staged_required_paths, []);
});
