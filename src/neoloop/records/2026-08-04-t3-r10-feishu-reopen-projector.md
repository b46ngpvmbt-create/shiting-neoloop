# T3-R10｜飞书 W6 复发重开离线投影合同

日期：2026-08-04  
冻结回开纠正日期：2026-08-05  
任务线：T3 工程内核  
实施范围：R10 G0—G6.5，仅离线 projector 合同与合成测试  
结论：`已纠正`

## 1. 收口结论

R10 在本地合成边界内完成了 trusted committed receipt、sealed plan、同步 pure reconcile、异步 composition、唯一 outbox owner、CAS/ack 恢复真值表和公共脱敏 artifact 的工程合同。最终测试覆盖正常规划、并发 seal、可信 source 重验、execution evidence、A/A、A/B、B/A、B/B、X 分支、依赖失败、敏感输出和不可变性。

本轮没有实现真实飞书 executor、worker lease、真实 Base 写入或跨系统 exactly-once。composition 只编排可信 source、Base before/observed、capability、trusted clock 与 outbox；public handle 只返回 `RedactedProjectionArtifact`。只有 outbox `sealed` 是首次 `apply_once` owner；`found` 和 `existing_same` 必须使用权威 sealed plan 与 execution evidence，Base 当前状态不能生成 owner、lease、CAS 或 ack。

下游只读审计在首次 G6 冻结后发现两项真实缺陷：`found` 路径未以当前权威 plan 和 canonical receipt material 重验已有 seal 的四维绑定；`not_tested + recurrence_visibility_no_broader_than_source_fields=true` 被误分类为能力不足，而不是无效输入。因此旧冻结被推翻，G5/G6 回开并严格按 RED→GREEN 纠正。

纠正后，`found` 必须在读取 execution evidence/Base 前，以递归冻结的 authoritative plan 和 canonical receipt material 调用现有 `sealPlanIfAbsent` 重验。只有 `existing_same` 且返回 plan 与 lookup 权威 plan 精确一致才能继续；`receipt_conflict → commit_proof_mismatch`，`digest_conflict | plan_conflict | returned-plan mismatch → projection_conflict`，`found` 后返回 `sealed` 表示可信 outbox 前后状态违约，统一为 `projection_dependency_failure`。该 recheck 不产生新 owner/directive，不读 capability/clock，canonical material 不进入 artifact 或日志。

`not_tested` capability 仅在 `recurrence_visibility_no_broader_than_source_fields=false` 时是合法输入；该字段为 `true` 属于自相矛盾的输入，pure planner 返回 `invalid_projection_input`，trusted composition port 返回该值则归一为 `projection_dependency_failure`。

公共脱敏边界保持闭合：canonical receipt material 不进入 planner、Base、artifact 或日志；receipt/history/cycle 原文及 ID、三个历史文本原文和 private sentinel 在公共成功、拒绝、异常与日志中的递归命中均为 0。当前源码没有日志端口，依赖异常的 `message`、`stack`、`cause` 也不外显。

R7 已提交的非 R10 opaque recurrence records 保持原值、嵌套值与顺序不变，R10 只追加自己的 snapshot，不重写历史。raw `recurrence_records` 仅允许 `improvement_insight` 读取；`issue_map` 与 `improvement_tracking` 保持隐藏。P03 五视图与 direct clusters access 仍为 `not_tested/null`；canonical/public manifests 的保护范围未变化，本记录不补造聚合哈希。

capability 三态互斥：`not_tested` 固定为 `insufficient`、visibility 为 `false`、其余证明字段为 `null`；`synthetic_fixture` 仅限 `synthetic_experiment/test_harness`，不得交给真实 executor；`onsite_verified` 必须同时绑定精确证据单元 `P02+P03`、permission snapshot/revision、issued/expires 与 `authorized_competition_operator`。当前没有 `onsite_verified` 证据。

投影计划只允许九个业务字段：`clusters.member_case_ids/status/recurrence_records/updated_at`，以及 `improvements.status/day_7_result/day_30_result/human_conclusion/updated_at`。selector 仅使用 `cluster_id` 与 `improvement_id` 两个业务键；raw locator 只属于私有 future executor，可信 evidence 至多保存 resolved locator SHA。静态 plan 不包含真实 table/record/field ID。

R9 状态机、授权顺序、exact/near/miss 语义和六个冻结文件保持不变。一个 Base、10 张表、5 个视图、3 个逻辑业务角色、7 个 AI 节点和 6 条工作流的固定边界均未改变。

## 2. 证据等级与可复核限制

