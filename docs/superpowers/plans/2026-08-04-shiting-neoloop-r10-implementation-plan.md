# 石听 NeoLoop R10｜飞书复发重开投影器实施计划

日期：2026-08-04
状态：参赛者已确认 C 方案；待按本计划实施
规格基线：`../specs/2026-08-04-shiting-neoloop-r10-feishu-reopen-projector-design.md`
适用范围：R9 `reopen_recurrence` 首次提交回执到飞书 Base 的离线投影合同，以及通过后对飞书九文件的同步
团队：石听未来
产品：石听 NeoLoop

> 让每条反馈都找到一辆车、一个任务、一个责任人和一次改进。

## 0. 本轮结论

本轮先实现并验收 R10 离线投影合同，再同步飞书九文件；参赛者登录飞书后只执行 Day 0/Day 1 权限验收，不提前批量创建正式配置。

R10 不实现真实飞书写执行器，不修改 R9 状态机，也不把本地合成测试写成现场能力。只有 Day 1 证明平台具备 `atomic_all_targets` 或 `sealed_outbox_cas`，并完成独立执行器规格后，才允许进入真实 Base 写入实现。

## 1. 已确认基线

### 1.1 参赛者决定

- 2026-08-04：参赛者确认采用 C 方案并通过 R10 书面规格。
- 本计划以磁盘当前 R10 规格为唯一实现依据，不按早期讨论稿开发。
- 不因子会话额度中断删减任务；T1、T2、T3 职责继续保留，由主控顺序执行、分阶段复核。

### 1.2 冻结哈希

实施前必须重新计算并核对下列 SHA-256。任何非计划变化都先停止并定位来源：

| 文件 | 冻结 SHA-256 |
| --- | --- |
| A+ 主计划 | `6d926c4991c8d1156b3456d33b57c717f08ce882ce8a625b5af94710a4e9145f` |
| A+ 规格 | `e4448de64569c1f449470a6c8cbeaf32cc7660cc94023667ee8532034d95abd1` |
| R10 规格 | `6d77f40905701865fe33ba8dd883177bc74a87b5e19d3fe38b632b57e71ed1c8` |
| R9 `w6-improvement.ts` | `22990e48fadbdfa8c97b7e3deac72fd5e403d9636753f4b2d64974c5a1a16485` |
| R9 `repository.ts` | `789968005ac9c8c96c3773bcbdeb44d48741b8cfcb5f20f9dc91b5557b568e34` |
| R9 `w6-improvement.test.mjs` | `4c31ebdf59be57d66c58fccb999cabaaef34988f5819eda49e81e9dd796bc0ed` |
| R9 `model.ts` | `622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753` |
| R9 `index.ts` | `c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3` |
| R9 `w6-repository.test.mjs` | `be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb` |

### 1.3 实施前测试状态

- 核心本地测试：`291/291`。
- 跨契约测试：`4/4`。
- 飞书 contract validator：`107/109`。
- 飞书 offline validator：`92/94`。
- 飞书 Day-1 validator：`84/85`。
- 三层飞书失败来自旧 R6/R7 冻结 SHA 被错误拿来与当前 R9 文件比较；这不是现场能力回归。
- P01—P13 全部为 `not_tested`，真实飞书操作、lark-cli 登录和 OpenAPI 调用均为 0。

## 2. 固定边界和完成口径

### 2.1 不得改变

- 一个 Base、10 张表、5 个视图、3 个逻辑业务角色、7 个 AI 节点、6 条工作流。
- R9 授权、exact/near/miss、语义重放、状态提交和错误分类。
- `model.ts`、R9 四件套、固定状态枚举、canonical 数据和公开站。
- 公开事实、待企业验证、方案设计、合成实验四类证据口径。
- 不执行车辆控制，不自动判责、赔偿、承诺恢复时间或确认最终根因。

### 2.2 R10 离线完成

只有同时满足以下条件，才可以写“离线投影合同已通过合成测试”：

