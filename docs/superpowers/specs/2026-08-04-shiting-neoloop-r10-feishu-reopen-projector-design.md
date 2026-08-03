# 石听 NeoLoop R10｜飞书复发重开投影器设计

日期：2026-08-04
状态：C 方案书面规格已通过 T1/T2/T3 终验；待参赛者确认
适用范围：W6 `reopen_recurrence` 到飞书 Base 的离线投影合同
事实分类：方案设计；本地用例与结果只能标记为合成实验

## 1. 目的与边界

R9 已冻结复发重开的授权、语义重放、状态提交和安全错误分类，但还没有一份可以把“首次成功重开的原始 commit receipt”转换成飞书写计划的工程合同。R10 只补这一层，避免飞书清单先于代码合同写成既成能力。

R10 不修改 R9 的状态机、授权顺序、公开结果、W6 数量或 Base 模型。它也不接飞书 SDK，不访问真实 Base，不创建资源 ID，不写车辆控制，不自动判责、赔偿、承诺恢复时间或确认最终根因。

本轮保持以下基线不变：

- 一个 Base、10 张表、5 个视图、3 个逻辑业务角色；
- 7 个 AI 节点、6 条工作流；
- 公开事实、待企业验证、方案设计、合成实验四类证据分开；
- 现场权限、跨表原子性、失败恢复和 exactly-once 均继续标记为 `not_tested/null/0`。

## 2. 采用 C 方案

采用“可信核验器 + 最小脱敏源 + 纯规划器 + 密封计划续写”的独立 projector core：

```text
R9 首次 committed reopen receipt
        │
        ▼
可信 source/verifier（核验完整私有 proof，计算 receipt hash）
        │ 只输出最小 VerifiedProjectionSource
        ▼
纯 planW6ReopenProjection（读取合法 Base before 快照）
        │
        ├── 内部 ProjectionWritePlan：供受控执行器使用
        └── 外部 RedactedProjectionArtifact：供日志和证据使用

原写计划已密封且部分执行
        │
        ▼
纯 reconcileW6ReopenProjection（只修同一计划的未完成目标）
```

manifest 只镜像已经通过测试并冻结哈希的合同，不能充当运行时真源。单独的 receipt hash helper 也不能代替 projector。

## 3. 文件与所有权

R10 实施阶段只允许新增：

```text
src/neoloop/adapters/feishu/w6-reopen-projector.ts
tests/core/feishu-w6-reopen-projector.test.mjs
src/neoloop/records/2026-08-04-t3-r10-feishu-reopen-projector.md
```

仅当现有 runner 无法自动发现新测试时，才允许修改 `tests/core/run-core-tests.mjs`。不得修改 `model.ts`、R9 四件套、状态枚举、canonical 数据、公开站、飞书九文件或依赖。飞书九文件必须等 R10 独立验收通过后由 T2 单独同步。

## 4. 触发入口与信任边界

### 4.1 闭集触发

适配层只接受内部工作流已经完成授权分类的闭集触发：

```ts
type FeishuW6ReopenProjectionTrigger =
  | Readonly<{
      kind: "committed_new_reopen";
      receipt_id: string;
      data_scope: "synthetic_experiment";
      evidence_class: "synthetic_experiment";
    }>
  | Readonly<{
      kind: "authorized_exact_replay";
      data_scope: "synthetic_experiment";
      evidence_class: "synthetic_experiment";
    }>
  | Readonly<{
      kind: "authorized_near_conflict";
      data_scope: "synthetic_experiment";
      evidence_class: "synthetic_experiment";
    }>;
```

- `committed_new_reopen`：读取可信 commit 来源并规划一次投影。
- `authorized_exact_replay`：直接返回 `no_op`；receipt、Base、outbox 和哈希调用均为 0。
- `authorized_near_conflict`：直接返回 `reject/event_conflict`；receipt、Base、outbox 和哈希调用均为 0。
- 未授权 exact、near、miss 永远不会进入 R10。

exact 业务重放不承担投影修复。若首次业务 commit 已成功但投影执行失败，必须由首次 commit 同一条 durable outbox 记录重新投递原 receipt；重放业务请求仍保持零读零写。outbox 必须在首次 commit 时保存与该 receipt 密封绑定的 commit-after 快照，之后不得从“当前最新状态”重建旧快照。

### 4.2 可信来源不是调用方自报

公共组合入口只接受闭集 trigger。Base before 快照、平台能力证明和 commit proof 都由受信 composition root 自行读取；调用方不能提交 `projection_before`、`WorkflowResult`、`W6CommitResult`、receipt、history、cycle、能力布尔值或“已核验”标记。

```ts
type HandleW6ReopenProjection = (
  trigger: FeishuW6ReopenProjectionTrigger,
) => Promise<RedactedProjectionArtifact>;
```

公共 façade 只能返回 `RedactedProjectionArtifact`，不能返回内部 plan、patch、execution directive 或含敏感文本的 opaque object。内部 `loadAndPlanW6ReopenProjection`、两个纯函数、端口工厂和 planning result 均不从公共 barrel 导出，只在私有 outbox/executor 组合层和测试中使用。

`W6ReopenCommitSourcePort`、Base snapshot port、capability attestation port 和 outbox port 只在受信 composition root 中注入。普通调用方拿不到这些端口，也不能替换 verifier。恶意替换本机 composition root 或依赖注入容器不在 R10 的威胁模型内；可信端口返回损坏或伪造数据仍必须失败关闭。

```ts
interface W6ReopenCommitSourcePort {
  loadFirstCommittedReopenByReceiptId(receiptId: string): Promise<unknown>;
}
```

### 4.3 私有 proof 核验

verifier 可以短暂读取完整私有 commit proof，但必须在同一信任边界内完成以下检查：

