# 石听 NeoLoop canonical public 快照

这是供 T4 公开站只读消费的唯一脱敏快照。全部业务内容均为 `synthetic_experiment`，不是新石器真实客户、车辆、任务、事故、效率、收入、ROI 或现场运行记录。

- schema：`1.0.0-draft.2`
- fixture：`1.0.0-t1-r2`
- public snapshot：`1.0.0-t1-r3-public.1`
- 固定时点：`2026-08-01T00:00:00+08:00`
- 消费边界：T4 只能读取 `data/canonical/public`，不得直接读取 canonical 私有层或原始报名材料。
- 运行边界：主故事和四类故障均为 `not_run`；历史关闭状态不是新版工作流验收证据。
- 人工边界：正式实体、责任、风险降级、结案、最终根因和发布仍需人工确认。

本目录由 `scripts/neoloop-data/build-public-snapshot.mjs` 确定性生成。不要手工编辑生成文件。R2 工作簿的冻结窗格和打印区域阻断项不属于本快照验收范围，仍由主控保留。