1. 新 projector core、测试和轮次记录通过全量门。
2. R9 六个冻结文件哈希不变。
3. exact replay 与 near conflict 对 receipt/Base/outbox/hash 保持零调用。
4. miss、并发、碰撞、权限漂移、部分写、ack 丢失、依赖异常和敏感输出测试全部通过。
5. 外部 façade 只返回 `RedactedProjectionArtifact`。
6. T1 数据安全审查、T2 飞书合同审查、T3 工程审查均为 P0=0、P1=0。

### 2.3 现场完成另设门

以下内容不属于 R10 离线完成：

- 已登录赛事飞书；
- 已创建真实 Base 或资源 ID；
- 已验证跨表原子写、CAS、durable outbox、lease 或 exactly-once；
- 已启用 OpenAPI；
- 已接入新石器数据。

## 3. 文件所有权

### 3.1 T3 工程内核

R10 核心阶段只新增：

```text
src/neoloop/adapters/feishu/w6-reopen-projector.ts
tests/core/feishu-w6-reopen-projector.test.mjs
src/neoloop/records/2026-08-04-t3-r10-feishu-reopen-projector.md
```

`tests/core/run-core-tests.mjs` 已自动发现 `*.test.mjs`，本轮不得修改。

### 3.2 T1 数据与评测

本轮只读复核，不修改 `data/canonical/**`。测试夹具写在 T3 新测试文件中，必须使用 `synthetic_experiment`，不得伪造企业数据。

### 3.3 T2 飞书落地

T3 核心冻结后才允许按顺序修改九文件：

```text
feishu/manifests/neoloop-logical-manifest.v0.1.json
feishu/manifests/on-site-build-package.v0.1.json
feishu/manifests/day-1-probe-suite.v0.1.json
feishu/manifests/base-import-batch-plan.v0.1.json
feishu/manifests/on-site-smoke-plan.v0.1.json
feishu/evidence/on-site-evidence-template.json
feishu/scripts/validate-contract-alignment.mjs
feishu/scripts/validate-offline-package.mjs
feishu/scripts/validate-day-1-probe-package.mjs
```

`day-1-probe-results.example.json`、canonical 数据和历史 R6/R7 记录保持不变。

### 3.4 T0 主控

主控独占本计划、跨任务验收、Git 暂存和提交。不得整理或提交当前工作树中的其他用户/并行改动。

## 4. 执行波次总览

| 波次 | 责任线 | 目标 | 退出条件 |
| --- | --- | --- | --- |
| G0 | T0 | 冻结基线、确认脏工作树和无越界暂存 | 哈希、测试和暂存范围可复核 |
| G1 | T3 | 建立 R10 RED 测试与模块骨架 | 新测试因缺失实现确定性失败，R9 测试仍绿 |
| G2 | T3 | 完成 descriptor-safe snapshot 与 receipt verifier | 输入攻击、proof 绑定、hash 顺序测试绿 |
| G3 | T3 | 完成 before/capability 校验与纯 planner | miss/零路径/成员绑定/计划密封测试绿 |
| G4 | T3 | 完成 outbox composition、并发所有权和脱敏 façade | 并发、碰撞、依赖异常和日志脱敏测试绿 |
| G5 | T3 | 完成 reconcile、CAS 真值表和不可变性 | B/B、A/A、A/B、B/A、X 全矩阵测试绿 |
| G6 | T0/T1/T2/T3 | 全量回归、独立审查、冻结三文件 SHA | P0=0、P1=0，R9 哈希不变 |
| G7 | T2 | 同步飞书九文件和修复验证职责 | 三层离线 validator 全绿且基数真实重算 |
| F0 | 用户/T2 | Day 0 登录和权限盘点 | 只获得身份与权限证据，不批量建正式配置 |
| F1 | 用户/T2/T0 | Day 1 最小现场探针 | P01—P13 有真实状态、证据和保底路径 |
| F2 | T0 | 能力裁决 | `insufficient` 停止写入；可用则先立执行器新规格 |