- 来源 outcome 精确等于 `committed`，不得接受 `idempotent`、`concurrency_conflict` 或 semantic replay 合成结果；
- receipt 只含 `W6CommitReceipt` 的精确字段集合；
- `phase === "recurrence"`，`action === "reopen_recurrence"`；
- `improvement_id`、`target_fingerprint`、`cycle_id` 均为非空字符串，`checkpoint_id === null`；
- 必须以 `receipt.history_id`、`receipt.cycle_id` 精确选取 history entry 与 observation cycle，禁止使用数组最后一项、当前/latest 对象或 semantic replay 的替代 proof；
- receipt、精确选取的 history/cycle、与该 receipt 同时密封的 cluster after/improvement after 快照之 ID、时间、状态和成员互相一致；receipt/history 的 `case_ids` 与 cluster after 成员精确相等，cycle triggering IDs 必须是其中新增且非空的有序子集；
- `receipt.committed_at === history.occurred_at === cycle.opened_at === cluster_after.updated_at === improvement_after.updated_at`；
- cluster 与 improvement 状态均为 `观察中`；
- `case_ids`、cluster member IDs 与 cycle triggering IDs 均无重复，并与同一密封 proof 中的对应数组逐项精确一致；R10 不排序或重排；
- `receipt_id` 与入口请求精确相等；`data_scope/evidence_class` 精确等于 `synthetic_experiment`；
- 原始 receipt 的完整合法字段被转换为新的 plain `JsonValue` 后才计算域分离 SHA-256。

verifier 完成核验和哈希后，立即丢弃私有 proof，只向纯规划器交付：

```ts
interface VerifiedW6ReopenProjectionSource {
  readonly source_contract: "verified_w6_reopen_projection_source.v1";
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly source_receipt_id: string;
  readonly source_receipt_sha256: string;
  readonly committed_at: string;
  readonly triggering_case_ids: readonly string[];
  readonly cluster_after: Readonly<{
    cluster_id: string;
    member_case_ids: readonly string[];
    status: "观察中";
    updated_at: string;
  }>;
  readonly improvement_after: Readonly<{
    improvement_id: string;
    status: "观察中";
    updated_at: string;
  }>;
}

interface PrivateVerifiedW6ReopenCommitEnvelope {
  readonly projection_source: VerifiedW6ReopenProjectionSource;
  readonly canonical_receipt_material: JsonValue;
}
```

私有 verifier 返回 `PrivateVerifiedW6ReopenCommitEnvelope`：纯规划器只收到其中的 `projection_source`；`canonical_receipt_material` 由 composition 直接交给可信 outbox 做 receipt/digest/plan 原子绑定，不能进入 planner、Base、artifact 或日志。

纯规划器不得收到 receipt 原文、history、cycle、`principal`、`opened_by`、policy、grant、claims、W5 provenance、私有 semantic lookup fingerprint 或底层异常。

## 5. Descriptor-safe 输入规范

任何 `unknown` 在字段读取或哈希前都经过递归安全快照。实现必须使用 Node `util.types.isProxy` 拒绝 Proxy，并基于 own property descriptors 复制值，不通过普通属性访问触发 getter。

闭集规则如下：

- 只允许 `null`、字符串、布尔值、安全整数、dense array、prototype 为 `Object.prototype` 或 `null` 的 plain object；
- 拒绝 accessor、Proxy、symbol key、non-enumerable own field、unexpected field、`undefined`、函数、BigInt、NaN、Infinity、`-0`、循环引用、稀疏数组、Date、Map、Set、typed array 和自定义 prototype；
- 普通对象的每个业务字段必须是 enumerable own data property；`writable/configurable` 可以是 true 或 false，因此合法 frozen DTO 不会被误拒绝；数组只允许标准 `length` descriptor 和 `0..n-1` 连续索引；
- 通用业务 ID 与 case ID 统一复用 R9 可表达的 ASCII 闭集 `[A-Za-z0-9._:-]{1,128}`，不新增 `SYN-CASE-` 强制前缀；R10 不重新排序数组，只验证无重复并与 receipt/history/cycle/after 的密封顺序逐项精确相等；
- 时间必须匹配 `YYYY-MM-DDTHH:mm:ss.sssZ` 且 round-trip 后完全相等；SHA-256 为 64 位小写十六进制；自由文本不做 Unicode normalization，并拒绝孤立 UTF-16 surrogate；
- 最大递归深度 24、总节点数 20,000、普通数组长度 1,000、before `recurrence_records` 长度 499、observed/after 长度 500、单个属性名 128 个 Unicode scalar、单个自由文本 4,096 个 Unicode scalar、完整安全快照 UTF-8 编码 1 MiB；超过任一上限即在哈希前拒绝；
- 任何输入失败时，accessor getter 调用数与 hasher 调用数都必须为 0。

安全快照、验证结果、规划结果和写计划全部递归冻结。测试用注入 hasher 只用于证明“校验先于哈希”和碰撞失败关闭；生产实现继续复用 `createWorkflowEventFingerprint`，不创建第二套 SHA-256。

## 6. Receipt 哈希、碰撞处理与投影键

receipt 哈希的唯一输入是完整、exact-shape、已安全快照的 reopen receipt：

```ts
createWorkflowEventFingerprint({
  contract: "neoloop.feishu.w6-reopen-projection-receipt.v1",
  receipt: exactReceiptJsonValue,
});
```

结果定义为：

- `source_receipt_sha256`：64 位小写 SHA-256；
- `projection_idempotency_key`：与 `source_receipt_sha256` 相同；
- `projector_key`：`neoloop.feishu.w6-reopen.v1`。

不得挑选部分 receipt 字段后再哈希，不得使用 public semantic replay 结果反推 receipt，不得在 Base、日志或证据模板保存 receipt 原文。

哈希不是“绝不会碰撞”的声明。可信 source/outbox 私下保存 receipt ID 与 exact canonical material 的绑定：

- 相同 receipt ID 但 canonical material 或 digest 不同：`commit_proof_mismatch`；
- 不同 receipt ID 得到已占用 digest：`projection_conflict`；
- 相同 receipt ID、相同 canonical material、相同 digest：允许重投同一 sealed plan；
- 测试向 verifier 注入碰撞 hasher 时，前两种情况必须零写失败。

canonical material 只存在于可信 source/outbox，不进入 `VerifiedW6ReopenProjectionSource`、Base 或外部 artifact。

## 7. Base 投影前快照

`projection_before` 是对两个 Base 目标的 exact、只读、合成实验快照：

```ts
interface W6ReopenProjectionBefore {
  readonly projection_contract: "w6_reopen_projection_before.v1";
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly cluster: Readonly<{
    cluster_id: string;
    member_case_ids: readonly string[];
    status: "已归档";
    recurrence_records: readonly ClusterRecurrenceRecord[];
    updated_at: string;
  }>;
  readonly improvement: Readonly<{
    improvement_id: string;
    status: "已完成";
    day_7_result: string;
    day_30_result: string;
    human_conclusion: string;
    updated_at: string;
  }>;
}
```

