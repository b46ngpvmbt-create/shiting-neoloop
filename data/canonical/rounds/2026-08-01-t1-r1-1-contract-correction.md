# T1-R1.1 数据契约修正轮｜偏航检查

日期：2026-08-01
任务线：T1 数据与评测
对应主计划：二.2、二.3、二.4及主控冻结共享契约
结论：**已纠正**

## 完成项与证据

1. 案件缺失字段统一为 `missing_fields`。
   - 生成器和 20 条案件种子不再输出 `missing_items`。
   - `DEMO-C-011`、`DEMO-C-015`、`DEMO-C-018` 明确缺少车辆 ID、任务 ID并保持`待补充`。
   - 证据：`scripts/neoloop-data/build-canonical-seed.mjs`、`data/canonical/tables/cases.json`。

2. 旧`已分诊`迁移规则恢复为主计划的条件语义。
   - `missing_fields.length === 0 → 待关联`。
   - 否则 `→ 待补充`。
   - 规则使用机器可读条件对象保存，不再把`已分诊`无条件映为`待补充`。
   - 证据：`data/canonical/migration/legacy-to-canonical.json`。

3. 问题簇—改进项目状态关系冻结并校验。
   - `候选/待审核→待立项`、`改进中→执行中`、`观察中→观察中`、`已归档→已完成`、`已驳回→已终止`。
   - 当前 10 条改进项目分布为：待立项 6、执行中 2、观察中 2；不存在十条全部观察中的漂移。
   - 证据：`data/canonical/manifest.json`、`data/canonical/tables/improvements.json`。

4. 历史快照与可运行场景完成隔离。
   - 从报名 Excel 迁入的 20 个案件全部标注 `record_mode=legacy_snapshot`。
   - 9 个“已关闭且正式实体待人工确认”的历史快照标注 `workflow_readiness=requires_replay_reset`。
   - 后续可运行主故事只能写入 `data/canonical/scenarios/`，不得改写历史快照来制造新版运行证据。
   - 证据：`data/canonical/tables/cases.json`、`data/canonical/scenarios/README.md`。

5. 校验器与测试同步加强。
   - 新增 `missing_fields`/弃用字段、历史快照模式、回放重置、条件分诊和问题簇—改进状态关系检查。
   - schema 版本由 `1.0.0-draft.1` 修正为 `1.0.0-draft.2`，用于明确标识本轮契约修正。
   - 证据：`scripts/neoloop-data/validate-canonical.mjs`、`tests/data/canonical-migration.test.mjs`。

## 自测结果

- 10 表种子重复生成：通过。
- 源报名 Excel SHA-256 显式复核：通过。
- 显式传入源 Excel 时警告：0。
- 30 反馈 / 20 案件 / 27 工单 / 10 问题簇：通过。
- 重复主键：0。
- 孤立外键：0。
- 未映射状态：0。
- 关系不变量违规：0。
- 本轮契约不变量违规：0。
- Node 数据测试：5/5 通过，0 跳过。
- T1 脚本和测试定向 ESLint：通过。

## 越界文件

- 本轮只修改 `data/canonical/**`、`scripts/neoloop-data/**`、`tests/data/**`。
- 未修改 `package.json`、依赖锁文件、`app/**`、`src/neoloop/**`、`feishu/**`、网站、发布文档或原报名 Excel。
- 未覆盖、回退或整理 T0/T2/T3 及其他并行任务的文件。
- 未推送、部署或操作赛事飞书。
- 按项目规则执行 Lunar OS `prepare`；桥返回已有活动会话，本轮未改写项目记忆文件。

## 契约、状态机、事实边界与范围变化

- 修正了字段名和跨表关系表达，但未改变 10 表数量、表职责、主键映射、固定状态枚举或状态机。
- `record_mode` 和 `workflow_readiness` 只区分旧合成快照与未来可运行夹具，不把旧记录改写成新版工作流状态。
- 未改变四类事实边界；全部业务快照仍为 `synthetic_experiment`。
- 未改变权限边界、人工确认关口、D0/D1/D2范围或发布状态。
- 未创建可运行主故事、AI 审计结果或企业运行证据；`scenarios/` 本轮只冻结隔离规则。

## 新假设、依赖与风险

- 本轮没有新增运行依赖，不引入 ExcelJS，不修改 `package.json`。
- 旧问题簇非规范状态到 canonical 问题簇状态的初稿映射仍沿用 R1 记录，未在本轮扩展或重定义。
- T2 的飞书 manifest 仍可能保留旧字段名，但不在 T1 文件所有权内；需由主控在共享契约冻结时协调，不应由 T1 越界修改。
- 未来场景夹具必须采用独立 ID 和干净初始状态；若直接复用 `legacy_snapshot`，校验应拒绝进入新版工作流。

## 下一轮前置条件

- 主控以 schema `1.0.0-draft.2` 审阅并冻结 `missing_fields`、快照/回放隔离和改进状态关系。
- T2/T3 在集成前同步主控冻结后的字段名；不得从 T1 历史快照推断新版工作流已经验收。
- T1 后续创建 `SYN-CASE-017` 可运行主故事时，应在 `scenarios/` 中生成独立夹具，不修改 `tables/cases.json` 的历史记录。
- canonical public 快照仍未冻结，T4 不应把本轮历史数据直接作为可运行站点状态。
