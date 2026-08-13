# T2-R6-DAY7-EDGE-SYNC 偏航检查

日期：2026-08-03  
范围：Day-7 边界的飞书离线合同同步；未连接、登录、调用或配置真实飞书

## 本轮交付

1. logical manifest 由 `0.1.3` 升至 `0.1.4`：
   - `intake_active_observation_recurrence` 仍只是 W6 内部授权 action；总 workflow 数仍为 6。
   - 同一共享守卫 `violatesW6ActiveIntakeObservationWindow` 同时位于 action-scoped N5 receipt 签发前，以及完整 case/cluster/improvement 锁内、state fingerprint CAS 与业务提交前。
   - 基础窗口固定为 `opened_at < closed_at <= min(occurred_at, day30ExpectedAt)`；Day-7 已由同周期 checkpoint 或 `occurred_at > day7ExpectedAt` 封口后，`closed_at <= day7ExpectedAt` 必须拒绝，包含相等毫秒；仅 `closed_at > day7ExpectedAt` 且仍处于基础窗口内的记录可作为 Day-30 候选。
   - checkpoint-first、intake-second 竞态由最终锁内守卫拒绝；即使 N5 与人工授权 capability 已消费，也保持 `business_commit=rejected`、`business_writes=[]`、`w6_state_writes=[]`。
   - capability consumption 作为私有安全状态，与 business commit、business write set、W6 durable state write set 分开记录；不得把 capability 消费记成业务成功或业务/W6 持久写入。
2. build package 由 `0.1.2` 升至 `0.1.3`：镜像双守卫、精确截止条件、`day_7_cutoff_error_stop`、零写回退、独立 outcome，以及时间值、receipt、guard、前后快照和 audit 证据字段。
3. Day-1 probe suite、10 表 import plan、5 组 smoke plan、41 单元 evidence template 均升至 `0.1.2`：在既有单元中增加 Day-7 `< / = / >` 矩阵、receipt 后 checkpoint 抢先提交的竞态、双守卫、零写快照和独立 outcome 采集；未增加 probe、导入单元、smoke 或 evidence 单元，未改变导入 DAG。
4. 三个只读 validator 增加实质性失败关闭断言：固定对象值、精确数组与顺序、精确 `<=`、相等毫秒、双 guard point、竞态零写、capability/业务 outcome 分记、六 workflow 与未测试/空值状态；没有以模糊关键词或旧基数代替新合同检查。

## T3 冻结输入核验

| 文件 | SHA-256 | 核验 |
| --- | --- | --- |
| `src/neoloop/workflows/repository.ts` | `1714941412abd7965f823b873257f99f26cba84210cf87c457bd0ec5c5b7428b` | 一致 |
| `tests/core/w6-repository.test.mjs` | `be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb` | 一致 |
| `tests/core/w6-improvement.test.mjs` | `c807ccb527db285a3a02a1c9ff2b46206dcac7edfa1c2cdde1c4fb0b3b242972` | 一致 |
| `src/neoloop/records/2026-08-03-t3-r6-p1-fix-3.md` | `066fbf566dfb23eefc640d3e366e2af6d2bc774e33f78b4f3823987c06d99a14` | 一致 |

logical manifest 的冻结记录还对 model、W6 improvement、workflow index 与两份 W6 测试的实际内容哈希进行机器核验；任何上游文件变化都会使 contract validator 失败关闭。

## 最终版本与级联 SHA-256