平台能力由另一个可信端口生成 `TrustedProjectionCapabilityAttestation`，不能从 Base 行或外部 trigger 读取。它精确声明 `execution_mode` 为 `atomic_all_targets | sealed_outbox_cas | insufficient`，并证明 `recurrence_visibility_no_broader_than_source_fields`。纯规划器接收的是 composition root 已核验、递归冻结的 attestation；未来执行器还必须复核同一个 attestation ID。现场未取得真实证明时只能使用 `insufficient`。

```ts
interface TrustedProjectionCapabilityAttestation {
  readonly attestation_contract: "w6_reopen_projection_capability.v1";
  readonly attestation_id: string;
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment" | "solution_design";
  readonly verification_status: "synthetic_fixture" | "not_tested" | "onsite_verified";
  readonly execution_mode: "atomic_all_targets" | "sealed_outbox_cas" | "insufficient";
  readonly recurrence_visibility_no_broader_than_source_fields: boolean;
  readonly permission_snapshot_sha256: string | null;
  readonly permission_revision: string | null;
  readonly issued_at: string | null;
  readonly expires_at: string | null;
  readonly evidence_unit_ref: string | null;
  readonly verified_by_role: "test_harness" | "authorized_competition_operator" | null;
}
```

交叉约束固定为：

- `not_tested`：execution mode 必须为 `insufficient`，其余证明字段均为 null；
- `synthetic_fixture`：只供离线测试，`evidence_class=synthetic_experiment`、`verified_by_role=test_harness`，可以生成不可现场执行的候选计划；
- `onsite_verified`：必须带 P02/P03 evidence unit、权限快照 SHA、权限/视图 revision、签发时间、过期时间和 `authorized_competition_operator`；
- 权限关系为 false、证明过期或 execution mode 为 `insufficient` 时，一律返回 `platform_capability_insufficient`；
- 真实执行器只接受未过期的 `onsite_verified`；R10 本地测试不能把 `synthetic_fixture` 冒充为飞书现场证明。

composition 必须从私有 trusted clock 取得 attempt-local `capability_checked_at`，并验证 `issued_at <= capability_checked_at < expires_at`。实时 checked time 不进入 sealed-plan preimage、计划身份或 directive，避免同 receipt 并发因毫秒不同变成不同计划；执行器在实际 CAS 前重新取 `capability_rechecked_at` 并重复验证，只把 rechecked time 写入可信 execution evidence/ack。计划后到写前过期必须零写失败。

三个历史文本必须是 1 至 4096 个 Unicode scalar 的非空字符串。它们来自 Base before 快照，不能从 runtime `RuntimeImprovementProject` 推断，因为该类型没有 Day-7/Day-30 字段。

`member_case_ids` 必须无重复并保持 Base 原顺序；`recurrence_records` 保持 append-only 原顺序，不做重排。来源 ID 必须与 `VerifiedW6ReopenProjectionSource` 一致，before 状态必须是 `已归档/已完成`。

规划器还必须证明成员绑定：before 成员与 verified `triggering_case_ids` 均无重复、两者不相交、triggering 非空，二者集合并集精确等于 source 的 cluster after 成员；写计划直接使用 source after 的密封数组顺序。缺成员、多成员、混入其他簇成员、替换 trigger 或把 before 当成 after 的任意子集都返回 `commit_proof_mismatch`。

## 8. recurrence record 与可见性

`recurrence_records` 是 R7 与 R10 共用的 append-only 容器。为兼容既有 active-observation intake，冻结判别联合：

```ts
type ClusterRecurrenceRecord =
  | ReopenSnapshotV1
  | PreservedNonR10RecurrenceRecord;

type PreservedNonR10RecurrenceRecord = Readonly<Record<string, JsonValue>>;
```

`PreservedNonR10RecurrenceRecord` 只能由 descriptor-safe JSON validator 构造：它是 plain `JsonObject`，不得拥有值为 `reopen_snapshot.v1` 的 `projection_contract`。R10 不解释、不补字段、不重排、不改写这类既有记录；若 discriminator 精确等于 `reopen_snapshot.v1`，则必须按下列 R10 exact shape 校验，不能降级为 opaque preserve。

合法 miss 只在数组末尾追加一条 exact-shape 记录：

```ts
interface ReopenSnapshotV1 {
  readonly projection_contract: "reopen_snapshot.v1";
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly source_receipt_sha256: string;
  readonly projection_idempotency_key: string;
  readonly committed_at: string;
  readonly previous_projection: Readonly<{
    day_7_result: string;
    day_30_result: string;
    human_conclusion: string;
  }>;
  readonly previous_projection_sha256: string;
}
```

`previous_projection_sha256` 使用域 `neoloop.feishu.w6-reopen.previous-projection.v1` 和三个 exact 字段计算。Base 内保存原值是为了在清空当前周期字段后保留合成演示历史；它属于内部 `ProjectionWritePlan` 的业务写，不属于外部审计 artifact。

这次移动不得扩大可见范围。raw `recurrence_records` 的可见逻辑角色精确为 `{improvement_insight}`，与 Day-7、Day-30、人工结论三个字段读权限的交集相同；`feedback_understanding`、`case_coordination` 和 P03 无特权账号均不得读取 raw JSON。`issue_map` 与 `improvement_tracking` 的低权限投影必须移除 raw 字段；若平台不能在不新增 canonical 字段的前提下生成可靠脱敏摘要，就直接隐藏，不增加第六视图或第十一表。P03 必须同时测试视图和直接表访问。

计划时记录权限快照，执行前按相同 revision 重验。来源三字段被收窄或 `recurrence_records` 被放宽都视为权限漂移，返回 `platform_capability_insufficient`、零写。R10 只允许 `synthetic_experiment`；将来若处理企业真实文本，必须另立隐私规格，不能复用本合同直接放行。

Base 只保存 receipt hash，不保存 `source_receipt_id`。receipt ID、canonical material 与 digest 的精确绑定留在可信 outbox；相同 receipt 的不同 material/digest 为 `commit_proof_mismatch`，相同 digest 的第二个 receipt、相同 receipt/digest 的不同 sealed plan 或重复键内容不一致为 `projection_conflict`。

## 9. 指纹域与精确字段

所有 CAS 指纹都由已验证 plain `JsonValue` 计算，不包含自由选择字段。