## 5. G0｜实施前保护门

### G0.1 重新计算冻结哈希

运行：

```bash
shasum -a 256 \
  docs/superpowers/plans/2026-08-01-shiting-neoloop-a-plus-implementation-plan.md \
  docs/superpowers/specs/2026-08-01-shiting-neoloop-a-plus-design.md \
  docs/superpowers/specs/2026-08-04-shiting-neoloop-r10-feishu-reopen-projector-design.md \
  src/neoloop/workflows/w6-improvement.ts \
  src/neoloop/workflows/repository.ts \
  tests/core/w6-improvement.test.mjs \
  src/neoloop/workflows/model.ts \
  src/neoloop/workflows/index.ts \
  tests/core/w6-repository.test.mjs
```

验收：全部等于第 1.2 节。任一不一致则停止，先确认是否为用户或其他任务改动。

### G0.2 保存工作树边界

运行：

```bash
git status --short
git diff --cached --name-status
```

验收：不覆盖、不回退、不顺手整理现有脏文件；每次提交前暂存区只包含本波次拥有的文件。

### G0.3 重跑真实基线

运行：

```bash
node tests/core/run-core-tests.mjs --local-only
node tests/core/run-core-tests.mjs --cross-only
node feishu/scripts/validate-contract-alignment.mjs
node feishu/scripts/validate-offline-package.mjs
node feishu/scripts/validate-day-1-probe-package.mjs
```

验收：核心与 cross 全绿；飞书三层只允许出现已知历史 SHA 职责失败，不接受新增错误。

回滚点：G0 不修改业务文件，无需回滚。

## 6. G1｜RED 测试和模块骨架

### G1.1 新建测试文件并冻结测试分组

文件：`tests/core/feishu-w6-reopen-projector.test.mjs`

先建立 20 个测试组，对应 R10 规格第 14 节：

1. 公共入口与可信端口隔离。
2. commit proof exact shape 和首次 committed。
3. receipt/history/cycle/after 精确绑定和多周期选择。
4. descriptor-safe 攻击与所有资源上限。
5. 固定 receipt 哈希向量和通用 ASCII ID。
6. 禁止选择性字段哈希与 semantic replay 伪 proof。
7. receipt/digest/plan 碰撞与 outbox 错误映射。
8. before + triggering = after 成员绑定。
9. snapshot-and-clear 九字段白名单。
10. R7 非 R10 recurrence record 原样保留。
11. business selector 与 opaque locator 证明。
12. exact/near 零端口路径和 committed 重投。
13. 业务 commit 与投影失败相互隔离。
14. `Promise.all` 并发、唯一 sealed owner 与 worker lease 边界。
15. B/B、A/A、A/B、B/A、X 真值表。
16. capability 有效期、revision 和现场/fixture 分离。
17. 能力不足和 P03 raw JSON 不可见。
18. 所有依赖抛错统一归一化且不泄漏。
19. plan/directive/artifact 分层和递归敏感值扫描。
20. 深冻结、R9 回归、strict TypeScript 和 lint。

测试必须通过 `importBuilt("src/neoloop/adapters/feishu/w6-reopen-projector.js")` 导入编译产物，不引入新依赖。

### G1.2 建立最小模块骨架

文件：`src/neoloop/adapters/feishu/w6-reopen-projector.ts`

只放闭集常量、内部类型和暂时抛出固定错误的入口，让 TypeScript 能编译、测试因行为未实现而失败。不得从 `src/neoloop/workflows/index.ts` 或公共 barrel 导出。

运行：

```bash
node tests/core/run-core-tests.mjs --local-only
```

验收：R10 新测试为预期 RED；既有 291 项不回归。记录失败名称，不能只写“失败符合预期”。

回滚点：删除本轮两个新增、尚未提交的文件即可；不得改 R9 文件。

## 7. G2｜安全快照、verifier 与 receipt 哈希

文件：`src/neoloop/adapters/feishu/w6-reopen-projector.ts`

