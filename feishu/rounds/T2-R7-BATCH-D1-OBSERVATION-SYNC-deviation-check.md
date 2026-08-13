# T2-R7｜Batch D1 观察动作飞书离线合同同步偏航检查

日期：2026-08-03  
任务线：T2 飞书离线落地  
事实类别：`solution_design`  
现场状态：未登录、未调用 OpenAPI、未配置或运行真实飞书  
结论：`未偏离`

## 本轮范围与冻结来源

本轮只把 T3 已冻结的 `enter_observation / record_day_7 / record_day_30` 映射进现有单 Base、六工作流离线合同。这三个动作均为 W6 内部动作，不新增第七工作流；`archive_observation / reopen_recurrence` 不在 Batch D1 动作面内。已提交的 recurrence-reopen history 仅可作为检查点只读来源，不代表本轮实现或执行了 reopen。

权威冻结输入：

- `src/neoloop/records/2026-08-03-t3-r7-batch-d1-observation-checkpoints.md`：`105455035fea536757bdc52e199ff8ca6eb631e623626ab1e6e5e0760aa71acd`
- `src/neoloop/workflows/w6-improvement.ts`：`fcf3393c67ea1539e98545179898e04a3f48c392011afaae81d339a141a73b07`
- `tests/core/w6-improvement.test.mjs`：`314055ff5956ed9da5a3db53456f176875e407db84077cb1e6f0f123f4055028`
- `src/neoloop/workflows/repository.ts`：`1714941412abd7965f823b873257f99f26cba84210cf87c457bd0ec5c5b7428b`
- `src/neoloop/workflows/model.ts`：`622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753`
- `src/neoloop/workflows/index.ts`：`c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3`
- `tests/core/w6-repository.test.mjs`：`be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb`

## 已完成同步

### 主合同

- logical manifest 升级到 `0.1.5`，新增 Batch D1 冻结源与 `W6.observation_phase_contract`。
- build package 升级到 `0.1.4`，镜像三个动作的 step binding、action-scoped write contract、授权/锁边界、审计、错误停点与回退。
- `enter_observation` 在 `observation` 阶段等待人工授权；等待期间资源锁与业务写入均为零，批准后才在完整 case/cluster/improvement 锁内重验可信时钟、执行 CAS 与原子提交。
- `record_day_7 / record_day_30` 是互相独立且与 enter 分离的确定性事务；调用面无 actor，不调用 AI 或人工授权器。
- cycle、clock、occurred_at、history、receipt、checkpoint ID 的生成权属于可信系统端口与仓储状态。runtime cycle/history/receipt/current-cycle 引用没有被新增为 Base canonical 字段。
- 检查点只读取同周期已提交 active-intake history 与已提交 recurrence-reopen cycle facts；排除候选、仅授权、仅 receipt、拒绝、回退、未提交和其他周期来源。
- Day-30 必须有同周期 Day-7，并累计包含 Day-7 来源；分母为 `null` 时保留复发数且复发率为 `null`。
- `audit_pending` 只允许修复同一审计；同 event 同 payload 返回缓存业务结果，不重新生成 ID、授权、调用 AI 或提交业务；不同 payload 失败关闭为 `event_conflict`。

### 派生包

- Day-1 probe、smoke、evidence、import 均升级到 `0.1.3`。
- P05/P06、SMK-01 与 W6 evidence unit 已覆盖三个 D1 动作及失败关闭证据。
- recurrence intake 的独立序列精确止于 N5 candidate → repository receipt → human authorization → full-lock atomic intake 四步；Day-7/30 不再混入该序列。
- import DAG、probe/smoke/evidence/result 数量均未增加；result template 未修改。

## 版本与真实级联 SHA-256