- **A 级**：当前冻结工作树可直接重算的文件内容、SHA-256、TODO 数量、类型/导出边界和 R9 六文件哈希。
- **B 级**：主控在同一实施轮中保留的命令运行回执，包括各阶段 local、cross、full、TypeScript、ESLint、full lint 与 diff-check 结果。
- **C 级**：只基于 B 级数字做的算术守恒，不增加新的运行事实。

历史 RED 没有独立持久化日志文件，最终冻结树也不能重放修复前的失败。因此本记录只采用主控明确冻结的 B 级运行回执，不补造“初始实现后”或每次获权测试修订后的额外阶段数字。测试失败数量也不等同于漏洞数量。

## 3. RED → GREEN 轨迹

| 阶段 | 等级 | local 结果 | 可复核结论 |
| --- | --- | --- | --- |
| G4 初始 RED | B | 311 total / 302 pass / 7 fail / 2 todo | G4 composition、安全和证据分支尚未闭合。 |
| G4 安全残余 | B | 311 total / 306 pass / 3 fail / 2 todo | source、authoritative plan 与 execution evidence 的残余门仍为 RED。 |
| G4 结束 | B | 311 total / 309 pass / 0 fail / 2 todo | G4 通过；仅 G1.15、G1.20 留待 G5。 |
| G5A RED | B | 311 total / 309 pass / 2 fail / 0 todo | 失败仅为 G1.15、G1.20，原因是 G5 reconcile/observed 合同尚未实现。 |
| 获权合同纠正与 G5B 实现后 | B | 临时 local 311/311 | 随后的静态审查发现 own enumerable `__proto__` P1；该次先绿结论被推翻，未作为最终冻结证据。 |
| G5C 显式 RED | B | 311 total / 310 pass / 1 fail / 0 todo | 失败仅为 G1.20：repair plan 丢失 own `__proto__` data property。 |
| G5C GREEN / 首次 G6 冻结 | B | 311 total / 311 pass / 0 fail / 0 todo | 原型安全修复后当时全绿；随后下游只读审计发现 canonical binding 与 `not_tested` visibility 两项缺陷，该冻结被推翻。 |
| 冻结回开 RED | B | 312 total / 306 pass / 6 fail / 0 todo | 六个失败精确定位 found-path 少 seal recheck 与 `not_tested` visibility 错误分类。 |
| GREEN 首轮编译 | B | TypeScript TS2339 | 联合类型未收窄，在进入测试前失败；这是编译失败，不记为测试失败。 |
| GREEN / 最终 local | B | 312 total / 312 pass / 0 fail / 0 todo | 增加显式 `"plan" in binding` fail-closed 收窄后全绿。 |
| 最终 cross | B | 4 total / 4 pass / 0 fail / 0 todo | 跨契约守卫全绿。 |
| 最终 full | B | 316 total / 316 pass / 0 fail / 0 todo | 最终 local 与 cross 合并后的完整 runner 全绿。 |

冻结回开 RED 的六个失败为：

1. G1.7：canonical material 不同但 receipt digest 被强制碰撞时，旧实现错误到达 `already_applied`，而非 `commit_proof_mismatch`。
2. G1.12：committed redelivery 的 found 路径未增加 seal recheck。
3. G1.15：found reconcile 分支的 seal 调用为 0，而冻结合同要求为 1。
4. G1.16：`not_tested + visibility=true` 被误分类为 `platform_capability_insufficient`，预期为 `invalid_projection_input`。
5. G1.18：found 路径在读取畸形 execution evidence 前未进行 seal recheck。
6. G1.18b：trusted capability port 返回畸形 `not_tested + visibility=true` 时，旧 composition 错误返回能力不足，预期为 `projection_dependency_failure`。

RED fixture 在 GREEN 前做了三项可证伪性纠正：

- canonical material 和 plan 都先转成稳定 JSON clone，再与已持久化 clone 比较，避免 null-prototype 与 normal-prototype 导致 `isDeepStrictEqual` 假冲突。
- returned-plan mismatch 从权威 plan clone 显式改动合法 `permission_revision` 字段并调用 `resealProjectionPlan`；不再使用不进入 sealed plan 的 checked time 构造假差异。
- G1.18b 拆为独立顶层测试，保证 trusted-capability composition 在旧 core 下真实执行；G1.14 仍保留两个不同 trusted-clock tick，并证明一个 `sealed`、一个 `existing_same` 和稳定同 plan。

C 级算术守恒：历史 311 项 local 阶段均满足 `pass + fail + todo = 311`；冻结回开 RED 满足 `306 + 6 + 0 = 312`；最终 GREEN 满足 `312 + 0 + 0 = 312`；最终 full 满足 `312 local + 4 cross = 316`。