### G2.1 descriptor-safe snapshot

实现顺序：

1. 先用 `util.types.isProxy` 拒绝 Proxy。
2. 只通过 own property descriptor 读取值。
3. 实现 plain object、dense array 和 `JsonValue` 闭集。
4. 实现深度、节点数、数组长度、属性名、文本和 1 MiB UTF-8 上限。
5. 拒绝 accessor、symbol、non-enumerable、`undefined`、BigInt、非有限数、`-0`、cycle、sparse array、自定义 prototype、Date/Map/Set/typed array 和孤立 surrogate。
6. 构造后递归冻结。

验收：任何非法输入的 getter 和 hasher 调用都为 0；合法 frozen DTO 与 null-prototype object 通过。

### G2.2 私有 commit proof verifier

实现：

- `receipt_id` 精确查首次 committed proof；
- receipt exact key set、phase/action、ID、时间和状态；
- 用 receipt 自带 history/cycle ID 选择证明，不使用 latest；
- 校验 cluster/improvement after、成员、trigger 子集和时间五方一致；
- 产生最小 `VerifiedW6ReopenProjectionSource`；
- 私有 envelope 另带 canonical receipt material，只交给 outbox；
- 生产哈希复用 `createWorkflowEventFingerprint` 和域 `neoloop.feishu.w6-reopen-projection-receipt.v1`。

运行：

```bash
node tests/core/run-core-tests.mjs --local-only
npx eslint src/neoloop/adapters/feishu/w6-reopen-projector.ts tests/core/feishu-w6-reopen-projector.test.mjs
```

验收：G2 对应 RED 全绿；R9 测试不变；公共对象中 receipt/history/cycle 原文命中数为 0。

回滚点：回退到 G1 骨架提交；不改 proof 来源文件。

## 8. G3｜能力证明、纯 planner 和密封计划

### G3.1 before 与 capability 校验

实现：

- exact `W6ReopenProjectionBefore`；
- `ClusterRecurrenceRecord` 判别联合；
- 三个历史文本只能来自 Base before；
- `TrustedProjectionCapabilityAttestation` 四组交叉约束；
- trusted clock 验证 `issued_at <= checked_at < expires_at`；
- `insufficient`、过期、visibility=false 和 permission 漂移全部零写失败。

### G3.2 纯 `planW6ReopenProjection`

实现顺序：

1. exact/near 先在 façade 分流，做到 receipt/Base/outbox/hash 零调用。
2. 校验 before 成员、triggering IDs 与 source after 的精确并集。
3. 保留旧 recurrence records 顺序，只追加一个 `reopen_snapshot.v1`。
4. 用 before 三个文本计算 previous projection hash。
5. 生成 cluster/improvement before/after 四个域分离 CAS 指纹。
6. 生成两个 business-key selector 和九字段写白名单。
7. 生成稳定 plan preimage；attempt-local checked time 不进入 plan。
8. 生成 `apply_once` directive 和 redacted artifact。

### G3.3 敏感输出扫描

对成功、拒绝和异常 artifact 做 exact own-key allowlist 与递归 denylist。扫描失败返回 `sensitive_output_rejected`，不得附加原值、message、stack 或 cause。

运行：

```bash
node tests/core/run-core-tests.mjs --local-only
```

验收：合法 miss 只形成一个完整双目标 sealed plan；snapshot 只追加一次；公共 artifact 不含 patch、selector、locator、receipt ID 和三个历史文本。

回滚点：回退 G3 增量，保留已通过的 G2 verifier。

## 9. G4｜outbox composition、并发和 façade

### G4.1 私有 ports 和组合根

实现规格冻结的 source、Base、capability、clock、outbox ports，以及 `createW6ReopenProjectionComposition`。这些接口不进入公共 barrel。

### G4.2 原子 seal 语义

`sealPlanIfAbsent` 必须原子比较：

- receipt ID；
- digest owner；
- canonical receipt material；
- sealed plan。

