# T2 飞书落地｜R3 现场探测包偏航检查

日期：2026-08-01  
轮次：T2-R3  
对应主计划：二.1、二.2、二.4、二.5、二.6、第一天权限验收、四类故障与现场证据边界  
结论：已纠正

## 上一段未收口与本轮纠正

上一段执行停在增量文件实现阶段，没有完成五道正式验收门、轮末主计划回读和本偏航记录，因此不能作为 R3 完成交付。首次运行 `validate-day-1-probe-package.mjs` 时，还把导入 DAG 的“传递依赖可达”误写成“每个关系目标必须是直接依赖”，导致 `improvements → IMP-REL-01 → clusters` 的合法路径被误报。

本轮将关系依赖检查改为有向图可达性检查，仍同时要求目标批次先完成、执行图无环、引用可解析；没有改变批次拓扑、canonical 契约或现场状态。随后删除 validator 中一个未使用变量并复跑全仓 lint，最终为 0 error、0 warning。

## 完成项与证据路径

1. Day-1 probe suite：`feishu/manifests/day-1-probe-suite.v0.1.json`。
   - 精确覆盖 P01—P13；每项包含前置、逻辑角色、执行人、操作类别、写入/可逆性、最小动作、预期、失败判定、F01—F12 映射、证据单元、清理与保底。
   - P03 分为搭建前边界探测和搭建后五视图复验；前段只能放行受控搭建，不能完成 P03。
   - P02 的临时 formula/helper/automation 探测明确不进入冻结 10 表；P04/P05 能力探测不充当 N1—N7/W1—W6 运行证据。

2. Base 导入批次计划：`feishu/manifests/base-import-batch-plan.v0.1.json`。
   - 10 表、13 个执行单元，按依赖拓扑执行 dry-run、分批写入、检查点、幂等/续跑、关系回填和最终零增量复验。
   - 9 个关系分为 8 个内联关系和唯一延迟回填 `cases.cluster_id → clusters`，解决唯一 `{cases, clusters}` 强连通分量；没有新增 helper 字段。
   - 10 个表批次复用现有 T01—T10 证据单元，回填复用 T02；导入期间 AI 节点、自动化、机器人和分享保持关闭。
   - 资源映射和结果文件在现场加载前必须通过 `git check-ignore`，否则失败关闭。

3. SYN-CASE-017 与四类故障 smoke 计划：`feishu/manifests/on-site-smoke-plan.v0.1.json`。
   - 顺序固定为主故事、同键幂等、实体 ID 缺失、AI Schema 二次失败、SLA 超时，共 5 个单元。
   - 要求干净 runtime copy、replay reset、逐单元清理、人工关口、失败停点和实际证据捕获。
   - canonical fixture 继续保持 `not_run`，expected semantics、fixture 字段和历史快照均不充当运行证据。

4. 现场结果模板：`feishu/evidence/day-1-probe-results.example.json`。
   - 承接 13 个权限探针、5 个业务视图、7 个节点、6 个工作流、3 个逻辑角色和 2 个独立访问检查，共 36 个结果单元。
   - P01 匿名文档与 P03 Base 无特权访问使用不同记录；三个逻辑角色没有平台角色映射结论。

5. 官方 CLI/OpenAPI 能力探测手册：`feishu/runbooks/lark-cli-openapi-capability-probe.md`。
   - 先核赛事规则，再由参赛者本人完成安装同意、登录/OAuth/设备确认，由管理员批准应用、scope 和资源访问。
   - 覆盖 `auth status`、`auth scopes`、`auth check`、`bitable:app`、Base 元数据只读探测、单条可逆写入、清理和脱敏。
   - 分开处理认证、授权、资源访问、限流、写冲突、未知提交超时、输入/Schema 和上游网络错误。

6. 失败关闭校验器：`feishu/scripts/validate-day-1-probe-package.mjs`。
   - 嵌套要求既有 152 项基线不回归，再校验 P 目录、源哈希、10 表 DAG、关系分区、证据映射、场景边界、36 结果单元、14 字段 AI envelope、7 节点、6 工作流、一次重试、人工关口、禁止动作、空状态和敏感值。
   - 内置缺 P13、空证据成功、缺依赖、源哈希漂移、非空资源和凭证/真实资源 URL 六类负向自测。