## 4. 总控获权的测试合同纠正

以下调整均来自总控书面裁决，用于消除旧测试与冻结规格的冲突，不是通过降低安全合同制造绿灯：

1. `executionEvidence=null` 必须在读取 observed Base 前返回 `projection_conflict`。
2. trusted evidence 的 descriptor/type/exact-shape 损坏归一为 `projection_dependency_failure`；格式合法但与 sealed plan 语义错绑归为 `projection_conflict`。
3. evidence root 与各 ack 的 `capability_rechecked_at` 分别验证为合法 timestamp，不错误要求彼此相等。
4. G1.7 tampered-plan composition 的 Base 调用由 1 修正为 0；hash preimage 合同改为严格有序的 `[receipt, plan]`。
5. G1.12 committed redelivery 在 evidence 为 null 时不再额外读取 Base。
6. G1.14 并发 seal 的 Base 总调用由 3 修正为 2；loser 不通过 Base 猜测执行结果。

这些纠正保持 source-first、evidence-before-observed、零 permission revalidation、无 lease 恢复和公共输出脱敏不变量。

## 5. `__proto__` P1 的发现与修复

G5B 临时全绿后，独立静态审查发现 `clonePlainJsonValue` 使用普通 `{}` 创建输出，再通过 `output[key] = child` 写入 own enumerable `__proto__`。该赋值可能触发继承 setter，导致 own key 丢失、对象原型改变，并使预期的深冻结与无别名保证失效。

G1.20 随后增加显式 RED，使用 `Object.defineProperty` 构造合法 opaque recurrence record，并覆盖：

- 输出保留 own enumerable `__proto__` data property；
- 输出原型仍为普通 `Object.prototype`；
- own value 精确保持；
- record、value 与 nested value 全部深冻结；
- 输出与输入无 alias；
- 输入 own-key descriptor、原型和值及其可变性保持不变；
- 调用后修改输入 nested value 不影响输出；
- JSON roundtrip 仍保留 own `__proto__`。

GREEN 只把对象复制循环的直接赋值改为 `Object.defineProperty` data property，保持 `const output = {}` 和普通对象原型；没有使用 null prototype、schema 禁止或 `__proto__` 特殊分支。

## 6. 最终验证命令与结果

以下均为主控已运行的最终门：

- local：`node tests/core/run-core-tests.mjs --local-only`，312/312，fail 0，todo 0。
- cross：`node tests/core/run-core-tests.mjs --cross-only`，4/4，fail 0，todo 0。
- full：`node tests/core/run-core-tests.mjs`，316/316，fail 0，todo 0。
- strict TypeScript：`rg --files src/neoloop services/openapi-ingest -g '*.ts' | xargs npx tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext`，退出码 0。
- scoped ESLint：`npx eslint src/neoloop/adapters/feishu/w6-reopen-projector.ts tests/core/feishu-w6-reopen-projector.test.mjs`，退出码 0。
- full lint：`npm run lint`，退出码 0。
- diff-check：`git diff --check`，退出码 0。
- core/test 残留扫描：`rg -n -i 'test\.todo|TODO|FIXME|placeholder' tests/core src/neoloop/adapters/feishu/w6-reopen-projector.ts`，退出码 1，即无匹配。
- public barrel 检查：未新增 R10 projector、planner、plan、directive、ports、outbox、lease 或 locator 导出。

## 7. 最终 core/test SHA-256

- `src/neoloop/adapters/feishu/w6-reopen-projector.ts`：`47a429d650e663d008b25dd023f7fc2ed71286bf92708de1252db7fa302b7ffd`
- `tests/core/feishu-w6-reopen-projector.test.mjs`：`13e38abf203fc13695ff2e0dda81193088187cc22dfb3c0f3f53bd8452a726dd`

本记录不自引用自身 SHA；记录文件 SHA 由后续主控集成证据给出。

## 8. R9 六文件哈希守卫

- `src/neoloop/workflows/w6-improvement.ts`：`22990e48fadbdfa8c97b7e3deac72fd5e403d9636753f4b2d64974c5a1a16485`
- `src/neoloop/workflows/repository.ts`：`789968005ac9c8c96c3773bcbdeb44d48741b8cfcb5f20f9dc91b5557b568e34`
- `tests/core/w6-improvement.test.mjs`：`4c31ebdf59be57d66c58fccb999cabaaef34988f5819eda49e81e9dd796bc0ed`
- `src/neoloop/workflows/model.ts`：`622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753`
- `src/neoloop/workflows/index.ts`：`c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3`
- `tests/core/w6-repository.test.mjs`：`be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb`