唯一映射：

- `receipt_conflict -> commit_proof_mismatch`；
- `digest_conflict | plan_conflict -> projection_conflict`。

### G4.3 并发所有权

覆盖：

- 同 receipt、不同 clock tick 的 `Promise.all` 只有一个 `sealed`；
- `existing_same` 丢弃本地产生的 plan/directive；
- B/B + ack=0 的普通 façade 或并发 loser 无执行权；
- 只有持有私有、未过期、单所有者 lease 的 durable worker 才能恢复；
- source proof 每次重投都重新核验，outbox 不能自证。

### G4.4 依赖失败归一化

source、Base、capability、clock、outbox 和 hasher 分别注入含敏感哨兵的异常。公共结果统一为 `projection_dependency_failure`，日志递归命中数必须为 0。

验收：公共 API 只有 `handle(trigger) -> RedactedProjectionArtifact`；普通调用方不能替换 verifier 或注入 before/capability。

回滚点：回退 composition 增量；pure planner 保持可独立测试。

## 10. G5｜reconcile 与 CAS 修复矩阵

### G5.1 observed/evidence exact schema

实现：

- observed 只含两个目标 exact 字段；
- execution evidence 精确绑定 receipt、plan、attestation、permission revision 和 target ack；
- ack 顺序固定 `clusters, improvements`，不得重复；
- 每个 ack 带 resolved locator 摘要，不含原 locator。

### G5.2 `reconcileW6ReopenProjection`

严格实现：

| 状态 | 结果 |
| --- | --- |
| B/B + 有效 worker lease | `apply_once` 两目标 |
| B/B + 无 lease | `reject/projection_conflict` |
| A/A + 两 ack/marker 一致 | `already_applied` |
| A/B + cluster ack | `repair` improvement only |
| B/A + improvement ack | `repair` cluster only |
| 任一 X | `reject/projection_conflict` |
| A 但对应 ack 丢失 | `reject/projection_conflict` |

repair 必须复用原 sealed plan，不能重算授权、业务 ID、patch 或计划身份。

### G5.3 执行前能力复核合同

planner 只记录 attestation；未来 executor 每次 CAS 前必须产生 `capability_rechecked_at` 并核对 permission revision。R10 只测试合同，不实现真实 Feishu executor。

运行：

```bash
node tests/core/run-core-tests.mjs --local-only
node tests/core/run-core-tests.mjs --cross-only
node tests/core/run-core-tests.mjs
```

验收：真值表、不可变性和错误闭集全绿；R9 既有测试无改动。

回滚点：回退 reconcile 增量；不得用“补造 ack”修复测试。

## 11. G6｜工程冻结与三线复核

### G6.1 全量工程门

运行：

```bash
node tests/core/run-core-tests.mjs --local-only
node tests/core/run-core-tests.mjs --cross-only
node tests/core/run-core-tests.mjs
rg --files src/neoloop services/openapi-ingest -g '*.ts' | xargs npx tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext
npx eslint src/neoloop/adapters/feishu/w6-reopen-projector.ts tests/core/feishu-w6-reopen-projector.test.mjs
npm run lint
```

不能预写新增后的测试总数；以实际 runner 输出记录真实数字。

### G6.2 T1 数据与安全审查

只读检查：

- 测试数据全部是 `synthetic_experiment`；
- 不修改 canonical/public 快照；
- R7 非 R10 recurrence records 保持原值和顺序；
- raw records 只允许 `improvement_insight`，P03 视图与直接表访问都不可读；
- 合成结果不外推企业效果。

### G6.3 T2 飞书合同审查

只读检查：

- plan 不包含真实 table/record/field ID；
- selector 与 locator 分离；
- capability 的 fixture/not_tested/onsite 三类不混用；
- 九字段白名单不触碰其他表；
- 本地测试不声称平台原子性。

### G6.4 T3 工程审查

检查：