| 指纹 | 域 | 精确字段 |
| --- | --- | --- |
| cluster before | `neoloop.feishu.w6-reopen.cluster-before.v1` | `data_scope, cluster_id, member_case_ids, status, recurrence_records, updated_at` |
| cluster after | `neoloop.feishu.w6-reopen.cluster-after.v1` | 同上；成员为 source after，records 只追加本次 snapshot，状态与时间为 source after |
| improvement before | `neoloop.feishu.w6-reopen.improvement-before.v1` | `data_scope, improvement_id, status, day_7_result, day_30_result, human_conclusion, updated_at` |
| improvement after | `neoloop.feishu.w6-reopen.improvement-after.v1` | 同上；状态与时间为 source after，三个结果字段精确为 `null` |
| capability attestation | `neoloop.feishu.w6-reopen.capability-attestation.v1` | attestation exact fields、权限快照、revision、有效期、evidence ref 与 execution mode |
| resolved record locator | `neoloop.feishu.w6-reopen.record-locator.v1` | `target, table, selector, opaque_locator, base_schema_revision`；原 locator 不外显 |
| sealed plan | `neoloop.feishu.w6-reopen.sealed-plan.v1` | receipt ID/hash、四个目标指纹、两个 exact write target、capability attestation ID/SHA、execution mode、permission snapshot/revision、projector key、data/evidence 标签；preimage 不含实时 checked time 与稍后附加的 `sealed_plan_sha256` 本身 |

对象 key 由 `createWorkflowEventFingerprint` 递归排序。成员数组使用 R9/Base 密封的原顺序且无重复，规划器不替调用方排序或修正；`recurrence_records` 是 append-only 有序数组，顺序属于指纹。

这里允许的 fingerprint 只有 receipt 摘要、previous projection 摘要、四个域分离 CAS 指纹、capability attestation SHA、resolved locator SHA 和 sealed plan SHA。R9 私有 semantic lookup fingerprint 仍在递归 denylist 内。

## 10. 内部写计划与外部 artifact

### 10.1 内部 ProjectionWritePlan

内部写计划是不可变、不可记录到普通日志的执行对象：

```ts
interface ClusterProjectionWriteTarget {
  readonly target: "clusters";
  readonly selector: Readonly<{ field: "cluster_id"; value: string }>;
  readonly expected_before_sha256: string;
  readonly expected_after_sha256: string;
  readonly patch: Readonly<{
    member_case_ids: readonly string[];
    status: "观察中";
    recurrence_records: readonly ClusterRecurrenceRecord[];
    updated_at: string;
  }>;
}

interface ImprovementProjectionWriteTarget {
  readonly target: "improvements";
  readonly selector: Readonly<{ field: "improvement_id"; value: string }>;
  readonly expected_before_sha256: string;
  readonly expected_after_sha256: string;
  readonly patch: Readonly<{
    status: "观察中";
    day_7_result: null;
    day_30_result: null;
    human_conclusion: null;
    updated_at: string;
  }>;
}

interface ProjectionWritePlan {
  readonly plan_contract: "w6_reopen_projection_plan.v1";
  readonly projector_key: "neoloop.feishu.w6-reopen.v1";
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly source_receipt_id: string;
  readonly source_receipt_sha256: string;
  readonly projection_idempotency_key: string;
  readonly capability_attestation_id: string;
  readonly capability_attestation_sha256: string;
  readonly execution_mode: "atomic_all_targets" | "sealed_outbox_cas";
  readonly permission_snapshot_sha256: string;
  readonly permission_revision: string;
  readonly write_targets: readonly [
    ClusterProjectionWriteTarget,
    ImprovementProjectionWriteTarget,
  ];
  readonly sealed_plan_sha256: string;
}
```

写目标只使用 canonical business-key selector。未来可信 Base executor 现场解析真实 Feishu record ID，并把 selector→opaque record locator 的结果保存在私有 outbox/CAS 证据中；不得假设业务 ID 等于飞书 record ID，也不得在计划、artifact、九文件或测试 fixture 预填真实资源 ID。

每个 selector 必须在目标表精确命中一条记录；0 条或多于 1 条均为 `projection_conflict`、零写。解析后以域 `neoloop.feishu.w6-reopen.record-locator.v1` 对 `{target, table, selector, opaque_locator, base_schema_revision}` exact preimage 计算 `resolved_record_locator_sha256`，写入对应 target ack。跨表 locator、selector/locator proof swap、schema revision 漂移或摘要不一致全部拒绝；原 locator 不进入 plan、artifact 或普通日志。

`ProjectionWritePlan` 永远保留完整的两个 target。实际执行范围另用不可变指令表达，避免 repair 把原计划改造成新的单表计划：

```ts
type ProjectionExecutionDirective =
  | Readonly<{
      mode: "both";
      sealed_plan_sha256: string;
      capability_attestation_sha256: string;
      permission_revision: string;
      pending_targets: readonly ["clusters", "improvements"];
    }>
  | Readonly<{
      mode: "cluster_only";
      sealed_plan_sha256: string;
      capability_attestation_sha256: string;
      permission_revision: string;
      pending_targets: readonly ["clusters"];
    }>
  | Readonly<{
      mode: "improvement_only";
      sealed_plan_sha256: string;
      capability_attestation_sha256: string;
      permission_revision: string;
      pending_targets: readonly ["improvements"];
    }>;
```

`apply_once` 的 `pending_targets` 精确为两个目标；`repair` 精确为尚未完成的一个目标；数组顺序固定为 `clusters, improvements`。

精确写白名单只有：

```text
clusters.member_case_ids
clusters.status
clusters.recurrence_records
clusters.updated_at
improvements.status
improvements.day_7_result
improvements.day_30_result
improvements.human_conclusion
improvements.updated_at
```

不得写案件、原始反馈、工单、SLA、知识索引、AI 审计业务表、车辆、任务、站点或任何控制字段。

### 10.2 外部 RedactedProjectionArtifact

外部 artifact 与内部计划是两个不同类型。外部 artifact 只能拥有以下 own-key allowlist：

```text
projector_key
data_scope
evidence_class
projection_idempotency_key
decision
cluster_id
improvement_id
cluster_expected_before_sha256
cluster_expected_after_sha256
improvement_expected_before_sha256
improvement_expected_after_sha256
sealed_plan_sha256
write_targets
planned_target_count
repair_required
repair_target
redaction_status
safe_error
```

精确类型按 decision 分开，避免 decision、count、repair 标记和 safe error 互相矛盾：