六个文件均与 R10 实施计划冻结值一致。

## 9. G6 三线审查

- T1 数据与安全审查：core/test 无缺陷；其后发现的记录缺项 P1×2 已在本次记录纠正，最终 P0=0、P1=0、P2=0。
- T2 飞书合同审查：core/test 无缺陷；其后发现的记录缺项 P1×3 已在本次记录纠正，最终 P0=0、P1=0、P2=0；本记录落盘时 G7 尚未放行。
- T3 工程审查：P0=0、P1=0、P2=0；公共 barrel 零新增，pure/composition/future executor 边界清楚，error/artifact exact union 无双义。

## 10. 文件所有权与越界检查

R10 实现及本次冻结回开修复期只修改/新增：

- `src/neoloop/adapters/feishu/w6-reopen-projector.ts`
- `tests/core/feishu-w6-reopen-projector.test.mjs`

G6.5 首次创建本记录；本次冻结回开收口只更新本记录。授权三文件之外越界文件为 0；core/test 已冻结为第 7 节的新值，R9 六文件保护哈希未漂移。这里不声称共享工作树整体干净，也没有整理、覆盖或回退其他任务的修改。

本轮暂存、提交、推送和部署均为 0；本记录落盘时 G7 尚未放行。

## 11. 四类事实边界

| 事实类别 | 本轮口径 |
| --- | --- |
| `public_fact` | 本轮未新增公开事实；不从当前合同推断企业内部系统、流程或经营成效。 |
| `enterprise_pending` | 真实租户权限、资源 ID、跨表原子性、CAS/outbox/lease、故障恢复和 executor 能力均待企业与赛事环境验证。 |
| `solution_design` | 一个 Base、10 表、5 视图、3 逻辑业务角色、7 AI 节点、6 工作流，以及不执行车辆控制等产品/实施边界；R10 projector、sealed plan、selector、capability、outbox 与 future executor 分层均属方案设计。 |
| `synthetic_experiment` | fixtures、test clock、恶意输入、Node 测试与当前验证结果全部属于合成实验。 |

`enterprise_data` 只在恶意边界负例中作为应拒绝输入出现，不代表读取、保存或使用了企业数据。本轮不把合成结果外推为效率、收入、ROI、客户效果或经营提升。

## 12. 飞书与现场能力口径

- P01—P13：13/13 的 `execution_status=not_tested`，`result=null`，`evidence=null`。
- 真实飞书登录、CLI、OpenAPI、Base 资源创建和 Base 写入操作：0。
- 真实 table/record/field ID、权限、跨表原子性、CAS、durable outbox、worker lease、故障恢复和 exactly-once：`not_tested/null/0`。
- 真实新石器数据：`not_tested/null/0`；未接入企业 IAM、真实 LLM 或车辆控制，未声称系统已上线或现场能力已通过。
- canonical material 四维绑定、outbox outcome 与能力可见性仅由离线合成合同验证，不构成真实 Base、CAS、outbox 或 exactly-once 证据。

## 13. Lunar OS bridge

子任务环境中的 prepare 阻塞原文为：

`Operation not permitted: '/Users/liuxiaoweiran/Documents/ai大赛/.codex/PROJECT_MEMORY.json.tmp'`

本轮没有重试 bridge，没有覆盖或删除 `.codex/PROJECT_UPDATE.md`，也不声称 Lunar OS 项目记忆已同步。

## 14. 剩余风险与下一阶段

1. F1 仍需由参赛者本人按 P01—P13 完成登录、权限和最小现场探针。
2. F2 必须根据真实平台证据裁决 `atomic_all_targets`、`sealed_outbox_cas` 或 `insufficient`；不足时保持人工安全路径。
3. 真实 executor、permission recheck、selector→locator 解析、durable outbox、单 owner lease、每目标 CAS/ack 与崩溃续跑需要另立规格和故障注入，不能由当前 Base 状态或本地测试推定。
4. 只有 core、test、record 三个最终 SHA 均在文件外冻结后，G7 才能从 logical `0.1.6` 开始，再按 build → derivatives 顺序推进。旧 logical/build 及全部 derivatives 均基于已被推翻的旧冻结，已经作废；本记录落盘时 G7 尚未放行，本轮也未运行 validator。record SHA 由主控在本文件外计算，本记录不自引用自身 SHA。

最终结论：P0=0、P1=0、P2=0。  
偏航结论：`已纠正`