## 修改文件与 SHA-256

| 文件 | SHA-256 |
| --- | --- |
| `feishu/manifests/day-1-probe-suite.v0.1.json` | `e070ec8a34ecf95106859f83eab215adf2858754662aebbe806286b815a63e79` |
| `feishu/manifests/base-import-batch-plan.v0.1.json` | `6544000fdfc7144b745ff442f9c3a20d15ee6f24de0cc0e5149a8ee9b1305fd9` |
| `feishu/manifests/on-site-smoke-plan.v0.1.json` | `c80465be1a5aa9f8d7fbc0bd8942ebd188484288bd0d762292aee05c355b655d` |
| `feishu/evidence/day-1-probe-results.example.json` | `9fe3eb073190afcc9535d1578dd7833cfbdf5fa2393297f2bf96e9580faf1c45` |
| `feishu/runbooks/lark-cli-openapi-capability-probe.md` | `7a0b6d02799069c226938761f3207f971c9e9dc62022f935793fc8d30ee28178` |
| `feishu/scripts/validate-day-1-probe-package.mjs` | `ebaf0cdbb1078a577c2d3998a210c4263bb614c54a795409f77eceab6e9c49c9` |
| `feishu/rounds/T2-R3-deviation-check.md` | 本记录；写入后不自嵌哈希 |

## 验证命令与精确结果

| 命令 | 结果 |
| --- | --- |
| `node feishu/scripts/validate-contract-alignment.mjs` | 80/80；0 失败，0 上游冲突 |
| `node feishu/scripts/validate-offline-package.mjs` | R2 增量 72/72；连同契约基线 152/152，0 失败 |
| `node feishu/scripts/validate-day-1-probe-package.mjs` | R3 增量 61/61；连同既有基线 213/213，0 失败 |
| `node tests/core/run-core-tests.mjs --cross-only` | 4/4；0 失败、0 跳过 |
| `npm run lint` | 退出码 0；0 error、0 warning |
| `git diff --check` | 退出码 0 |

非重复机器断言总数为 217/217：R3 失败关闭门 213 项（其中既有 152 项 + R3 增量 61 项）加 T3 cross-contract 4 项。单独再次执行 80/80 和 72/72 是基线复验，不重复计入 217。

## 空值、数量、依赖与映射核验

- 13/13 probes 的 `execution_status` 均为 `not_tested`，`result/evidence` 均为 `null`；P01—P13 没有任何现场状态结论。
- R3 四份机器包共有 70/70 个执行记录保持 `not_tested + result:null + evidence:null`：13 probe；导入包顶层和 13 执行单元共 14；smoke 包顶层和 5 单元共 6；结果模板顶层和 36 单元共 37。
- R3 新增资源槽 48/48 为 `null`：导入计划 1 个 `app_token` + 10 个 `table_id`，结果模板 37 个资源槽。
- 既有 `resource-mapping.example.json` 的 `resources` 下 300/300 个空叶值仍为 `null`；既有 41/41 证据单元仍全部“未测试”，actual 字段为空、索引待填。
- 数量为 13 probes、10 table batches、13 import execution units、5 smoke units、36 result units；逻辑规模仍为 10/5/3/7/6。
- P probe 依赖图和 13 单元导入图均无环、无缺失依赖、无逆序依赖；10 表关系图唯一多节点强连通分量为 `{cases, clusters}`，已由一次延迟回填拆分。
- P01—P13 映射到既有 P 证据单元；10 表映射到 T01—T10；5 视图、7 节点、6 工作流分别映射到既有 V/N/W 单元；匿名文档和 Base 无特权访问记录彼此独立。
- `SYN-CASE-017` 与四个 failure fixture 的 canonical `execution_status` 仍为 `not_run`，`run_evidence/observed_results` 为空；没有把 fixture 当作现场运行证据。

## 权限、部署与事实边界