- 公共 barrel 零新增导出；
- R9 六文件哈希不变；
- pure 函数、composition、executor 边界清楚；
- outbox owner、lease、CAS、ack 不靠 Base 当前状态猜测；
- error 与 artifact exact union 无双义。

### G6.5 轮次记录和冻结

文件：`src/neoloop/records/2026-08-04-t3-r10-feishu-reopen-projector.md`

记录真实 RED、GREEN、测试数、命令、SHA、限制、越界文件和偏航结论。不能写飞书现场能力已验证。

冻结顺序：core → test → record。记录自身 SHA 在后续 T2 manifest 或主控集成记录中给出，不在记录内部自引用。

退出条件：P0=0、P1=0；P2 有明确处置或接受理由；偏航结论为 `未偏离` 或 `已纠正`。

## 12. G7｜飞书九文件同步

前置：G6 完成，R10 core/test/record 最终 SHA 已冻结。

### G7.1 版本与引用顺序

1. logical `0.1.6`：pin R10 三文件 SHA，声明 projector、九字段白名单、错误闭集和现场未测边界。
2. build `0.1.5`：pin logical SHA，镜像 sealed plan、CAS、snapshot-and-clear 和人工停点。
3. probe `0.1.4`：pin logical/build SHA；P01—P13 数量仍为 13。
4. import `0.1.4`：10 表、13 import units、70 execution records 基数不变。
5. smoke `0.1.4`：仍为 5 组，在既有 smoke 中增加 R10 场景。
6. evidence `0.1.4`：仍为 41 evidence、36 result units；增加 R10 字段但保持现场值为空。
7. 三个 validator 最后修改。

### G7.2 修复 validator 职责

- 历史 R6/R7 记录只验证记录自身和其当时冻结声明。
- 当前链改为 `R9 -> R10 core/test/record -> logical -> build -> derivatives`。
- 只允许下游 pin 上游；禁止回指和环。
- 所有 SHA 在文件最终落盘后计算，不能用 placeholder。

### G7.3 三层验证

运行：

```bash
node feishu/scripts/validate-contract-alignment.mjs
node feishu/scripts/validate-offline-package.mjs
node feishu/scripts/validate-day-1-probe-package.mjs
```

验收：全部退出码 0；报告实际新断言数，不沿用 `109/94/85` 作为预设结果；现场状态仍保持 `not_tested/null/0`。

回滚点：九文件作为单独提交整体回退，不改历史轮次记录，不回退 G6 核心。

## 13. F0/F1｜登录后的第一天

### F0：参赛者本人先做

1. 登录赛事指定飞书账号。
2. 确认租户、账号身份、赛事空间和管理员联系人。
3. 不把 token、App Secret、tenant key 或授权回调内容发到聊天或仓库。
4. 不提前批量建 10 表、7 节点和 6 工作流。

主控/技术协作可以指导操作、核对界面和整理结果；登录、OAuth、管理员审批和必须本人点击的授权由参赛者完成。

### F1：最小现场探针

按现有 P01—P13 顺序执行并记录：

- 文档匿名访问；
- Base 无特权视图；
- P03 直接表访问与 raw recurrence records 隔离；
- 表、字段、关联、公式、视图和自动化；
- 飞书 AI 结构化输出与运行记录；
- 审批、提醒和机器人；
- 知识库读取与发布审核；
- 妙搭、Aily；
- 自建应用与管理员审批；
- OpenAPI scope；
- lark-cli 是否允许安装、登录和读取 scopes。

每项只能使用：`available / restricted / unavailable / not_tested`，并附测试动作、时间、操作者角色、证据引用、限制和保底路径。

先创建可清理的临时 Base 做最小探针；未通过资源命名、权限和回滚复核前，不创建正式 10 表。

### F1 的 R10 专项证明

必须实测：

1. `recurrence_records` 可见范围不宽于三个来源字段。
2. P03 在视图和直接表访问中均不可见 raw JSON。
3. selector 能精确解析唯一记录，0/多命中安全失败。
4. 平台是否支持 `atomic_all_targets`。
5. 若不支持，是否能建立真实 durable outbox、每目标 CAS、ack 和单所有者 lease。
6. attestation 的 revision、有效期和执行前复核是否可落地。