| 文件 | 版本 | SHA-256 |
| --- | --- | --- |
| `feishu/manifests/neoloop-logical-manifest.v0.1.json` | `0.1.5` | `96d224d0fc35b10e31fd9e2b705167458b1f1c39c869375b8858bd38e8b22b63` |
| `feishu/manifests/on-site-build-package.v0.1.json` | `0.1.4` | `93a74996edc2c310f7f078da37bbca596102536386bb77b9a091656a4645456c` |
| `feishu/manifests/day-1-probe-suite.v0.1.json` | `0.1.3` | `c2d27a9e92d60601acb69eb8fb0667525b9bfd8a9b01394efad20ef82f76b941` |
| `feishu/manifests/on-site-smoke-plan.v0.1.json` | `0.1.3` | `b91836067a994983e6007fc82fac524cad87419cdd44a39b546a5639b6541985` |
| `feishu/evidence/on-site-evidence-template.json` | `0.1.3` | `84643fb0e88a17ba375c10c4251d07ca3c6d4ffec084425bc9676d167cd72c11` |
| `feishu/manifests/base-import-batch-plan.v0.1.json` | `0.1.3` | `87041aa2a3a0e98233014ce03f2a8234d103dd381fd95d516607afb0ff13c3f4` |
| `feishu/scripts/validate-contract-alignment.mjs` | — | `b9088187ab3b9b37165fbe52d21e166f1b576458f43d69855769ff17b7250020` |
| `feishu/scripts/validate-offline-package.mjs` | — | `16539a32b12cd6aa9b711488386fdfeadee35f61cb0d1de8e575c19d6eddfab5` |
| `feishu/scripts/validate-day-1-probe-package.mjs` | — | `3bbe19329e2bca4b244d111b661952cfb75993859d9f6e3d33aa227acdf735e3` |

级联核对：build pin 上述 logical SHA；probe 与 import pin 上述 logical/build SHA；smoke 按既有结构 pin logical SHA。所有值均在最终内容落盘后重新计算，没有预造。

## 最终验证

按顺序执行：

1. `node feishu/scripts/validate-contract-alignment.mjs`：自身 `109/109`，失败 `0`，上游冲突 `0`。
2. `node feishu/scripts/validate-offline-package.mjs`：自身 `94/94`，累计 `203/203`，失败 `0`。
3. `node feishu/scripts/validate-day-1-probe-package.mjs`：自身 `85/85`，累计 `288/288`，失败 `0`。
4. `npm run lint`：退出码 `0`，`0 error / 0 warning`。

新增断言均校验实际对象、引用、顺序、集合、空状态或哈希，没有以恒真/空断言维持旧基数。

## 数量、状态与事实边界

- Base 表 `10`、业务视图 `5`、逻辑角色 `3`、AI 节点 `7`、workflow `6`。
- probes `13`，全部 `not_tested`，result/evidence 全部 `null`。
- smoke `5`；result units `36`；现场 evidence units `41`，全部未测试。
- R3 execution records `70`，全部 `not_tested`，对应 evidence `70` 个空值。
- resource fields `48`，全部 `null`。
- `feishu/evidence/day-1-probe-results.example.json` 未修改，SHA 保持 `9fe3eb073190afcc9535d1578dd7833cfbdf5fa2393297f2bf96e9580faf1c45`。
- `feishu/config/resource-mapping.example.json` 未修改，SHA 保持 `a72545aa5820d54025b294bb5e96ad31d243b4eb35e648921149f18e2ea9fdb9`。
- 真实飞书操作 `0`、lark-cli 安装/登录 `0`、OpenAPI 调用 `0`；没有 OAuth、真实资源 ID、真实数据、上线或接入声明。

## 文件所有权与偏航

本轮实际修改严格限于获批的六个 JSON、三个 validator 和本记录：

- `feishu/manifests/neoloop-logical-manifest.v0.1.json`
- `feishu/manifests/on-site-build-package.v0.1.json`
- `feishu/manifests/day-1-probe-suite.v0.1.json`
- `feishu/manifests/on-site-smoke-plan.v0.1.json`
- `feishu/evidence/on-site-evidence-template.json`
- `feishu/manifests/base-import-batch-plan.v0.1.json`
- `feishu/scripts/validate-contract-alignment.mjs`
- `feishu/scripts/validate-offline-package.mjs`
- `feishu/scripts/validate-day-1-probe-package.mjs`
- `feishu/rounds/T2-R7-BATCH-D1-OBSERVATION-SYNC-deviation-check.md`

越界文件：无。本轮没有修改 `day-1-probe-results.example.json`、`src/**`、`tests/core/**`、`data/**`、`app/**`、`package*`、计划/规格或 `.codex`，没有整理、回退或覆盖共享工作树中的其他修改。

## P0 / P1 / P2 与下一轮前置

- P0：`0`
- P1：`0`
- P2：`0`

离线合同候选已经完成并可冻结，但这不等于现场验收或飞书上线。P01—P13 仍须在赛事允许后，由参赛者本人登录，并在需要时完成 OAuth 或管理员审批，再按 Day-1 包采集真实、脱敏证据。收到主控新指令前不进入 Batch E。

偏航结论：`未偏离`
