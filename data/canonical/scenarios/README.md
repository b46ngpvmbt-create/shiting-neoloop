# 可运行场景与历史快照隔离规则

本目录保存 schema `1.0.0-draft.2` 下的独立合成场景夹具：

- `main-story.json`：以 `SYN-CASE-017` 为来源的单案主故事定义。
- `failure-drills.json`：同键/异键、实体 ID 缺失、AI Schema 错误和 SLA 超时四项故障注入定义。

约束：

- `tables/cases.json` 中由报名 Excel 迁入的 20 个案件均为 `record_mode=legacy_snapshot`，只用于追溯旧合成数据。
- 主故事和故障演练均使用 `record_mode=scenario_runtime`、独立运行时 ID、干净初始状态，以及显式 `test` 或 `synthetic_history` 时钟。
- 场景只引用 `SYN-CASE-017` 历史快照，不修改其状态、正式实体、人工确认字段或 SLA 时间。
- 历史快照用于回放前必须复制并 replay reset；`workflow_readiness=requires_replay_reset` 的记录不能直接进入新版工作流。
- `execution_status=not_run`、空 `run_evidence` 和空 `observed_results` 表示夹具尚未执行，不得写成工作流通过、系统上线或企业运行证据。
- 文件中的 `expected_semantics`、预期工作流路径和人工关口是验收预期，不是观察结果。
- 所有数据均为 `synthetic_experiment`，不对应真实客户、车辆、任务、事故、责任或企业成效。