```ts
interface RedactedArtifactBase {
  readonly projector_key: "neoloop.feishu.w6-reopen.v1";
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly redaction_status: "passed";
}

interface RedactedBoundArtifactFields {
  readonly projection_idempotency_key: string;
  readonly cluster_id: string;
  readonly improvement_id: string;
  readonly cluster_expected_before_sha256: string;
  readonly cluster_expected_after_sha256: string;
  readonly improvement_expected_before_sha256: string;
  readonly improvement_expected_after_sha256: string;
  readonly sealed_plan_sha256: string;
}

type RedactedProjectionArtifact =
  | Readonly<RedactedArtifactBase & RedactedBoundArtifactFields & {
      decision: "apply_once";
      write_targets: readonly ["clusters", "improvements"];
      planned_target_count: 2;
      repair_required: false;
      repair_target: null;
      safe_error: null;
    }>
  | Readonly<RedactedArtifactBase & RedactedBoundArtifactFields & {
      decision: "repair";
      write_targets: readonly ["clusters"];
      planned_target_count: 1;
      repair_required: true;
      repair_target: "clusters";
      safe_error: null;
    }>
  | Readonly<RedactedArtifactBase & RedactedBoundArtifactFields & {
      decision: "repair";
      write_targets: readonly ["improvements"];
      planned_target_count: 1;
      repair_required: true;
      repair_target: "improvements";
      safe_error: null;
    }>
  | Readonly<RedactedArtifactBase & RedactedBoundArtifactFields & {
      decision: "already_applied";
      write_targets: readonly [];
      planned_target_count: 0;
      repair_required: false;
      repair_target: null;
      safe_error: null;
    }>
  | Readonly<RedactedArtifactBase & {
      decision: "no_op";
      projection_idempotency_key: null;
      cluster_id: null;
      improvement_id: null;
      cluster_expected_before_sha256: null;
      cluster_expected_after_sha256: null;
      improvement_expected_before_sha256: null;
      improvement_expected_after_sha256: null;
      sealed_plan_sha256: null;
      write_targets: readonly [];
      planned_target_count: 0;
      repair_required: false;
      repair_target: null;
      safe_error: null;
    }>
  | Readonly<RedactedArtifactBase & {
      decision: "reject";
      projection_idempotency_key: string | null;
      cluster_id: string | null;
      improvement_id: string | null;
      cluster_expected_before_sha256: string | null;
      cluster_expected_after_sha256: string | null;
      improvement_expected_before_sha256: string | null;
      improvement_expected_after_sha256: string | null;
      sealed_plan_sha256: string | null;
      write_targets: readonly [];
      planned_target_count: 0;
      repair_required: false;
      repair_target: null;
      safe_error: W6ReopenProjectionError;
    }>;
```

`write_targets` 只允许表逻辑名，不包含 patch。artifact 递归禁止 internal plan、patch、execution directive、business-key selector、record locator、source receipt ID、receipt/history/cycle 原文、三个历史文本、`previous_projection`、`opened_by`、principal、grant、claims、policy、W5 provenance、私有 semantic fingerprint、拒绝原文、底层错误和 stack。

### 10.3 私有 composition ports

异步组合层的接口必须在实现前冻结，且不从公共 barrel 导出：

```ts
interface W6ReopenProjectionBasePort {
  loadProjectionStateByBusinessKeys(input: Readonly<{
    cluster_id: string;
    improvement_id: string;
  }>): Promise<unknown>;
}

interface W6ReopenProjectionCapabilityPort {
  loadCurrentAttestation(): Promise<unknown>;
  revalidatePermissionRevision(input: Readonly<{
    attestation_id: string;
    permission_snapshot_sha256: string;
    permission_revision: string;
    checked_at: string;
  }>): Promise<boolean>;
}

interface W6ReopenProjectionTrustedClockPort {
  nowIsoUtc(): string;
}

type ProjectionOutboxLookup =
  | Readonly<{ outcome: "not_found" }>
  | Readonly<{
      outcome: "found";
      plan: ProjectionWritePlan;
    }>;

type ProjectionOutboxSealResult =
  | Readonly<{ outcome: "sealed"; plan: ProjectionWritePlan }>
  | Readonly<{ outcome: "existing_same"; plan: ProjectionWritePlan }>
  | Readonly<{ outcome: "receipt_conflict" }>
  | Readonly<{ outcome: "digest_conflict" }>
  | Readonly<{ outcome: "plan_conflict" }>;

interface W6ReopenProjectionOutboxPort {
  loadByReceiptId(receiptId: string): Promise<ProjectionOutboxLookup>;
  sealPlanIfAbsent(input: Readonly<{
    plan: ProjectionWritePlan;
    canonical_receipt_material: JsonValue;
  }>): Promise<ProjectionOutboxSealResult>;
  loadExecutionEvidence(sealedPlanSha256: string):
    Promise<TrustedProjectionExecutionEvidence | null>;
}

interface W6ReopenProjectionCompositionPorts {
  source: W6ReopenCommitSourcePort;
  base: W6ReopenProjectionBasePort;
  capability: W6ReopenProjectionCapabilityPort;
  clock: W6ReopenProjectionTrustedClockPort;
  outbox: W6ReopenProjectionOutboxPort;
  hashJsonValue(value: JsonValue): string;
}

declare function createW6ReopenProjectionComposition(
  ports: W6ReopenProjectionCompositionPorts,
): Readonly<{ handle: HandleW6ReopenProjection }>;
```

`sealPlanIfAbsent` 必须在 receipt ID、digest owner、canonical receipt material 和 sealed plan 四个维度原子比较；同 receipt 并发只能得到一个 `sealed`，其余只能是 `existing_same`。不同 receipt 被测试 hasher 强制成同 digest 时，只能有一个 digest owner，另一方 `digest_conflict`、零 Base 写。

错误映射唯一固定为：`receipt_conflict → commit_proof_mismatch`；`digest_conflict | plan_conflict → projection_conflict`。实现不得按调用路径把同一种 outbox outcome 映射成不同安全错误。

生产 composition 固定使用 `createWorkflowEventFingerprint`。可注入 hasher 的工厂只供测试直接模块导入，不进入公共 barrel。source、Base、capability、clock、outbox 或 hasher 的 reject/throw 必须在 façade 捕获并归一化为 `projection_dependency_failure` 与固定 UI 文案；异常 message、cause、stack 和端口返回原文均不得进入 artifact 或日志。

## 11. 纯函数 API 与结果闭集

只有以下两个函数被定义为纯函数：