- 本轮只产生 `solution_design` 离线包，没有进行赛事飞书、Base、文档、妙搭、Aily、自建应用或机器人操作。
- 未安装或登录 `lark-cli`，未打开 OAuth，未调用真实 Base OpenAPI，未创建或填写真实资源 ID、token、secret、成员标识或完整飞书资源链接。
- 未推送 Git、未部署、未创建真实 Base，也不声称获得赛事权限、完成现场搭建或接入新石器真实数据。
- schema 仍为 `1.0.0-draft.2`，fixture 仍为 `1.0.0-t1-r2`；10 表字段、五组状态、14 字段 AI envelope、人工关口、七节点、六工作流和集成顺序均未改约。
- AI 仍只输出候选、建议、假设或草稿；车辆/调度控制、自动判责、赔偿、恢复时间承诺、最终技术根因和未审知识发布仍被禁止。
- P03 的两阶段设计只消除现场顺序循环，不降低最终五视图无特权复验门；P04/P05 平台能力探测不推导节点/工作流实现或现场运行状态。

## 文件所有权与共享工作区

- T2 本轮所有补丁目标均位于 `feishu/**`，没有修改 `data/**`、`src/**`、`services/**`、`app/**`、`tests/**`、`package.json`、锁文件、README、主计划、A+ 规格、发布文档、Git 配置或用户已有文件。
- 轮初与轮末 `git status --short` 的外部状态条目集合相同：四个既有修改项，以及 `.codex/`、`data/canonical/`、主计划/记录、`feishu/`、数据脚本、服务、源码和测试等并行未跟踪目录。
- 轮初记录的 `feishu/**` 外快照为 128 个文件、聚合 SHA-256 `d3c687410f4b1739d4e7e9363d7898a4a56fa7ba5b8647d91a1c2ad071717893`；轮末按“已跟踪 + 未忽略未跟踪，排除 feishu/node_modules/.next/dist”复算为 159 个文件、聚合 SHA-256 `589ed706d5453e7bc47a57f45c5b731aff419311cab56ffab8b5934c03642d03`。
- 外部文件数和聚合 SHA 在 T1/T3 并行任务继续写入时发生变化，不能据此声称整个共享工作区字节不变。T2 的 `apply_patch` 目标全部在 `feishu/**`，只读测试读取外部冻结契约但未写入；外部差异需由主控按各任务记录归因复核。

## 风险、阻塞与下一轮现场前置

1. P01—P13 没有现场证据，所有平台能力都只能保持 `not_tested`；离线 217/217 不能替代赛事租户验收。
2. 参赛者本人须先确认赛事允许自建应用、CLI、OAuth 和 OpenAPI，再亲自登录、授权、设备确认、匿名分享和保管凭证；管理员须批准产品、应用、最小 scope、资源协作者和第二个无特权身份。
3. P03 必须先做隔离的搭建前边界探测，五视图完成后再做完整复验；前段不能产出 P03 最终结论。P01 临时文档结果也不能免除最终作品文档匿名复验。
4. P11 的赛事许可、应用审批和资源授权成立后，P12/P13 才能开始；OpenAPI 先只读，之后最多一条经批准的可逆合成写入；CLI 参数以安装版本 `--help` 为准。
5. 当前仓库没有实际本地资源/结果文件的 Git ignore 配置。现场负责人必须先在 `.git/info/exclude` 或仓库外受控位置落实本地路径，并以 `git check-ignore` 通过为硬门；本轮按所有权没有修改 `.gitignore` 或 Git 配置。
6. Lunar OS bridge `prepare` 被既有 `.codex/PROJECT_UPDATE.md` 未交接状态阻断：`Existing PROJECT_UPDATE.md has not been handed off. Submit or review it before preparing a new update.` 本轮未越界修改 `.codex/**`，不声称项目记忆已同步。
7. 已在全部自检后完整重读 493 行唯一主计划。本轮停在 R3，未进入真实现场执行、R4、推送或部署。

下一轮只有在主控审阅 R3 包、参赛者明确启动现场验收、赛事规则允许、本人/OAuth/管理员/第二身份就绪、真实本地文件通过 ignore 门后才能开始。现场仍须逐项填写实际动作、时间、账号角色、结果、限制、证据、清理和复验人。

结论：已纠正。