| 文件 | 版本 | SHA-256 |
| --- | --- | --- |
| `feishu/manifests/neoloop-logical-manifest.v0.1.json` | `0.1.4` | `f1fabdcd6c973740829afa2ad3dc6fd53b6d6ed896a5e51e39b81a1550ee749e` |
| `feishu/manifests/on-site-build-package.v0.1.json` | `0.1.3` | `21ded18cd390386fbb865fb84b3f21a214a641149b0086def8ebc2404d00d169` |
| `feishu/manifests/day-1-probe-suite.v0.1.json` | `0.1.2` | `409328886cb85922363c11514b96f686bcb88e02132b06d0c4baf6e23ba6696e` |
| `feishu/manifests/base-import-batch-plan.v0.1.json` | `0.1.2` | `52595768a5b87794e0e7359e59e86391201b196aa7de37c7c321785cfe1b62a3` |
| `feishu/manifests/on-site-smoke-plan.v0.1.json` | `0.1.2` | `c37a9243eddc893473d4c808272d49e6eaa052c7dda524d174890c57159f09c1` |
| `feishu/evidence/on-site-evidence-template.json` | `0.1.2` | `e65d2d109fa8cac366e6f25b6f3d5526f519af0bbf53a2b61d88619fc376378c` |
| `feishu/scripts/validate-contract-alignment.mjs` | — | `d3c43a9921e64d930b0ebbbee5fe58ddb9e322bb8c67d6794132370d0cdff0f7` |
| `feishu/scripts/validate-offline-package.mjs` | — | `ad86e9672431fd9b2c589231511873cece737ab106f8bebb5bbe99e07bd962c0` |
| `feishu/scripts/validate-day-1-probe-package.mjs` | — | `114ace240a17ded5cf80beedcc6758fc50fad90f71e048ac58e70edb04a958f1` |

Day-1 probe 与 import plan 均 pin 最终 logical/build 真实哈希；smoke plan pin 最终 logical 真实哈希。所有值均由最终文件重算后级联，未预造哈希。

## 验证证据

| 命令 | 精确结果 |
| --- | --- |
| `node feishu/scripts/validate-contract-alignment.mjs` | 101/101，0 失败，0 上游冲突 |
| `node feishu/scripts/validate-offline-package.mjs` | 增量 87/87，累计 188/188，0 失败 |
| `node feishu/scripts/validate-day-1-probe-package.mjs` | 增量 77/77，累计 265/265，0 失败 |
| `node tests/core/run-core-tests.mjs --local-only` | 248/248，0 失败、0 跳过 |
| `node tests/core/run-core-tests.mjs --cross-only` | 4/4，0 失败、0 跳过 |
| `node tests/core/run-core-tests.mjs` | 252/252，0 失败、0 跳过 |
| `npm run lint` | 退出码 0；0 error，0 warning |

独立只读复核确认三个 validator 对对象值、精确数组、空数组、顺序和 source hash 做结构化断言，不是仅搜索文案；本轮离线同步范围没有未关闭缺口。

## 未测试、空值与事实边界

- P01—P13：13/13 的 `execution_status=not_tested`，`result=null`，`evidence=null`；没有预填可用、通过或现场结论。
- R3 执行记录：70/70 保持 `not_tested`，70/70 的 result/evidence 为空。
- 现场证据：41/41 保持“未测试”，实际结果和证据索引为空。
- R3 资源字段：48/48 为 `null`；没有 app token、table/field/view/role/automation ID 或真实链接。
- 单 Base 的合同数量仍为 10 表 / 5 视图 / 3 逻辑角色 / 7 AI 节点 / 6 工作流；导入仍为 10 个 table batch、13 个有序无环执行单元，DAG 未改变。
- validator 记录的真实飞书操作、lark-cli 安装/登录、OpenAPI 调用均为 0。本轮没有真实 Base、真实资源、真实数据、截图、LLM 调用、上线、推送或部署。

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
- `feishu/rounds/T2-R6-DAY7-EDGE-SYNC-deviation-check.md`

未写入、格式化、回退或整理 `.codex/PROJECT_UPDATE.md`、`src/**`、`tests/**`、`data/**`、`services/**`、`app/**`、Excel、计划、规格、依赖、发布文件、Git 或其他任务的共享修改；未执行 checkpoint 或 handoff。

## 风险、外部前置与定级

- 本轮只完成 `solution_design` 级离线合同同步，不能证明赛事飞书权限、真实 Base 配置、自动化运行或现场验收已经完成。
- P01—P13 仍需参赛者确认赛事允许后由本人登录；OAuth 必须由本人授权，需要管理员的 scope、应用、自动化或 Base 权限必须取得管理员批准。未取得现场证据前，任何项均不得改写为已获得或已通过。
- Day-7 边界的原实现缺口已在 T3 冻结代码中修复，本轮仅同步其飞书离线映射；`P0=0，P1=0，P2=0`（只针对本轮冻结候选和离线合同范围）。
- 下一步只能由主控决定是否接纳本轮离线冻结；现场阶段仍须从 P01—P13 权限验收开始，并使用空资源映射副本逐项留证。

偏航结论：**已纠正**
