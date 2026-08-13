# T2-R5-W6-INTERNAL-ACTION-SYNC 偏航检查

日期：2026-08-03  
范围：飞书离线合同同步，未连接真实飞书

## 本轮交付

1. logical manifest 由 `0.1.2` 升至 `0.1.3`：
   - `intake_active_observation_recurrence` 只是 W6 内部授权 action，未新增第七条 workflow。
   - 固定 `N5 existing_cluster → repository-issued N5 receipt → 人工 recurrence 授权 → 完整资源锁内 intake → Day7 → Day30`。
   - N5/N6 receipt 按 action、node、mode、version、validator version 双向隔离，单次使用。
   - intake 只写 `clusters.member_case_ids`，追加 `clusters.recurrence_records` 与审计；禁止回写 case、feedback、improvement、observation cycle 及状态。
2. build package 由 `0.1.1` 升至 `0.1.2`：完成 W6 composite step binding、action 写白名单、审计、回退和精确嵌套 logical ref 解析。
3. 校正已冻结的审计补偿语义：业务原子提交只包含成员关系与复发记录；业务提交成功而 workflow audit 写入失败时保留已提交结果并标记 `audit_pending`，以同一 `workflow_audit_id` 只补审计，不重跑 N5、人工授权或业务写入。
4. Day-1 probe suite、10 表 import plan、5 组 smoke plan 和 41 单元 evidence template 均升至 `0.1.1`，并保持未测试/空值。
5. 三个只读 validator 增加 W6 内部 action、精确顺序、双向 receipt 隔离、写边界、人工授权与 checkpoint 分事务、`audit_pending` 补偿、无分母 `rate=null`、人工归档和禁止自动知识发布的失败关闭断言。

## 最终版本与 SHA-256

| 文件 | 版本 | SHA-256 |
| --- | --- | --- |
| `feishu/manifests/neoloop-logical-manifest.v0.1.json` | `0.1.3` | `becc35cfd5745879094b19fc00a88f0265fcff31bdd903c3ad5a2c7b1b242eb2` |
| `feishu/manifests/on-site-build-package.v0.1.json` | `0.1.2` | `ecebe6a2b55758c0f0271738258a93e9c2404d94cd4f1679719828b70bfe9563` |
| `feishu/manifests/day-1-probe-suite.v0.1.json` | `0.1.1` | `cfac114ec085aa743d913e2f479161fdf56dc4f4af04a3a2f3e8ad0752c5fb3a` |
| `feishu/manifests/base-import-batch-plan.v0.1.json` | `0.1.1` | `624459dabe09ed6ca074a059b51de1dc9ae69f5ffa6331a64a6f9a1a47fabce5` |
| `feishu/manifests/on-site-smoke-plan.v0.1.json` | `0.1.1` | `987908f531e41c55419c4fd0ce445868672eb74c8a5dbab1190ff733b7c6d771` |
| `feishu/evidence/on-site-evidence-template.json` | `0.1.1` | `b2d358e79d08660feb5c7ddd37187e3be1d2059a227bfcc2d1f30dcadfbe859a` |
| `feishu/scripts/validate-contract-alignment.mjs` | — | `c7b908780710c042b6d876dcf07e701566b858f73636b0f30532cd91d2fb8b1a` |
| `feishu/scripts/validate-offline-package.mjs` | — | `91ee3ac2cfbc5b12c4dbe66581fb4ac43f703a03f4d36a38d03e2fd56e8f1217` |
| `feishu/scripts/validate-day-1-probe-package.mjs` | — | `4cecc155d7c203adc64f98b252b3d287feba2bef4e7e03d2f4c49f0ed57e7c05` |

上游 canonical schema 仍为 `1.0.0-draft.2`；本轮未修改 canonical 或 T3 冻结文件。派生包内 logical/build 哈希均由最终文件真实重算后级联，无预造值或旧哈希残留。

## 验证证据