```ts
function planW6ReopenProjection(
  verifiedSource: VerifiedW6ReopenProjectionSource,
  projectionBefore: W6ReopenProjectionBefore,
  capability: TrustedProjectionCapabilityAttestation,
  capabilityCheckedAt: string,
): W6InternalProjectionResult;

function reconcileW6ReopenProjection(
  originalPlan: ProjectionWritePlan,
  observedState: W6ReopenProjectionObservedState,
  executionEvidence: TrustedProjectionExecutionEvidence,
): W6InternalProjectionResult;
```

`loadAndPlanW6ReopenProjection` 是异步 composition function，不得称为纯函数。source port、Base reader、outbox reader/writer 和未来执行器均不属于纯规划器。

决策闭集：

```text
apply_once
repair
already_applied
no_op
reject
```

结果是 exact 判别联合：

```ts
type W6InternalProjectionResult =
  | Readonly<{
      decision: "apply_once";
      plan: ProjectionWritePlan;
      execution: Extract<ProjectionExecutionDirective, { mode: "both" }>;
      artifact: Extract<RedactedProjectionArtifact, { decision: "apply_once" }>;
    }>
  | Readonly<{
      decision: "repair";
      plan: ProjectionWritePlan;
      execution: Extract<ProjectionExecutionDirective, { mode: "cluster_only" }>;
      artifact: Extract<RedactedProjectionArtifact, {
        decision: "repair";
        repair_target: "clusters";
      }>;
    }>
  | Readonly<{
      decision: "repair";
      plan: ProjectionWritePlan;
      execution: Extract<ProjectionExecutionDirective, { mode: "improvement_only" }>;
      artifact: Extract<RedactedProjectionArtifact, {
        decision: "repair";
        repair_target: "improvements";
      }>;
    }>
  | Readonly<{
      decision: "already_applied";
      plan: null;
      execution: null;
      artifact: Extract<RedactedProjectionArtifact, { decision: "already_applied" }>;
    }>
  | Readonly<{
      decision: "no_op";
      plan: null;
      execution: null;
      artifact: Extract<RedactedProjectionArtifact, { decision: "no_op" }>;
    }>
  | Readonly<{
      decision: "reject";
      plan: null;
      execution: null;
      artifact: Extract<RedactedProjectionArtifact, { decision: "reject" }>;
    }>;
```

reconcile 的 observed DTO 只允许两个投影目标的 exact 字段：cluster 状态为 `已归档 | 观察中`，improvement 状态为 `已完成 | 观察中`，三个结果字段分别为 `string | null`；其余字段与第 7 节相同。任何额外字段、第三种状态或混合 partial patch 都是 `invalid_projection_input` 或 `projection_conflict`。

```ts
interface W6ReopenProjectionObservedState {
  readonly projection_contract: "w6_reopen_projection_observed.v1";
  readonly data_scope: "synthetic_experiment";
  readonly evidence_class: "synthetic_experiment";
  readonly cluster: Readonly<{
    cluster_id: string;
    member_case_ids: readonly string[];
    status: "已归档" | "观察中";
    recurrence_records: readonly ClusterRecurrenceRecord[];
    updated_at: string;
  }>;
  readonly improvement: Readonly<{
    improvement_id: string;
    status: "已完成" | "观察中";
    day_7_result: string | null;
    day_30_result: string | null;
    human_conclusion: string | null;
    updated_at: string;
  }>;
}
```

可信 execution evidence 的 exact schema 为：

```ts
interface TrustedProjectionExecutionEvidence {
  readonly evidence_contract: "w6_reopen_projection_execution_evidence.v1";
  readonly source_receipt_id: string;
  readonly source_receipt_sha256: string;
  readonly sealed_plan_sha256: string;
  readonly capability_attestation_id: string;
  readonly capability_attestation_sha256: string;
  readonly capability_rechecked_at: string;
  readonly execution_mode: "atomic_all_targets" | "sealed_outbox_cas";
  readonly permission_snapshot_sha256: string;
  readonly permission_revision: string;
  readonly exact_plan_material_match: true;
  readonly acknowledged_target_count: 0 | 1 | 2;
  readonly target_acks: readonly Readonly<{
    target: "clusters" | "improvements";
    expected_after_sha256: string;
    applied_by_sealed_plan_sha256: string;
    capability_attestation_sha256: string;
    capability_rechecked_at: string;
    permission_snapshot_sha256: string;
    permission_revision: string;
    resolved_record_locator_sha256: string;
  }>[];
}
```

`target_acks` 按 `clusters, improvements` 排序且不可重复，长度必须等于 `acknowledged_target_count`；每个 ack 必须绑定相同 plan、attestation 和 permission revision。它来自可信 outbox，不来自 Base 行、调用方或 artifact。真实 record locator 只保存在可信执行器中，证据里只有域分离摘要。

异步 composition 的分流固定为：

1. 对每个 `committed_new_reopen`，包括 outbox 命中和旧 A 在新 B 之后重投，都先按 plan/trigger 的 `source_receipt_id` 调用精确 source verifier，重算 receipt hash，并核对 receipt/history/cycle/同 commit after 快照；自洽但伪造的 outbox plan/evidence 不能绕过权威 commit proof。
2. outbox `not_found` 时读取 B/B before、当前 capability/clock，调用 `planW6ReopenProjection`，再原子 `sealPlanIfAbsent`。
3. `sealed` 是本次唯一初始计划所有者；只有该分支能把 `apply_once` directive 交给私有 outbox worker。
4. `existing_same` 必须丢弃本地 plan/directive，以返回的 authoritative plan 为准；随后通过唯一的 `loadExecutionEvidence` 读取 evidence，再读 observed state 并 reconcile。若仍为 B/B 且 ack=0，外部并发 loser 返回零写 `projection_conflict`，不能重复取得初始执行权；真正的崩溃续跑由 durable outbox worker 的私有 lease 负责。
5. 直接 `found` 路径同样先重验 source，再通过 `loadExecutionEvidence` 与 observed state reconcile；`ProjectionOutboxLookup` 不携带第二份 evidence。普通 façade 的 found B/B+ack0 必须丢弃 execution directive 并零写拒绝；只有 durable outbox worker 持有未过期、单所有者的私有 execution lease 时，才可恢复原计划。lease 不进入公共类型、artifact 或调用方输入。

因此 A/A、A/B、B/A 不会被强塞进只允许 `已归档/已完成` 的 before 类型，outbox 也只有一个 execution evidence 权威入口。

## 12. 密封计划、CAS 与修复真值表

