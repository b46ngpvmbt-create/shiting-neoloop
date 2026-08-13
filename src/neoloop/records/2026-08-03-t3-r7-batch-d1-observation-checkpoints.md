# T3-R7｜W6 观察期高层动作与 7/30 天检查点

日期：2026-08-03  
任务线：T3 工程内核  
对应阶段：完整 Batch D/E 的第一段  
结论：`已纠正`

## 本轮完成范围

本轮只开放三个 W6 高层动作：

- `enter_observation`
- `record_day_7`
- `record_day_30`

`archive_observation` 和 `reopen_recurrence` 没有进入高层命令面。测试中只使用仓储层已有原语构造“已提交的重开历史”，用于验证检查点能读取这类权威来源，不代表本轮已经实现归档或重开编排。

## 最终合同

### 进入观察期

- 调用方只能提交 `event_id / case_ids / cluster_id / improvement_id / actor / reason`。
- `cycle_id`、历史与提交回执 ID、发生时间和时钟来源由可信端口及仓储状态生成，调用方不能注入。
- 人工授权阶段为 `observation`。等待授权时不持有 case、cluster 或 improvement 资源锁。
- 授权通过后，在完整资源锁内重验可信时钟，并由仓储执行授权能力校验、CAS 和原子提交。
- 授权拒绝、伪造或错误通道的 grant、授权期间时钟漂移和 CAS 竞争都不会产生目标业务写入。

### 7 天与 30 天检查点

- 两个动作只接受 `event_id / case_ids / cluster_id / improvement_id / cycle_id / related_task_volume`。
- 不接受 actor，不调用 AI，也不调用人工授权器。
- 只允许活动周期在精确 `expected_at`、且与周期 `clock_source` 一致时提交；等待资源锁后会再次检查时钟。
- 30 天检查点必须已有同周期 7 天检查点，并累计包含 7 天复发来源。
- 复发案件只从已提交的 active-intake 历史和已提交的 recurrence-reopen 周期事实派生；候选、被拒绝、未提交或其他周期记录不计入。
- `related_task_volume` 只能是 `null` 或正安全整数，且不能小于权威复发数。没有分母时保留复发数，复发率为 `null`。

### 重放与审计

- 同一 event、同一载荷返回缓存业务结果，只补失败的同一审计，不重复生成 ID、授权或提交业务。
- 同一 event、不同载荷返回 `event_conflict`。
- D1 动作的结果文案使用 observation Batch D 标识；旧 Batch C 动作继续保留原回放文案。
- `W6-BATCH-C-WORKFLOW-AUDIT-*` 作为已有兼容审计键没有修改；事件指纹的 `improvement_batch_c / observation_batch_d` 分流也保持不变。

## RED、GREEN 与终审修正

最初新增 11 组高层测试后，local 共 259 项：旧 248 项全绿，新增 11 项全部失败。首个失败是合法 `enter_observation` 被高层命令边界拒绝；其余新场景同样停在未实现的 action/dispatch，证明 RED 来自缺少高层编排，不是仓储回归。

第一版实现和四类补充边界落盘后，local 为 263/263。补充边界包括错误周期、分母小于权威复发数、Day-30 的 ±1ms/时钟来源，以及已提交 recurrence-reopen 历史来源。

独立终审随后发现 3 组 P1：

1. D1 回放和失败结果仍沿用 Batch C、N5/N6 文案。
2. 授权等待或资源锁等待后的时钟漂移会被混报为授权能力失败或仓储失败。
3. 多个负向测试只证明“不是 invalid_command”，没有锁定应有错误类别。

主控接管修正后：

- 旧 Batch C 与 observation Batch D 的回放文案按 action 分流，兼容 audit ID 和事件指纹不变。
- 新增内部 `W6ObservationStateError`，只标记明确的业务状态或可信时钟边界；仓储读取异常仍为 `repository_failure`，授权能力错误仍为 `authorization_capability_invalid`。
- 新增授权后时钟漂移和 Day-30 锁等待时钟漂移测试；早晚、时钟源、缺 Day-7、错周期和分母不足均精确断言 `invalid_state`。
- 正向测试补查 cycle 触发类型、授权主体、策略版本、history 与 receipt；命令攻击补查 clock/history/receipt/grant/principal/policy 等注入字段。

最终 local 增至 265/265。安全复审与语义复审分别检查修正版，结论均为 P0=0、P1=0、P2=0，可冻结。

## 验证结果

- local：`node tests/core/run-core-tests.mjs --local-only`，265/265。
- cross：`node tests/core/run-core-tests.mjs --cross-only`，4/4。
- full：`node tests/core/run-core-tests.mjs`，269/269。
- strict scoped TypeScript：NodeNext、ES2022、`--strict`，覆盖 `src/neoloop/**/*.ts` 与 `services/openapi-ingest/**/*.ts`，退出码 0。
- scoped ESLint：`w6-improvement.ts` 与 `w6-improvement.test.mjs`，退出码 0，0 warning。
- 全仓 lint：退出码 0，0 warning。
- 全仓 `npx tsc --noEmit` 仍受既有 Cloudflare 全局类型缺失影响：`cloudflare:workers`、`Fetcher`、`D1Database`。这不是本轮两文件引入的问题，也没有被写成“全仓类型通过”。

## 冻结文件与 SHA-256

- `src/neoloop/workflows/w6-improvement.ts`：`fcf3393c67ea1539e98545179898e04a3f48c392011afaae81d339a141a73b07`
- `tests/core/w6-improvement.test.mjs`：`314055ff5956ed9da5a3db53456f176875e407db84077cb1e6f0f123f4055028`
- `src/neoloop/workflows/repository.ts`：`1714941412abd7965f823b873257f99f26cba84210cf87c457bd0ec5c5b7428b`（本轮未改）
- `src/neoloop/workflows/model.ts`：`622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753`（本轮未改）
- `src/neoloop/workflows/index.ts`：`c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3`（本轮未改）
- `tests/core/w6-repository.test.mjs`：`be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb`（本轮未改）
- 主计划：`6d926c4991c8d1156b3456d33b57c717f08ce882ce8a625b5af94710a4e9145f`
- A+ 规格：`e4448de64569c1f449470a6c8cbeaf32cc7660cc94023667ee8532034d95abd1`

## 所有权、工具中断与事实边界

- 实际代码修改只在 `w6-improvement.ts` 和对应高层测试；另新增本记录。没有修改 repository、model、index、飞书包、数据、应用、依赖、计划或规格。
- 侧栏 T3 与 T1 在长时运行后出现桌面运行器 `systemError`。磁盘文件和已完成测试未丢失；主控接管验证，并用两份临时只读复审补齐安全与语义裁决。该工具中断不被写成工程测试失败，也不被隐去。
- Lunar OS bridge `prepare` 先因 `.codex/PROJECT_MEMORY.json.tmp` 写权限被拒，受控权限申请又因当前审批额度用尽而被系统拒绝。本轮没有绕过、删除或改写现有 `.codex/PROJECT_UPDATE.md`，不声称项目记忆已同步。
- 所有记录仍是本地 `synthetic_experiment`、test clock 与 scripted fake 证据；不外推为数据库事务、跨进程 exactly-once、企业 IAM、真实模型质量或真实经营效果。
- 未调用真实飞书、OpenAPI、LLM 或新石器接口；未读取凭证，未推送、部署或提交赛事作品。

偏航结论：`已纠正`

