# NeoLoop canonical 合成种子（T1 第一轮，R1.1 契约修正）

状态：机器可读初稿，不是已接入企业系统的数据，也不是最终冻结契约。

当前 schema 版本：`1.0.0-draft.2`。本版本只修正跨任务字段与关系契约，不改变 10 表、状态机或事实边界。

本目录由报名阶段合成 Excel 迁移而来。源文件保持不变，SHA-256 固定为：

```text
9fe6fae6cb0f6cc4ca25695df57cc61b8a1a30c6f9f9d667ff7a8125a73f3be5
```

全部业务记录的 `data_scope` 固定为 `synthetic_experiment`。记录中的车辆、任务、站点、人员、时间、状态和结果均为合成样例，不对应新石器或任何企业的真实记录。

## 目录

- `manifest.json`：10 表清单、主键、固定回归数量、状态枚举和安全契约。
- `fact-boundaries.json`：公开事实、待企业验证、方案设计、合成实验四类边界。
- `migration/source-audit.json`：源工作簿哈希、工作表范围和网站数据漂移审计。
- `migration/legacy-to-canonical.json`：完整 ID 映射、状态映射和主控复核项。
- `tables/*.json`：10 张 Base 表的机器可读合成种子。
- `scenarios/`：后续可运行主故事和故障演练；不得覆盖 `tables/cases.json` 中的历史快照。

## 10 表与首轮行数

| canonical 表 | 文件 | 行数 | 来源 |
| --- | --- | ---: | --- |
| 原始反馈 | `tables/raw-feedback.json` | 30 | 报名 Excel 直接迁移 |
| 反馈案件 | `tables/cases.json` | 20 | 报名 Excel 迁移并规范 ID/状态 |
| 处置工单 | `tables/work-orders.json` | 27 | 报名 Excel 迁移并规范状态 |
| 问题簇 | `tables/clusters.json` | 10 | 报名 Excel 迁移并规范状态 |
| 改进项目 | `tables/improvements.json` | 10 | 根据合成问题簇生成结构草案 |
| 车辆档案 | `tables/vehicles.json` | 8 | 报名 Excel 车辆区迁移 |
| 配送任务 | `tables/delivery-tasks.json` | 12 | 报名 Excel 任务区迁移 |
| 站点责任矩阵 | `tables/routing-matrix.json` | 20 | 从合成案件生成待企业验证候选 |
| 知识索引 | `tables/knowledge-index.json` | 4 | 方案设计占位，均未审核、不可引用 |
| AI 审计 | `tables/ai-audit.json` | 0 | 首轮不伪造尚未发生的 AI 运行 |

## 固定迁移规则

- `DEMO-C-002` → `SYN-CASE-017`（舱门主故事）。
- `DEMO-C-017` → `SYN-CASE-002`（冷链案例）。
- 其他 `DEMO-C-n` → `SYN-CASE-n`。
- 案件缺失字段统一使用 `missing_fields`；不再输出 `missing_items`。
- 旧`已分诊`只有在 `missing_fields` 为空时迁为`待关联`，否则迁为`待补充`；当前 `DEMO-C-011`、`DEMO-C-015`、`DEMO-C-018` 均因缺少车辆和任务 ID 保持`待补充`。
- 旧“关联模式=自动”只保留为 `candidate_generation_mode=AI`；`formal_entity` 为空，正式关系统一为`待人工确认`。
- 旧“观察中”案件因没有关闭时间迁为`待回访`，长期观察另进入合成改进项目草案；这是待主控复核的迁移决定，不是契约变更。
- 所有报名 Excel 迁入案件都标记 `record_mode=legacy_snapshot`。历史状态为`已关闭`但正式实体仍待人工确认的记录标记 `workflow_readiness=requires_replay_reset`，不能直接充当新版工作流验收结果。
- 改进项目状态由关联问题簇状态决定：`候选/待审核→待立项`、`改进中→执行中`、`观察中→观察中`、`已归档→已完成`、`已驳回→已终止`。

## 生成与校验

不需要新增 npm 依赖：

```bash
node scripts/neoloop-data/build-canonical-seed.mjs
node scripts/neoloop-data/validate-canonical.mjs
node --test tests/data/canonical-migration.test.mjs
```

若本机仍有原报名 Excel，可额外复核源文件字节：

```bash
node scripts/neoloop-data/validate-canonical.mjs --source-xlsx /absolute/path/to/石听_NeoLoop_报名数据样例.xlsx
```

校验器固定检查 30 条反馈、20 个案件、27 张工单、10 个问题簇，以及零重复主键、零孤立外键、零未映射状态；同时检查 `missing_fields`、历史快照回放隔离和问题簇—改进项目状态关系。显式传入正确源 Excel 时警告数必须为 0。它不会修改源 Excel。