首次 `apply_once` 必须先把一个完整的 multi-target `ProjectionWritePlan` 以 `sealed_plan_sha256` 持久化到 durable outbox，再执行任何 Base 写。规划器绝不生成两个可独立调用的临时业务命令。

允许的执行能力只有：

- `atomic_all_targets`：现场故障注入证明平台能在同一受控操作内校验两个 before 指纹，并保证两个目标同成同败；
- `sealed_outbox_cas`：现场证明同一密封计划先持久化，再以每目标 CAS 执行，保存可信 target ack，崩溃后只按原计划续写且不重复 snapshot；
- `insufficient`：返回 `platform_capability_insufficient`，零写。

真实飞书能否提供上述任一能力必须第一天实测，R10 不作肯定。普通“先写表 A、再写表 B”不等价于 `sealed_outbox_cas`；在 durable outbox、executor、CAS 和 ack 尚未实际搭建并故障注入前，现场 mode 只能是 `insufficient/not_tested`。synthetic fixture 只生成离线候选计划，不能交给真实 Base executor。

`TrustedProjectionExecutionEvidence` 只能来自可信 outbox，并与 original plan 的 receipt、attestation、execution mode、permission snapshot/revision、sealed plan 和每个 target ack 完全一致。执行器在首次写及每次 repair 前都必须重新读取并核验权限 revision；任何漂移或 attestation 过期均为 `platform_capability_insufficient`、零写。

状态用 `B` 表示目标精确等于 expected-before，`A` 表示精确等于 expected-after，`X` 表示两者都不匹配：

| cluster | improvement | outbox/ack | 决策 |
| --- | --- | --- | --- |
| B | B | 原计划已密封、无 target ack、有效私有 execution lease | `apply_once`，执行指令包含两个目标 |
| B | B | 无有效私有 execution lease | `reject/projection_conflict`，零写 |
| A | A | 原计划、两 target ack、cluster marker 全部一致 | `already_applied`，零写 |
| A | B | 原计划一致，仅 cluster ack，cluster marker 一致 | `repair`，原计划不变，指令只含 improvement |
| B | A | 原计划一致，仅 improvement ack | `repair`，原计划不变，指令只含 cluster |
| A/B | A/B | 缺计划、ack 不一致或 marker 不一致 | `reject/projection_conflict`，零写 |
| X | 任意 | 任意 | `reject/projection_conflict`，零写 |
| 任意 | X | 任意 | `reject/projection_conflict`，零写 |

`repair` 只能消费 original plan，不重新授权、不做 semantic lookup、不生成业务 ID、不改变 target patch、不改写已完成目标。stale before hash、错 receipt hash、错 plan hash、错 target ack 或额外 recurrence marker 全部失败关闭。

Base 目标已经到 A 但对应 target ack 丢失时，不能凭 after 状态补造 ack，也不能 repair；结果为 `projection_conflict`。这是安全失败，不得写成通用崩溃恢复能力，仍需等待真实平台恢复协议验证。

## 13. 错误闭集

```ts
type W6ReopenProjectionError =
  | "invalid_projection_input"
  | "unverified_commit"
  | "commit_proof_mismatch"
  | "event_conflict"
  | "projection_conflict"
  | "sensitive_output_rejected"
  | "platform_capability_insufficient"
  | "projection_dependency_failure";
```

唯一触发规则：

| error | 唯一语义 |
| --- | --- |
| `invalid_projection_input` | descriptor、exact shape、类型、大小或格式不合法 |
| `unverified_commit` | receipt 不存在、不是首次 committed，或没有同 commit 密封的 after 快照 |
| `commit_proof_mismatch` | receipt/history/cycle/after/before 成员和时间绑定不一致，或 outbox `receipt_conflict` |
| `event_conflict` | R9 已授权 near 分支；业务事件语义冲突 |
| `projection_conflict` | digest/plan owner、selector/locator 冲突，A/B/X 状态与 marker/ack 不一致、ack 丢失或 CAS 目标冲突 |
| `sensitive_output_rejected` | 公共 artifact 或日志递归脱敏扫描失败 |
| `platform_capability_insufficient` | capability、权限、有效期、原子/CAS/outbox 能力不足或执行前漂移 |
| `projection_dependency_failure` | source、Base、capability、clock、outbox 或 hasher reject/throw/不可用 |

near 必须使用 `event_conflict`；它不等于投影状态冲突 `projection_conflict`。错误输出只能使用上述枚举和固定 UI 文案，不透传底层异常、拒绝原因、调用栈或私有 lookup 细节。未来真实执行器的 provider-specific 写失败归一化不属于 R10 纯规划合同。

## 14. RED → GREEN 测试门

实施必须先建立 RED，并至少覆盖：