| 命令 | 精确结果 |
| --- | --- |
| `node feishu/scripts/validate-contract-alignment.mjs` | 96/96，0 失败，0 上游冲突 |
| `node feishu/scripts/validate-offline-package.mjs` | 增量 83/83，累计 179/179，0 失败 |
| `node feishu/scripts/validate-day-1-probe-package.mjs` | 增量 71/71，累计 250/250，0 失败 |
| `node tests/core/run-core-tests.mjs --cross-only` | 4/4，0 失败、0 跳过 |
| `node tests/core/run-core-tests.mjs --local-only` | 246/246，0 失败、0 跳过 |
| Core 合计 | 250/250 |
| `npm run lint` | 退出码 0；0 error，0 warning |

## 未测试、空值与事实边界

- P01—P13：13/13 的 `execution_status=not_tested`，`result=null`，`evidence=null`；未改写为可用、受限、不可用或已通过。
- R3 执行记录：70/70 保持 `not_tested + result:null + evidence:null`。
- 现场证据：41/41 保持“未测试”，实际结果和证据索引待填。
- 资源槽：R3 48/48 为 `null`；`resource-mapping.example.json` 的 300/300 个资源值叶子为 `null`。
- 数量仍为单 Base 下 10 表 / 5 视图 / 3 逻辑角色 / 7 AI 节点 / 6 工作流；新 action 只属于 W6。
- validator 真实飞书操作、lark-cli 安装/登录、OpenAPI 调用均为 0。本轮没有真实 Base、资源 ID、token、截图、真实数据、LLM 调用、上线、推送或部署声明。

## 所有权与修改文件

本轮写入仅限以下 `feishu/**`：

- `feishu/manifests/neoloop-logical-manifest.v0.1.json`
- `feishu/manifests/on-site-build-package.v0.1.json`
- `feishu/manifests/day-1-probe-suite.v0.1.json`
- `feishu/manifests/base-import-batch-plan.v0.1.json`
- `feishu/manifests/on-site-smoke-plan.v0.1.json`
- `feishu/evidence/on-site-evidence-template.json`
- `feishu/scripts/validate-contract-alignment.mjs`
- `feishu/scripts/validate-offline-package.mjs`
- `feishu/scripts/validate-day-1-probe-package.mjs`
- `feishu/rounds/T2-R5-W6-INTERNAL-ACTION-SYNC-deviation-check.md`

未写入、格式化、回退或整理 `src/**`、`tests/**`、`data/**`、`services/**`、`app/**`、canonical/public/Excel、package、README、主计划、网站、Git 或其他任务的共享修改。核心与跨契约命令仅在系统临时目录中进行只读编译/测试。

## 契约、状态机与风险

- 不改 schema、10 表字段、五组状态、7 节点、6 工作流或人工关口；本轮只同步 T3 已冻结的 W6 内部 action 行为。
- 无分母时只记复发数并保持 `recurrence_rate=null`；Day7/Day30 仅从已提交 intake 和原 observation clock 取数。
- 归档仍要求 Day7、Day30、授权人工决定和非空人工结论；不自动归档、不自动发布知识、不确认最终技术根因。
- P0=0，P1=0，P2=0（仅指本轮离线合同同步范围）。
- 外部前置仍未满足：P01—P13 需参赛者本人登录，OAuth 和部分能力需管理员审批；在获得现场证据前不能进入真实 Base 搭建、权限验收或上线结论。
- Lunar OS `prepare` 本轮被既有未交接的 `.codex/PROJECT_UPDATE.md` 阻断，原始错误为 `Existing PROJECT_UPDATE.md has not been handed off. Submit or review it before preparing a new update.`。本任务因写权边界不处理 `.codex/**`，不声称项目记忆已同步。

## 下一轮前置

1. 主控复核本轮版本、哈希和共享工作树归属后，再决定是否接纳离线冻结候选。
2. 参赛者确认赛事允许后，由本人完成飞书登录/OAuth；需管理员的能力必须取得明确批准。
3. 按 P01—P13 先验权，再使用空资源映射副本进行最小现场搭建和 smoke；任何未实测项不得预填通过。

偏航结论：**已纠正**