不能完成第 4 或第 5 项时，`execution_mode=insufficient`。此结论不阻止离线合同、文档和演示，但阻止真实 R10 写入。

## 14. F2｜能力裁决与后续分支

### 分支 A：`insufficient`

- 保留 R10 离线 projector、测试和九文件合同。
- 飞书作品使用人工重开或不启用 R10 自动投影的安全路径。
- 文档明确写“离线合同已验证，现场等价原子/CAS 能力未验证或不足”。
- 不用普通顺序双写冒充 sealed outbox CAS。

### 分支 B：`atomic_all_targets`

- 保存现场故障注入证据。
- 先新建真实 executor 规格，经参赛者确认后再规划代码和 Base 配置。
- executor 必须在写前重验 attestation、revision、selector/locator 和双目标 before 指纹。

### 分支 C：`sealed_outbox_cas`

- 先证明 durable outbox、唯一 plan owner、单所有者 lease、每目标 ack 和崩溃续跑。
- 新建 executor/worker 规格，不把这些能力塞回 R10 projector 文件。
- 未完成故障注入前继续标记 `not_tested`。

## 15. 提交策略

提交必须小而可回退：

1. `docs: plan R10 Feishu reopen projector implementation`
   - 只含本计划。
2. `test: define R10 Feishu reopen projector contract`
   - RED 测试和最小骨架；若项目约定不提交红态，则与下一提交保持本地连续但在轮次记录保存 RED 证据。
3. `feat: implement R10 Feishu reopen projector`
   - core + test。
4. `docs: record R10 projector verification`
   - T3 R10 轮次记录。
5. `docs: align Feishu package with R10 projector`
   - 只含飞书九文件。

每次提交前运行：

```bash
git diff --cached --name-status
git diff --cached --check
```

不得推送远端、部署 Netlify 或操作正式飞书，除非参赛者在对应阶段明确批准。

## 16. 偏航检查

每个 G 波次开始前做简版自检：

1. 是否仍只做 R10 projector，而非真实 executor。
2. 是否触碰 R9 状态机、canonical 数据或公开站。
3. 是否把方案设计/合成测试误写成现场能力。
4. 是否扩大 raw recurrence records 可见范围。
5. 是否覆盖工作区其他改动。

出现下列情况必须完整回读 A+ 主计划、A+ 规格和 R10 规格：

- 需要修改 R9 六个冻结文件；
- 需要新增 Base 字段、表、视图、节点或工作流；
- 需要改变错误闭集、权限模型、写白名单或人工关口；
- 发现真实飞书能力与 C 方案前提冲突；
- 出现跨任务线文件冲突。

每个波次结束固定执行：

```text
本波次自测
→ T1/T2/T3 对应视角复核
→ 主控审阅
→ 集成测试
→ 主控回读本计划
→ 记录证据与真实测试数
→ 决定是否进入下一波次
```

偏航结论只能是：`未偏离`、`已纠正`、`需要主控裁决`。

## 17. 最终交付声明模板

R10 离线通过时只允许写：

> R10 飞书复发重开投影合同已通过本地合成测试；验证覆盖可信 commit proof、密封计划、并发所有权、CAS 修复真值表、能力漂移和公共输出脱敏。尚未据此声称真实飞书写入、跨表原子性、失败恢复或 exactly-once 已验证。

获得现场证据前禁止写：

- “R10 已在飞书上线”；
- “已实现跨表 exactly-once”；
- “已接入新石器真实数据”；
- “已证明企业效率或经营提升”。

## 18. 项目最终验收提醒

R10 不是项目最终完成门。只有整体项目接近 8 月 15 日冻结或最终验收时，主控才提醒参赛者是否启动“三次九轮协议”；未获得明确确认前不执行，也不把它设为隐含完成条件。