1. 公共入口不能提交完整 proof、Base 快照、能力布尔值或替换 source port；损坏可信来源失败关闭。
2. 缺字段、多字段、错误 phase/action、nullable narrowing 错误、非首次 committed 和 proof ID/时间/状态不一致全部拒绝。
3. receipt 通过自身 history/cycle ID 精确选证：覆盖 A committed→B committed→重投 A、A receipt 与 B history/cycle/after 快照交换，以及内部自洽但没有权威 R9 commit 的伪造 outbox plan/evidence，均禁止 current/latest 或 outbox 自证。
4. Proxy、accessor、symbol、non-enumerable、undefined、非有限数、`-0`、cycle、sparse array、自定义 prototype、孤立 surrogate 在 getter/hash 调用为 0 时拒绝；深度、节点、数组、before records=499/500、observed records=500/501、属性名、文本和总 UTF-8 字节上限逐项覆盖。
5. 固定 receipt 向量得到固定域分离 SHA-256；覆盖 `SYN-CASE-017`、`W6-*`、`BATCH-*` 和通用 R9 ASCII ID 正例，以及空值、非法字符、超长、重复项和相对密封 proof 调序负例。
6. 选择性字段哈希、semantic replay 伪 receipt 和 public result 反推 receipt 全部拒绝。
7. 注入碰撞 hasher：同 digest 的不同 receipt ID 返回 `projection_conflict`；同 receipt ID 的不同 canonical material/digest 与 outbox `receipt_conflict` 返回 `commit_proof_mismatch`；`plan_conflict` 返回 `projection_conflict`。
8. 合法 miss 证明 `before members + triggering IDs = after members`，缺成员、多成员、混入其他簇成员和 trigger 替换均失败。
9. 合法 miss 只生成一次 snapshot-and-clear 计划，写字段精确等于九字段白名单；三个旧值来自 Base before，不来自 runtime。
10. `recurrence_records` 保持既有 active-intake/opaque safe JSON 的原值与顺序，只追加一个 R10 exact record；伪造 R10 discriminator、重排或改写旧记录全部拒绝。
11. canonical business-key selector 的 0 命中、多命中、cluster/improvement 映射互换、跨表 locator、selector/locator proof swap、schema revision 漂移和伪造均失败；固定 locator 域/preimage，禁止 `record_id === business_id` 假设，public artifact 不含 locator。
12. exact replay 与 near 均为零读、零哈希、零写；near 为 `event_conflict`。同一 committed receipt 的 outbox 重投允许重新核验并读取投影状态，但完整已应用时必须返回 `already_applied` 且零写。
13. 业务 commit 成功、首次投影失败后，exact replay 仍零业务写；原 outbox 重投只修投影，不重新执行业务状态机。
14. 同 receipt、不同 trusted-clock tick 的 `Promise.all` 仍只有一个稳定 plan、一个 `sealed` 和其余 `existing_same`；`existing_same` 丢弃本地 plan/directive，只读唯一 evidence 并 reconcile，B/B+ack0 的 façade/loser 无 lease 不得取得执行权，只有私有 outbox worker 的有效单所有者 lease 可恢复；强制 digest collision 只有一个 owner；receipt/digest/plan 冲突均零 Base 写。
15. B/B、A/A、A/B、B/A、X/*、*/X 真值表全部覆盖；cluster repair 的 directive/artifact 只能同时指向 clusters，improvement repair 同理；只有同一密封计划和完整 ack 的部分状态可 repair；目标已到 A 但 ack 丢失必须安全拒绝。
16. attestation ID、mode、status、visibility、permission SHA/revision 任一替换或执行前漂移均失败；覆盖计划前已过期与计划后、CAS 前过期，固定 `issued_at <= checked_at < expires_at`；`synthetic_fixture` 不能被真实 executor 接受。
17. 原子或等价能力不足时返回 `platform_capability_insufficient`，不得生成可现场执行的盲写计划；P03 验证视图与直接表访问均看不到 raw records。
18. source、Base、capability、clock、outbox 与 hasher 分别抛出含 receipt、principal、W5 provenance 和 stack 哨兵的异常，公共输出与日志命中数必须为 0，并统一为 `projection_dependency_failure`。
19. internal plan、patch、directive 和 redacted artifact 分层验收；三个唯一敏感文本哨兵在所有公共成功、失败、异常和日志对象中的递归命中数必须为 0。五种 decision 的 artifact、planned count、repair 标记和 safe error 必须类型一致。
20. 输入、输出、计划、patch、artifact 和 ack 均不可由调用方后续变异；R9 local/cross/full、strict TypeScript、scoped/full lint 全量兼容。

完成后只能表述为“离线投影合同已通过合成测试”。不能表述为真实飞书写入、跨表原子性、失败恢复或 exactly-once 已验证。

## 15. 飞书九文件同步合同

R10 核心、测试和记录独立验收通过并冻结 SHA 后，T2 才能修改九文件：

| 文件组 | 目标版本 | 引用职责 |
| --- | --- | --- |
| `neoloop-logical-manifest.v0.1.json` | `0.1.6` | pin R10 core/test/record 的最终 SHA；声明 projector、九字段白名单、错误闭集和现场未测边界 |
| `on-site-build-package.v0.1.json` | `0.1.5` | pin logical 最终 SHA；镜像密封计划、CAS、snapshot-and-clear 和人工停点 |
| `day-1-probe-suite.v0.1.json` | `0.1.4` | pin logical/build SHA；增加能力探针但保持 P01—P13 数量不变 |
| `base-import-batch-plan.v0.1.json` | `0.1.4` | pin logical/build SHA；保持 10 表导入 DAG 和 70 条执行记录不变 |
| `on-site-smoke-plan.v0.1.json` | `0.1.4` | pin logical SHA；在既有 5 组 smoke 内增加 R10 场景 |
| `on-site-evidence-template.json` | `0.1.4` | 在既有 41 evidence、36 result units 内增加 R10 字段，不预填现场成功 |
| `validate-contract-alignment.mjs` | 不设业务版本 | 先验证逻辑合同、冻结 SHA、版本和引用方向 |
| `validate-offline-package.mjs` | 不设业务版本 | 再验证 build/probe/import/smoke/evidence 与 logical 的离线一致性 |
| `validate-day-1-probe-package.mjs` | 不设业务版本 | 最后验证第一天执行包、空结果和固定基数 |

哈希更新顺序固定为：R10 core/test/record → logical → build → probe/import/smoke/evidence → 三个 validator。引用图只允许下游 pin 上游，不得回指，不得成环。所有 SHA 必须在最终内容落盘后重算，不能预造。

R6/R7 轮次记录中的旧 SHA 是历史证据，不得改写，也不得继续拿它们和当前 R9 文件内容比较。三层 validator 应分别验证历史记录文件及其冻结声明，再建立独立的 `R9 → R10 core/test/record → logical → build → derivatives` 当前链。

本规格复核时的只读基线为 contract `107/109`、offline `92/94`、day-1 `84/85`，合计 `283/288`。这些失败来自旧 R6/R7 SHA 与当前 R9 文件比较，不是现场基数或真实能力回归；R10 同步必须修正校验职责并报告新的真实断言数，不能沿用或伪造全绿数字。

`day-1-probe-results.example.json` 保持不修改；13 probes、5 smoke、41 evidence、36 result units、70 execution records、48 个空资源字段继续保持原基数，所有现场结果继续是 `not_tested/null/0`。

## 16. 事实口径与完成门

- 本规格与飞书 manifests：`fact_class = solution_design`；
- trigger、fixtures、纯函数测试和本地记录：`data_scope/evidence_class = synthetic_experiment`；
- 真实飞书权限、资源 ID、Base 原子/CAS 能力、跨表失败恢复：`not_tested/null/0`；
- 不接新石器真实数据，不保存企业凭证，不声称已经部署或上线。

R10 进入实施计划前必须同时满足：

1. 主控自检无 placeholder、矛盾、双义和范围漂移；
2. T1 安全与数据审查、T2 飞书合同审查、T3 工程可实现性审查均为 P0=0、P1=0；
3. 参赛者确认本书面规格；
4. 主计划、A+ 规格和 R9 冻结文件保持不变。
