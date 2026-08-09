# 石听 NeoLoop P04｜离线就绪证据与现场证明合同实施子计划

日期：2026-08-09
状态：参赛者已批准 P04 书面规格；本实施子计划待参赛者复核，批准前不得编码或操作飞书
上位主线：`2026-08-04-shiting-neoloop-r10-implementation-plan.md`
规格基线：`../specs/2026-08-08-shiting-neoloop-p04-offline-readiness-and-live-proof-design.md`
规格 SHA-256：`baa626ba23220ef0e69565932cd655a0a977c240358bdef6ae15bf654a0b1305`
团队：石听未来
产品：石听 NeoLoop

> 让每条反馈都找到一辆车、一个任务、一个责任人和一次改进。

## 0. 本计划的地位与结论

本文件是 R10 唯一主线下的 P04 实施子计划，不替代、不分叉、不改写 R10。它只把已批准的 P04 规格拆成可执行波次、文件所有权、RED→GREEN 门、冻结顺序和回滚点。

参赛者于 2026-08-09 回复“继续”，批准 P04 书面规格；该批准只允许编写本计划，不等于批准实施。本计划经参赛者再次明确批准后，才允许进入 G0。

规格页眉仍保留提交 `d4cdd49` 时“待参赛者复核”的历史元数据。为保留已完成的全文复核 SHA，本轮不做只改状态行的重写；本计划及其提交是 2026-08-09 用户批准决定的后续权威记录。该批准是 G0 外部过程门并进入 Lunar/实施记录，不增加规格未定义的 cryptographic manifest/root 字段；release closure 仍只按已批准规格的 exact schema 工作。

本轮目标分为两层，严禁混写：

1. **仓库内 candidate**：实现并验证 P04 合同、错误脱敏、合成 readiness harness、当前空态 live validator 和冻结链候选；全程零飞书、零 OpenAPI、零业务写。
2. **外部签名 passed**：只有工作区外 trusted launcher、外部签名根、一次性 verifier challenge 和重放缓存全部另行交付并验签成功后，才允许写“P04 本地合成安全准备已通过”。

仓库内 candidate 即使全部测试通过，也不等于赛事飞书 P04 完成。真实 P04 继续受 P02+P03 双门约束；当前 P03 为 `blocked/null`，因此现场 P04 必须保持 `not_tested/null`。

## 1. 已确认执行基线

### 1.1 当前 live 状态

实施期间必须持续满足：

| 探针 | 当前规范状态 | 本计划允许变化 |
| --- | --- | --- |
| P01 | `blocked/null` | 不允许 |
| P02 | `completed/受限` | 不允许 |
| P03 parent/prebuild | `blocked/null` | 不允许 |
| P03 postbuild | `not_tested/null` | 不允许 |
| P04 | `not_tested/null` | 仅增加 typed proof/ref 的空态字段；状态、结果和运行事实不变 |
| P05—P10 | `not_tested/null` | 不允许 |
| P11 | `completed/受限` | 不允许 |
| P12 | `blocked/null` | 不允许 |
| P13 | auth gate 已机器验证；parent `blocked/null` | 不允许 |

以下内容在所有波次中固定为 0：

- 飞书 UI 写操作；
- lark-cli auth 或 OpenAPI 调用；
- live AI run；
- live Base schema、记录、权限或自动化写入；
- 企业数据读取；
- 车辆控制、事故责任、赔偿、恢复时间或最终根因裁决。

### 1.2 实施前测试基线

G0 必须串行复跑并得到不低于以下真实结果：

| 门 | 2026-08-09 基线 |
| --- | --- |
| core local | `984/984` |
| core cross | `4/4` |
| Contract | `2759/2759`，permission `234`，negative `220` |
| Offline | 累计 `2902`，negative `125/125` |
| Day-1 | 累计 `3029`，本层 `127`，negative `228/228` |
| live P01 | passed；completion derived=false |
| live P02 | `73` assertions；`completed/受限` |
| live P03 partial | passed；completion=false；formal build=false |
| live P12/P13 | passed；P12 blocked；P13 completion=false；业务写 0 |

任何基线失败都先判断是否来自共享脏工作树或并行改动。不得为了“恢复绿色”修改任务范围外文件，也不得降低断言。

### 1.3 实施前冻结对象

G0 重新计算完整 SHA-256，并将实际值写入首轮实施记录；至少冻结：

- 本规格与本计划；
- `src/neoloop/ai/runner.ts`；
- `src/neoloop/ai/scripted-fake.ts`；
- `src/neoloop/contracts/ports.ts`；
- `tests/core/ai-runner.test.mjs`；
- `src/neoloop/workflows/repository.ts`；
- `src/neoloop/workflows/w6-improvement.ts`；
- P04 probe/result/template、两份 live JSON、acceptance、matrix；
- Contract、Offline、Day-1 validator；
- 根 `package.json` 与 `package-lock.json`。

`repository.ts` 和 `w6-improvement.ts` 是只读保护对象。若实现需要修改其中任一文件，立即停止，回到规格评审；不得绕过 private guard。

## 2. 完成口径与禁止口径

### 2.1 仓库内 candidate 完成

只有同时满足以下条件，才可写“P04 本地合成 readiness candidate 已完成工程验证”：

1. G0—G7 全部通过；
2. 所有新生产入口均来自冻结 source closure，fixture、compiler、runtime、receipt、report 和 validator digest 可独立复算；
3. provider 原始错误、账号、URL、token、App/Base/Table/View/Record/Field 标识均未进入 stdout、fixture、报告、快照或 live evidence；
4. candidate harness 只运行 `synthetic_experiment`，网络、OpenAPI、飞书、业务写、真实 executor 均为 0；
5. 当前 live P04 仍是 `not_tested/null + bundle absent`；
6. Contract→Offline→Day-1→live P04 冻结链全绿；
7. 三位独立智能体复核均为 P0=0、P1=0、P2=0。

### 2.2 外部签名 passed 完成

在 candidate 完成之外，还必须同时具备：

- 工作区外 trusted launcher executable；
- 外部私钥与 trust config；
- launcher public key pin；
- verifier 发放并原子消费的一次性 challenge；
- launcher control、每次 spawn、runtime freeze、stage0 terminal、outer attestation 的完整签名材料；
- 独立 verifier 对唯一 stdout attestation 的复算、验签与重放拒绝；
- 临时 snapshot/runtime tree 已清理，清理失败不能输出 passed。

这些是新权限和工作区外交付，不由本计划自动推断。缺任一项时只停在 candidate。

### 2.3 永远不能由本计划推出

- “P04 已通过”；
- “赛事飞书 AI 已接入或已运行”；
- “七个 AI 节点已创建或启用”；
- “已接入新石器真实数据”；
- “本地测试证明企业准确率、效率、成本、收入或 ROI”；
- “N5/Day7 本地夹具就是现场证据”；
- “P03 已解除阻塞”或“可以进入 P05”。

## 3. 智能体职责与互斥所有权

不复用用户已有的子会话。本计划实施时只使用本任务内智能体，并以角色名标识：

### Agent-A｜工程与隔离运行时

独占：

```text
src/neoloop/ai/provider-error.ts
src/neoloop/ai/runner.ts
src/neoloop/ai/scripted-fake.ts
src/neoloop/contracts/ports.ts
src/neoloop/evidence/p04-readiness.ts
src/neoloop/evidence/p04-instrumented-w6-fixture-repository.ts
feishu/scripts/lib/p04-stage0-broker.mjs
feishu/scripts/lib/p04-stage1-harness.mjs
feishu/scripts/lib/p04-scenario-worker.mjs
feishu/scripts/lib/p04-runtime-bootstrap.mjs
feishu/scripts/lib/p04-compiler-runner.mjs
feishu/scripts/lib/p04-redacted-io.mjs
feishu/scripts/report-p04-readiness.mjs
feishu/runtime/p04/package.json
tsconfig.p04-readiness.json
tests/core/ai-runner.test.mjs
tests/core/p04-readiness-report.test.mjs
```

不得修改 W6 repository/private guard，不得接真实 provider。

### Agent-B｜飞书合同与 live 证明链

独占：

```text
feishu/scripts/lib/p04-contract.mjs
feishu/manifests/day-1-probe-suite.v0.1.json
feishu/evidence/day-1-probe-results.example.json
feishu/evidence/on-site-evidence-template.json
feishu/evidence/live/2026-08-07-day-1-probe-results.redacted.json
feishu/evidence/live/2026-08-07-on-site-evidence.redacted.json
feishu/evidence/p04-live-evidence-bundle-schema.example.json
feishu/evidence/live/p04-live-evidence-bundle/bundle-manifest.json
feishu/runbooks/day-1-permission-acceptance.md
feishu/runbooks/day-1-permission-matrix.md
feishu/runbooks/p04-external-launcher-contract.md
feishu/scripts/validate-live-p04-evidence.mjs
tests/core/live-p04-evidence.test.mjs
```

只允许把当前 P04 同步为 typed 空态；不得填现场事实、不得改状态。

### Agent-C｜冻结、对抗验证与发布审计

独占：

```text
feishu/fixtures/p04/scenarios/**
feishu/fixtures/p04/hardening/**
feishu/fixtures/p04/live-validator/**
feishu/attestations/p04-release-manifest.v1.json
feishu/scripts/validate-contract-alignment.mjs.FREEZE_ATTESTATION.json
feishu/scripts/validate-offline-package.mjs.FREEZE_ATTESTATION.json
feishu/scripts/validate-day-1-probe-package.mjs.FREEZE_ATTESTATION.json
feishu/scripts/validate-live-p04-evidence.mjs.FREEZE_ATTESTATION.json
feishu/scripts/validate-contract-alignment.mjs
feishu/scripts/validate-offline-package.mjs
feishu/scripts/validate-day-1-probe-package.mjs
```

Agent-C 只能在 A/B 上游内容冻结后写 SHA、sidecar 和 deterministic release manifest candidate，并负责验收/精确 staging 外部材料；不得用占位 SHA 先行制造绿色。`p04-release-root.v1.json` 与 `.sig` 的原始字节只归 F0 external approver 所有，Agent-C 和总控都不得自签。

### 总控

总控负责：

- Lunar OS bridge；
- 波次裁决、文件互斥、共享脏工作树保护；
- 只在上游冻结后计算 SHA；
- 运行全量串行门；
- 精确 staging 和提交；
- 现场操作始终关闭；
- 每波结束组织三线 P0/P1/P2 复核。

任何智能体都不得回退或覆盖他人的并行修改；发现重叠立即停并通知总控。

## 4. 执行波次总览

| 波次 | 目标 | 主要产物 | 现场状态 |
| --- | --- | --- | --- |
| G0 | 保护门与基线 | 哈希、状态投影、测试基线 | 不变 |
| G1 | 合同权威与 RED 夹具 | P04 contract、probe/result/template/live 空态、fixture schema | P04 仍 not_tested/null |
| G2 | provider 错误与 scope 硬化 | trusted error、scripted fake、deny ports | 不变 |
| G3 | 纯合成 readiness 语义 | 七场景、W6 instrumented adapter、exact report core | 不变 |
| G4 | 隔离运行时与 candidate harness | compiler/bootstrap/stage0/stage1/worker/receipts | 不变 |
| G5 | live P04 validator | 当前空态正例、未来 blocked/completed 对抗矩阵 | 不变 |
| G6 | 最终冻结链 | 三层 validator、sidecars、release candidate | 不变 |
| G7 | 全量验收与提交 | 真实计数、最终 SHA、三线 0/0/0 | 不变 |
| F0 | 外部 launcher/signature | 工作区外交付与 passed attestation | 不变；需新授权 |
| F1 | 未来现场 P04 | 仅 P03 完成且另批后执行 | 本计划不执行 |

每个 G 波次都必须：先 RED、再最小实现、再 GREEN、再回归、再冻结；一个波次未全绿不得进入下一波。

内容落盘/冻结顺序固定为：

```text
probe → result example → on-site template
→ bundle schema / absent bundle → live null migration
→ acceptance / matrix → p04-contract → canonical fixtures
→ provider-error + ports
→ W6 public-interface adapter
→ pure readiness semantics
→ compiler / bootstrap / stage1 / stage0 / worker
→ live P04 validator
→ Contract → Offline → Day-1 → live-P04 sidecars
→ release manifest candidate
→ external root / detached signature
```

运行时/import DAG 则以 `p04-contract` 为 schema/enum/digest 唯一 authority，fixtures、stage、IO、validators 只能导入或投影它，不得复制常量。`ports.ts`、`repository.ts`、`runner.ts` 不得反向导入 `evidence/**`；任何反向边或跨波次环都必须在实现前停止。

## 5. G0｜实施前保护门

### G0.1 Bridge 与工作树

1. 运行 Lunar OS bridge `prepare`；完整读取新 `.codex/PROJECT_CONTEXT.md`。
2. 保存 `git status --short`、当前 HEAD、分支和任务文件哈希。
3. 将所有任务外 modified/untracked 文件列为用户保护对象，不暂存、不格式化、不清理。
4. 确认本计划已获参赛者明确批准；否则停止。
5. 当前 `src/**`、`tests/core/**`、`feishu/**` 中有大量既有实现尚未纳入 Git，而 P04 将修改其中部分文件。实施前必须先由参赛者单独批准，将 P04 的前置依赖形成一笔只含既有字节的受审 baseline commit；未批准或无法精确区分所有权时，G0 终止，不能直接把“历史实现 + P04 改动”混进首个功能提交。

baseline commit 只负责建立可回滚起点，不得顺带修复、格式化或重写文件。提交前必须由另一位智能体核对 staged manifest、逐文件 SHA 与当前验证结果，并明确排除无关 tracked 修改。

baseline manifest 是 canonical JSON array，每项 exact 为：

```text
path
status = tracked_modified | untracked
sha256
owner
included_reason
```

manifest 放在 `mktemp -d` 创建的工作区外 0700 临时目录，只作用户审查材料，不进入 baseline commit。按 path 排序、拒绝重复/未知键，并计算 domain-separated manifest SHA。只有 manifest 中经参赛者逐项批准的路径可以进入 baseline commit。

比较时先把 Git index 投影为 `{path,status,sha256}`：`M→tracked_modified`、`A→untracked`，SHA 对 staged blob bytes 计算；再与 manifest 同名三字段投影 exact deep-equal。`owner/included_reason` 只参与审批和 manifest digest，不参与 index 投影。baseline commit message/实施记录保存 manifest digest，不保存临时路径或整份清单。baseline commit 是保护性祖先，后续功能回滚永远不 revert 它。

### G0.2 状态与哈希断言

用只读脚本冻结 1.1 和 1.3 的状态/哈希，并断言：

- P04 `execution_status=not_tested`、`result=null`；
- P04 runtime 字段为空；
- P03 parent/prebuild 仍 blocked；
- P04 live evidence bundle 为 absent 或尚不存在；
- W6 repository 与 improvement 文件等于实施前 SHA。

### G0.3 双 Node 运行时门

根项目发布基线仍是 Node `22.13.0`，P04 专属隔离运行时最低是 Node `22.15.0`；本机当前 Node `26.5.0` 只可作为受支持上界回归，不能替代两个最低版本门。

进入 G1 前必须解析并冻结三个绝对二进制路径及其配套 npm：

```text
NODE_ROOT_22_13=/absolute/pinned/node-22.13.0/bin/node
NODE_P04_22_15=/absolute/pinned/node-22.15.0/bin/node
NODE_CURRENT_26_5=/absolute/pinned/node-26.5.0/bin/node
NPM_ROOT_22_13=/absolute/pinned/node-22.13.0/bin/npm
NPM_CURRENT_26_5=/absolute/pinned/node-26.5.0/bin/npm
```

若本机缺少对应二进制，先停止并取得参赛者对运行时供应方式的授权；不得让 ambient `node`、`npx` 或 `/usr/bin/env node` 静默落到 Node 26 后冒充最低版本验证。

先分别执行 `--version` 并 exact 断言 `v22.13.0`、`v22.15.0`、`v26.5.0`；npm 版本、二进制 realpath、普通文件身份与 SHA 也写入 G0 运行时 manifest。后文每条 `"$NODE_*" ...` 是以下 exact 启动模板的简写：

```bash
env -i PATH="<selected-node-bin>:/usr/bin:/bin" TMPDIR="$P04_PRIVATE_TMP" LANG=C LC_ALL=C "<absolute-node>" <fixed-argv>
```

`P04_PRIVATE_TMP` 必须是本轮 `mktemp -d` 创建并验证的 0700 目录。该模板不继承原 `$PATH`，也不会携带 `NODE_OPTIONS`、`NODE_PATH`、proxy 或 credential override 变量；需要网络的命令不属于本计划。npm 命令使用同一 `env -i` 模板和对应绝对 npm 路径。

`run-core-tests.mjs` 会自动发现所有 `*.test.mjs`，本计划不扩大范围修改该 runner。两个 P04 测试必须在 Node 22.13 下只验证确定性的 `unsupported_runtime` 拒绝路径，完整 P04 正例/攻击矩阵只由显式 Node 22.15 定向命令运行；两套结果分栏报告，绝不把 22.13 拒绝测试写成 readiness 通过。

### G0.4 基线命令

```bash
"$NODE_ROOT_22_13" tests/core/run-core-tests.mjs --local-only
"$NODE_ROOT_22_13" tests/core/run-core-tests.mjs --cross-only
"$NODE_ROOT_22_13" feishu/scripts/validate-contract-alignment.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-offline-package.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-day-1-probe-package.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p01-evidence.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p02-evidence.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p03-event-trace.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p03-partial-blocked-evidence.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p13-evidence.mjs
"$NODE_CURRENT_26_5" tests/core/run-core-tests.mjs
```

执行前使用上一节的 allowlist PATH，确保 core runner 内部调用 `node_modules/.bin/tsc` 时不会经 `/usr/bin/env node` 落到其他版本。网站 `check:release` 会写构建产物，因此不在只读 G0 运行；它只在 G7 的一次性隔离 snapshot 中执行。

退出条件：全部 exit 0，真实计数已记录。任一失败都不进入 G0.5。

G0.1—G0.4 不修改项目文件；失败时只报告，不修复范围外问题。

### G0.5 W6 公开入口可行性 RED spike

这是进入 G1 前的硬门。只用 `R3WorkflowRepository` 公共接口验证四个 W6/N5 fixture 能否完成 synthetic seed 与目标调用；禁止访问 concrete repository Maps、private guard 或测试专用后门。

允许暂时建立：

```text
tests/core/p04-readiness-report.test.mjs
src/neoloop/evidence/p04-instrumented-w6-fixture-repository.ts
```

RED 必须明确证明当前缺口；最小 spike 通过后保留测试和 adapter 骨架进入 G3。若公共接口不足，立即删除/回滚 spike 生产骨架、保留脱敏失败结论并回到规格复核，不实施合同之外的 repository 修改。

G0.5 是唯一允许产生项目字节的 G0 子步骤；必须在 baseline commit 和本计划审批均已完成后才执行。

spike 中的 repository-only 子测试不受 Node 22.13 的 runtime-positive skip；它不得加载 G4 隔离运行时。RED/GREEN 都必须显式运行：

```bash
"$NODE_ROOT_22_13" tests/core/run-core-tests.mjs --local-only
"$NODE_P04_22_15" tests/core/run-core-tests.mjs --local-only
```

## 6. G1｜合同权威、空态迁移与 RED 夹具

G1 先建立可读、可构造、可 fail-closed 的合同，但不生成最终 release root。规格所称“合同纠偏”的 sidecar/release root 最终化推迟到 G6，因为它们必须单向绑定 G2—G5 的最终字节。

### G1.1 probe、模板、bundle 与两份 live

按顺序修改：

1. `day-1-probe-suite.v0.1.json`：P04 depends_on 改为 P02+P03，minimum action 收窄。
2. result example：增加 exact P04 proof-ref 空态。
3. on-site template：增加 exact P04 proof 空态。
4. bundle schema example 和 live absent manifest。
5. 两份 live redacted JSON：只增加与模板 deep-equal 的 null/absent 结构与纠偏说明。
6. acceptance/matrix：同步双依赖、状态真值表、停止门和候选/现场边界。

absent manifest 的 exact 空态固定为：

```text
schema_version=p04_live_evidence_bundle.v1
bundle_stage=absent
pre_action_snapshots=[]
capture_challenge=null
pre_action_capture_receipts=[]
pre_action_terminal_receipt_digest=null
pre_action_receipt=null
evidence_objects=[]
post_action_capture_receipts=[]
terminal_capture_receipt_digest=null
release_root_manifest_sha256=null
bundle_manifest_sha256=<domain-separated canonical self-excluding digest>
```

目录在 absent 状态只允许这一份 manifest，不得预建 evidence object、截图、二维码或其他 member。

四载体绑定：

- result example：`actual_p04_proof_ref=null`；
- on-site template：`actual_p04_proof=null`；
- live results：`actual_p04_proof_ref=null`；
- live on-site：`actual_p04_proof=null`；
- bundle：独立 exact absent manifest，只承载 evidence object 生命周期，不是第五套状态真值；
- 两份 live 是现场唯一真值投影，proof/ref 与 bundle absent 必须按规格 exact 绑定；
- 不得通过模板绿色推导 live 已完成。

schema declaration、live-results ref、live-onsite proof 与 absent manifest 是同一 null migration 原子组；同一波内前滚、同一提交落盘，任一验证失败四项全部回滚，其他 probe 状态不动。

### G1.2 `p04-contract.mjs`

只有 G1.1 全部最终落盘后才实现 authority。先写 RED 测试，冻结：

- P04 depends_on 精确为 `P02,P03`；
- live minimum action 只含 N1 valid、prompt injection、schema first fail/one repair/second fail routing、quota/trace/cleanup；
- N5/Day7/N5→N6 只属于本地 readiness，不属于 live P04 minimum action；
- proof/ref、partial、attempt、evidence tuple、bundle、receipt、runtime manifest、report 和 issue code 的 exact schema；
- 所有 domain-separated digest preimage 与 canonical serializer；
- role/path/FD/capability policy 常量；
- safe count、safe byte length、safe link count 各自独立；
- inner passed 与 outer final passed 的唯一谓词；
- current absent bundle 的唯一合法对象。

禁止生产模块导出测试 hook、任意 callback、网络/飞书入口或自由文本 serializer。

### G1.3 canonical fixture 文件

为三类 manifest 中每个 fixture ID 新建精确一份 canonical JSON：

- `scenarios/**`：七个 readiness 场景；
- `hardening/**`：provider、安全端口、scope、runtime 攻击；
- `live-validator/**`：空态、partial、blocked、available、restricted、unavailable 和 mutation。

要求：

- raw bytes 等于 canonical JSON；
- 目录成员与 manifest exact deep-equal；
- regular file、非 symlink、`st_nlink===1`；
- 仅合成数据；
- 无 URL、账号、token、资源标识或 provider raw。

### G1.4 RED 验收

G1 RED 至少证明以下当前错误：

- P04 只依赖 P02；
- N5/Day7 被错误纳入 live P04；
- proof/ref 缺失或可自由文本伪造；
- live P04 可文字式 completed；
- bundle 未绑定；
- 未知键、重复键、错序 issue code、孤立 nullable group 可误过。

合同/live RED 固定写入 `tests/core/live-p04-evidence.test.mjs`；provider RED 写入 `tests/core/ai-runner.test.mjs`；readiness RED 写入 `tests/core/p04-readiness-report.test.mjs`。所有测试统一通过 `run-core-tests.mjs --local-only` 编译并注入 `NEOLOOP_T3_BUILD_ROOT`，禁止直接用 `node --test` 绕过共享 runtime：

```bash
"$NODE_ROOT_22_13" tests/core/run-core-tests.mjs --local-only
"$NODE_P04_22_15" tests/core/run-core-tests.mjs --local-only
```

G1 GREEN 后更新三层 validator 的合同逻辑和当时真实 upstream pins，使 Contract/Offline/Day-1 均 exit 0；不存在“pending 也算成功”的状态。G1 的绿色只验证合同纠偏和当前空态，不产生 sidecar/release，也不冻结尚未存在的 G2—G5 source。G2—G5 任一上游字节变化都会让这些 interim pins 作废，并在 G6 重新计算最终 pins。进入 G2 前，三层当前内容必须真实全绿，且 live P04 仍空态。

回滚：恢复 G1 owned 文件到波次前副本；不得回滚其他 live 探针。

## 7. G2｜provider 错误与 synthetic scope 硬化

### G2.1 RED

在 `ai-runner.test.mjs` 和 hardening fixtures 中先覆盖：

- 任意 `Error.message`、stack、cause、对象 `toString`、getter、symbol、循环结构、代理对象不得被读取或回显；
- 只有内部闭集 trusted provider error 可映射到固定 issue code；
- untrusted thrown value 统一为固定脱敏错误；
- scripted fake 不能注入 raw provider 文本；
- live/OpenAPI/HTTP/fs-write/child/worker/vehicle-control ports 全部 deny；
- `synthetic_experiment` 之外 scope fail-closed。

### G2.2 实现

1. 新增内部 `provider-error.ts`，不从公共 AI barrel 暴露可伪造构造器。
2. 修改 runner：删除读取原始 `error.message` 的路径；只接受受控错误品牌/闭集枚举。
3. 修改 scripted fake：用受控 outcome/code 表达故障，不携带自由文本 provider error。
4. 在 `ports.ts` 增加 P04 readiness 专用窄接口与 deny-port 计数，不扩大正式业务 port。

### G2.3 GREEN 与保护门

- 定向测试全绿；
- 全 core local/cross 全绿；
- runner 对既有可用、schema retry、terminal failure 语义不回归；
- `repository.ts`、`w6-improvement.ts`、公开材料哈希不变；
- 敏感哨兵在 stdout/stderr/snapshot/report 均 0 命中。

回滚：只回滚 Agent-A 的 G2 文件；G1 合同不回退。

## 8. G3｜纯合成 readiness 语义与 instrumented adapter

### G3.1 七个场景

按规格固定并逐一 RED→GREEN：

1. N1 valid structured envelope；
2. prompt injection 被隔离；
3. schema 第一次失败、唯一一次 repair 成功；
4. schema 第二次失败转人工且 downstream=false；
5. N5 receipt 边界；
6. Day7 两个边界场景；
7. N5→N6 receipt 复用拒绝。

前三类供未来 live P04 contract；后四类只证明本地 W6/N5 安全边界。

### G3.2 W6 adapter

`P04InstrumentedW6FixtureRepository` 只能：

- 每个 worker 新建私有内存 repository；
- 按 signed seed plan、在 measured window 前调用既有公开 API；
- 逐操作记录 ordinal、operation ID、input digest、真实 outcome/state-transition digest；
- 在 measured window 内只运行目标入口并记录 parent-owned counters；
- 对任何正式 persistence port、外部 executor、OpenAPI、业务写计数保持 0。

若公开 API 无法构造场景，停止并回到规格；不得修改 private guard。

依赖方向必须保持：`contracts/ports.ts → adapter/readiness`，绝不允许 `contracts/ports.ts` 反向导入 `evidence/**`；adapter 直接导入 `workflows/repository.ts` 的公开接口，不通过聚合 barrel 扩大 source closure。

### G3.3 exact report core

`p04-readiness.ts` 只生成纯对象，不写文件、不读 live、不调用网络。它必须：

- 绑定 fixture/source/compiler/runtime/receipt 摘要；
- 分离场景观察和执行证明；
- `validation_status=passed` 当且仅当 issue_codes 为空且规格第 7.5 节唯一 passed 谓词（含外部 launcher/root/challenge）全部成立；
- current local candidate 不派生 P04 live truth；
- report serializer 拒绝调用方覆盖安全字段。

仓库内 candidate 是“实现和测试成熟度”，不是 report schema 的第三种状态。定向测试可以在私有临时根中用明确标注的 synthetic signer/launcher fixtures 调用同一生产 harness/serializer，证明 exact passed/failure 分支；这些测试对象不落入正式 attestation 路径、不能交付或冒充外部信任。

### G3.4 验收

至少覆盖：0 次/重复 target call、伪 target return、错误 seed operation、同数量不同操作、receipt 重放、fixture 替换、hardlink/symlink/大小写别名、未知 outcome、额外业务写、自由文本污染。

回滚：删除本波新增 readiness/adapter 和场景实现，不动 G1 live 空态、不动 W6 内核。

## 9. G4｜隔离运行时与 candidate harness

G4 是高风险波次，必须拆成 G4.1—G4.6，严格串行。

### G4.1 captured source/compiler snapshot

- 一次性 descriptor-safe 读取冻结 source、fixture、compiler、types、package metadata；
- 复制到私有 snapshot 后只编译 snapshot bytes；
- P04 专属 `runtime/p04/package.json` 固定 Node `>=22.15.0`，不改根 Node `>=22.13.0`；
- 三段 compiler receipt：hook 后 module loads、受控 resolution metadata reads、CompilerHost semantic reads；
- union 等于 compiler manifest 删除 bootstrap entry 后的精确投影；
- emitted JS、runtime package boundary、最近祖先拓扑可复算。

新增 TypeScript 必须同时通过根 `tsconfig.json` 的既有 ES2017/bundler 检查和 P04 专属 NodeNext/ES2022 检查；专属 tsconfig 不能被用来掩盖根编译回归。若两套合同不可兼容，先停并修订规格，不得顺手修改根 tsconfig。

三个编译门分别是根 tsconfig、core runner 自带 NodeNext/ES2022 编译、P04 专属 tsconfig；任何一项都不能替代另一项。

### G4.2 launcher/stage0 两阶段 spawn 合同

仓库内只实现合同和 candidate broker；真实 launcher 在 F0。

为使 candidate harness 在 F0 前可真实运行，测试必须使用一个仅存在于 test harness/私有临时根的 untrusted launcher driver 与 ephemeral test key。它执行与外部 launcher 完全相同的 prepare/commit/FD/receipt 协议，但：

- 不进入 release manifest、正式 trust config、live evidence 或交付物；
- signer purpose 固定为 synthetic_test_launcher；
- 运行结果只可用于测试 `candidate-ready engineering/tests green`；
- 测试结束销毁私钥和临时根；
- 任何生产入口、环境变量或 CLI 都不能选择该 driver。

该 driver 由 `tests/core/p04-readiness-report.test.mjs` 在 0700 临时根中生成并校验，测试结束删除；不新增仓库内 production launcher 文件，也不进入 captured production source manifest。

每次 spawn 固定：

- prepare request；
- launcher-signed prepared receipt；
- invocation digest；
- commit request；
- launcher-signed commit receipt；
- child bootstrap barrier；
- parent prefix nonce/alias 查重；
- exact sanitized env、FD role map、stdio policy、execArgv、path-role identities。

control receipt 只绑定 stage0。compiler/stage1/worker 各有独立 per-spawn receipt，禁止预先把未来 runtime identity 塞入 control receipt。

### G4.3 权限与 path-role

冻结四角色 exact profile：stage0、compiler、stage1、worker。

- stage0 无任意 child-process 能力；所有 OS spawn 都经 F0 工作区外 launcher broker，或仅在测试中经 G4.2 untrusted ephemeral driver；
- stage0 bookkeeping root 与 launcher/compiler-owned runtime root 分离；
- runtime tree 编译后由 launcher freeze，stage0 始终只读；
- stage1/worker 除 runtime tree 外，只读各自 captured harness tree；
- bootstrap-only builtins 是 `node:crypto,node:fs,node:module`；hook 后按 role 的 runtime allowlist 精确裁决，只拒绝差集并禁止 raw namespace 泄漏；
- Node 22.15 无原生 network permission，因此网络拒绝只由 builtin deny、global sentinels、真实子进程负例证明，不写成 Node permission 已证明；
- FD 生命周期用 `direct_child_only + closed_after_bootstrap`，不伪称 JS 可证明 CLOEXEC。

### G4.4 runtime freeze 与逐成员身份

launcher-signed runtime metadata receipt 必须绑定：

- runtime root identity；
- ordered member manifest；
- 每成员 kind、exact relative path、content SHA、safe byte length、mode class、descriptor identity、`nlink=1`；
- package boundary/outDir topology；
- compiler commit receipt；
- session/nonce；
- runtime freeze digest/signature。

每个 worker invocation 再绑定同一 freeze digest；dispatch 前逐成员复核，任一 inode/mode/content/hardlink/symlink/case drift 都 fail-closed。

### G4.5 authenticated target/seed 与 parent counters

- target wrapper 是唯一递增 target-call ledger 的主体；
- wrapper exit 直接传规范化真实 return/error code 和 result SHA；
- stage0 只从 authenticated exit 生成 actual object，不接受 worker 自报摘要；
- seed operation 同样逐项绑定真实 outcome/state-transition digest；
- target/seed ledger 有 exact event schema、domain、previous digest、empty-chain constant、final digest；
- worker completion 绑定 raw dispatch nonce、invocation、actual object；
- 任何 target count ≠1、seed plan 漂移或 capability proof 不匹配都失败。

### G4.6 candidate 测试与 stdout 边界

仓库内 direct report CLI 永远只能输出 fixed failure，不接 control FD、不生成 final passed，也不存在 `validation_status=candidate`。

candidate 只通过测试直接调用同一生产 harness/serializer API，并走受控 stage0→stage1→worker 链；测试输出不得交付。所有可观察输出必须：

- 只含固定 allowlist keys、布尔、计数、闭集 issue codes 和 digest；
- 不含路径、目录 basename、原始 ID、错误文本或临时对象；
- 临时 snapshot/runtime 清理成功后才允许测试断言内存中的 inner report；
- direct CLI 或清理失败只能输出固定 failure envelope。

### G4.7 RED/GREEN 攻击矩阵

至少逐项覆盖：source/compiler/type/package 漂移、PATH/NODE_OPTIONS/proxy 污染、timeout/超限/非 UTF-8、parent/final inode replacement、root/ancestor symlink、case alias、hardlink、extra FD、wrong stdio、wrong role/path、prepare 未 commit、双 commit、session/nonce 重放、child alias 重复、runtime tree 重命名以外漂移、ambient fetch/WebSocket/dns/dgram/http/http2/net/tls/fs-write/child/worker/module/vm/addon/WASI 绕过。

G4 GREEN 当轮必须执行三套编译门，不能等到 G7 才发现漂移：

```bash
"$NODE_ROOT_22_13" node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false
"$NODE_P04_22_15" node_modules/typescript/bin/tsc -p tsconfig.p04-readiness.json --noEmit --incremental false
"$NODE_P04_22_15" tests/core/run-core-tests.mjs --local-only
```

退出条件：candidate harness 真实 GREEN，但 `external_launcher_verified=false`、`final_passed=false`；不得伪造外部签名正例。

回滚：删除私有 temp；恢复 G4 owned 文件；若 temp 清理失败，报告明确路径类别而不回显路径，并停止后续波次。

## 10. G5｜live P04 validator

### G5.1 当前空态正例

生产 CLI 固定读取两份 live redacted JSON 和固定 absent bundle；拒绝 CLI 路径参数。当前唯一合法输出必须证明：

- P04 not_tested/null；
- proof/ref exact 空态；
- bundle absent；
- P02/P03 双门未满足；
- P04 completion false；
- observation truth machine-verified=false；
- AI/OpenAPI/business write 计数均不可外推。

### G5.2 future partial/blocked/completed fixtures

validator 只在 fixture 测试中覆盖未来状态：

- safe partial attempted；
- invalid-capture partial；
- blocked；
- completed available/restricted/unavailable；
- artifact unavailable/cleanup/fallback 各真值分支；
- actual-content、signature、receipt、mutation ledger、evidence tuple、source class、phase/time/sequence、proof/ref/bundle 四向绑定。

fixture 通过不改变 live 状态。

### G5.3 安全读取与报告

沿用已验证的 trusted-root 读取模式：filesystem root→trusted root→target 逐组件 exact-case/lstat，拒绝 symlink、root escape、prefix collision；open/read 后复核全链 identity。strict UTF-8、重复键、长度、敏感模式、未知键全部 fail-closed。serializer 永不回显输入。

### G5.4 RED/GREEN

逐字段删除、类型变化、未知键、孤立 nullable group、tuple 交换、digest 重算伪造、旧 batch replay、challenge 重放、native attempt 置换、audit window 拼接、fallback 跨 artifact 拼接、同 signer 双角色、business mutation 后恢复、live state drift、P03/P04 前移等均须负例。

完成后固定 live CLI 仍 passed，但只证明空态一致，不证明 P04 完成。

## 11. G6｜validator 冻结链与 release candidate

### G6.1 内容冻结顺序

只有 G1—G5 全部内容稳定后，按以下单向顺序计算：

1. canonical fixture raw SHA；
2. source/contract/runtime/test manifest 与 bundle SHA；
3. Contract validator 内容与 SHA；
4. Offline validator 更新 Contract pin 后的 SHA；
5. Day-1 validator 更新 Offline/Contract pin 后的 SHA；
6. live P04 validator SHA；
7. 四份 FREEZE_ATTESTATION sidecar；
8. release manifest；
9. 仅在 F0 已授权并具备外部 approver 时生成 release root；
10. 仅在同一 F0 分支生成 detached signature。

任何下游都只能 pin 上游，禁止双向 hash、自引用、占位 SHA 或跨域摘要强行相等。

第 7 步内部仍严格串行：Contract sidecar → Offline sidecar → Day-1 sidecar → live-P04 sidecar。四个 validator bytes/SHA 必须先按第 3—6 步全部冻结，之后才生成任何 sidecar。

### G6.2 candidate 分支

外部 signer 尚未交付时：

- sidecars 与 release manifest 可生成 deterministic candidate；
- `p04-release-root.v1.json` 与 `.sig` 是外部批准分支的保留路径，默认不创建；不得生成 placeholder、自签 root、空签名或把未受信任数学签名落为正式文件；
- 实施记录可以写 `candidate ready / external attestation not produced`，但生产 report 不增加 `candidate` 枚举；direct CLI 仍输出 fixed failure；
- 三层 validator 可验证合同与 current live 空态，但不得报告 final passed。

### G6.3 passed 分支

只有 F0 权限另批且外部材料到位后才允许：

- external approver 生成 detached signature；
- launcher 读取固定 public key pin；
- verifier 发挑战并原子消费；
- outer attestation 内嵌完整 release manifest/root/signature/snapshot/control/stage0 receipts；
- external verifier 独立复算、验签并拒绝原样重放。

G6 本轮默认执行 candidate 分支。

### G6.4 三层 validator

依次真实运行 Contract→Offline→Day-1；每层记录自身 checks、累计 checks、negative count、name digest、source digest 和上游 pin equality。不得修改断言计数来迎合输出，必须由真实 fixtures 推导。

级联重冻规则：

- spec/probe/result/template/bundle-schema/acceptance/matrix/p04-contract 变化：先重算 Contract validator bytes/SHA，再重算 Offline 与 Day-1 validator bytes/SHA，随后废弃并重生四个 sidecar 与所有后续 manifest/root/signature；
- Contract validator SHA 变化：重算 Offline、Day-1 validator bytes/SHA，再重生四个 sidecar与所有后续对象；
- Offline validator SHA 变化：重算 Day-1 validator bytes/SHA，再重生 Offline、Day-1、live-P04 sidecar 与所有后续对象；
- Day-1 validator SHA 变化：重生 Day-1、live-P04 sidecar 与所有后续对象；
- live authority/schema/validator 变化：废弃 live-P04 sidecar 与所有后续对象；
- 若内容变化但最终 Contract validator bytes/SHA 未变，只从 Contract sidecar 开始级联，不伪造 validator 字节变化；
- 已外部签发的 release 不做原地回滚，必须撤销/过期旧 release 并签发新 manifest/root/signature；旧 challenge、receipt 和 signature 不复用。

回滚只处理 G6 owned pins/sidecars/manifest，不回滚已验证 G1—G5 内容。

## 12. G7｜全量验收、独立复核与提交

### G7.1 串行验证矩阵

至少运行：

```bash
"$NODE_ROOT_22_13" tests/core/run-core-tests.mjs --local-only
"$NODE_ROOT_22_13" tests/core/run-core-tests.mjs --cross-only
"$NODE_ROOT_22_13" tests/core/run-core-tests.mjs
"$NODE_ROOT_22_13" node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false
"$NODE_ROOT_22_13" feishu/scripts/validate-contract-alignment.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-offline-package.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-day-1-probe-package.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p01-evidence.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p02-evidence.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p03-event-trace.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p03-partial-blocked-evidence.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p04-evidence.mjs
"$NODE_ROOT_22_13" feishu/scripts/validate-live-p13-evidence.mjs
"$NODE_P04_22_15" node_modules/typescript/bin/tsc -p tsconfig.p04-readiness.json --noEmit --incremental false
"$NODE_P04_22_15" tests/core/run-core-tests.mjs --local-only
"$NODE_P04_22_15" feishu/scripts/validate-contract-alignment.mjs
"$NODE_P04_22_15" feishu/scripts/validate-offline-package.mjs
"$NODE_P04_22_15" feishu/scripts/validate-day-1-probe-package.mjs
"$NODE_P04_22_15" feishu/scripts/validate-live-p04-evidence.mjs
"$NODE_CURRENT_26_5" tests/core/run-core-tests.mjs
```

`validate-live-p13-evidence.mjs` 是当前 P12/P13 联合门；本计划不虚构独立 P12 命令。`report-p04-readiness.mjs` 的 direct CLI 必须作为固定 failure 负例，不能列为 candidate 或 external passed 正例。

direct CLI 独立负向门必须覆盖：无参数、额外 argv、伪造 control FD、伪造 env、测试 launcher env、未知 cwd。每种均要求 exit 1、stderr 空、stdout 恰好一行 canonical `p04_readiness_failure.v1`、`validation_status=failed`、非空闭集 issue codes、`report_artifact_written=false`，且无 candidate/passed/path/provider/sensitive 哨兵。

并运行：

- 所有新增/修改 `.mjs` 的 `node --check`；
- scoped ESLint；
- JSON 全解析与 duplicate-key validator；
- `git diff --check`；
- tracked/untracked 新文件的 no-index whitespace check；
- debug/placeholder/sensitive pattern 扫描；
- `repository.ts`、`w6-improvement.ts`、两份 live 非 P04 投影哈希不变断言；
- 私有临时测试中构造的 inner report 二次独立运行 byte-identical，且从未写入正式 attestation 路径；
- 输出目录仅允许规定文件，mode/identity/symlink/hardlink符合合同。

上述机械门不能只留为人工 prose。G7 开始时在工作区外临时目录生成 `p04_gate_manifest.v1`，根 exact keys 为：

```text
schema_version
node_check_paths
eslint_paths
json_paths
no_index_new_paths
sensitive_scan_paths
protected_sha256
```

数组均为排序、唯一、仓库相对普通文件路径；protected map 按 key 排序。未知键、重复路径、目录、symlink、任务外路径均失败。`tests/core/p04-readiness-report.test.mjs` 必须包含并真实执行以下具名子门：

```text
gate_manifest_exact_shape
all_mjs_node_check_exit_0
scoped_eslint_exit_0
strict_json_and_duplicate_key_all_pass
no_index_whitespace_has_no_diagnostics
sensitive_scan_zero_matches
protected_hashes_exact
```

每个子门使用 `execFile`/descriptor-safe bytes 和固定参数，记录 expected/observed exit、文件数和结果 digest；不得通过 shell 拼接路径。Node 22.15 的 `run-core-tests.mjs --local-only` 是这些门的唯一执行入口，任一子门未执行或计数与 manifest 不等即失败。

网站 `check:release` 只对已提交 candidate HEAD 执行：用 `mktemp -d` 创建 0700 根，在其子目录 `git worktree add --detach` 到该明确 commit；将已冻结的 `node_modules` 以 APFS CoW clone（不支持时完整复制）放入临时 worktree，禁止 symlink/共享可写依赖树。先核对依赖 manifest，再在临时 worktree 内分别用 Node 22.13 和 Node 26.5 运行 `npm run check:release`。运行后核对原工作区依赖树未变，再 `git worktree remove` 并删除该明确临时根；共享工作树的 `.next`、`dist`、`netlify-dist`、`.wrangler` 前后哈希必须不变。

根 Node 22.13 的全套 validator 门是发布兼容性基线；Node 22.15 只增加 P04 runtime/readiness 回归，不能替代根门。

### G7.2 三线独立复核

冻结最终 candidate SHA 后，三位智能体只读复核：

- Agent-A：Node/runtime/compiler/permissions/receipt/counter/capability 闭包；
- Agent-B：P04 双依赖、四载体、bundle、状态真值、live 不前移、飞书最小权限边界；
- Agent-C：digest 可构造性、攻击矩阵、freeze chain、candidate/passed 隔离、敏感/写入边界。

只有三线均 P0=0、P1=0、P2=0 且总控复核通过，candidate HEAD 才可宣称最终验收；发现问题只能新增修复提交并重新跑 G7，不改写或合并历史。

### G7.3 提交策略

共享脏工作树中，每次只精确暂存 owned 文件，并在提交前执行：

```bash
git diff --cached --name-status
git diff --cached --check
```

建议提交顺序：

1. `docs: plan P04 offline readiness implementation`（仅本计划）；
2. `chore: checkpoint pre-P04 NeoLoop baseline`（需参赛者单独批准，只含既有依赖）；
3. `feat: define P04 contract and absent live state`；
4. `fix: harden AI provider error boundary`；
5. `feat: add P04 synthetic readiness core`；
6. `feat: isolate P04 readiness runtime`；
7. `test: validate live P04 typed evidence`；
8. `chore: freeze P04 candidate attestation chain`；
9. `chore: add externally approved P04 release root`（仅 F0 完成后）。

不得 push、部署或操作飞书。每个波次在该波定向/回归门和独立复核通过后提交；G7 对这些已提交候选构成的 HEAD 做总验收。每次提交都必须能独立回滚，不允许把 live JSON 与不相关工程改动混为一个提交。

功能回滚只允许按 9→3 逆序使用非交互 `git revert`，baseline commit 永远保留；不得 reset/checkout/stash 或删除原先未跟踪的用户文件。F0 已签发时，先在工作区外撤销/过期旧 trust/root/challenge，再回滚仓库 pin。任何真实 P04 首动作发生后，live evidence 只允许前向更正，Git 回滚不得把状态改回 `not_tested`。

## 13. F0｜工作区外 trusted launcher（新授权门）

F0 不在默认实施授权内。需要参赛者明确批准并提供/确认：

- launcher executable 的交付位置与维护者；
- approver public key pin；
- 私钥保管方式；
- trust config；
- verifier challenge 与 replay cache 的持久化位置；
- 运行环境和 Node `>=22.15.0`；
- 最终 attestation 的保存/销毁政策。

F0 external approver 独占并交付以下原始字节；仓库内智能体只能验签和精确 staging：

```text
feishu/attestations/p04-release-root.v1.json
feishu/attestations/p04-release-root.v1.sig
```

launcher 必须直接启动 stage0，成为唯一 OS spawn broker；control FD 只给 stage0，report CLI 不接 trust FD。工作区内代码不能自证外部信任。

若参赛者不批准 F0，项目仍可交付 candidate，不构成阻塞或失败，但不得使用 passed 表述。

## 14. F1｜未来现场 P04（不在本计划执行范围）

只有以下条件全部满足后才能另开现场计划：

1. P03 parent 已真实 completed，且两份 live/validator/证据链同步；
2. P02 仍 completed；
3. candidate 或 external passed 工程证据已冻结；
4. 参赛者再次明确批准现场操作；
5. 飞书 AI 入口、额度、日志和临时配置回滚路径只读预检通过；
6. 使用合成数据、指定操作者、指定时间窗和零业务写保护。

未来现场 minimum action 仍只包含 N1/injection/schema repair/second-failure routing/trace/quota/cleanup。任何首动作发生即按 typed partial proof 迁移；失败不能保持 `not_tested`。完成后也不能自动进入 P05，仍需独立裁决。

## 15. 波次停止门与回滚总表

| 触发条件 | 立即动作 | 保留状态 |
| --- | --- | --- |
| 任务外文件漂移 | 停止、定位所有者 | 不回退他人修改 |
| 需要修改 W6 private guard | 停止、回规格评审 | repository 哈希不变 |
| 需要真实网络/飞书/OpenAPI | 停止 | 所有 live 状态不变 |
| provider raw/资源 ID 泄漏 | 停止、删除临时产物、修复脱敏 | 不保存 raw 证据 |
| runtime/receipt 无法复算 | 停止当前波次 | 不伪造 digest |
| external launcher/signature 缺失 | 结束在 candidate | final passed=false |
| live P04 漂移且可证明 first action=0 | 停止并原子恢复 typed null + bundle absent | 其他探针不动 |
| live P04 first action>0 或是否发生不明 | 保留真实连续前缀；安全捕获写 attempted proof/ref，invalid capture 保持 proof/ref=null；一律 `blocked/null` 并停止 | 永不回 `not_tested` |
| Contract/Offline/Day-1 任一失败 | 停止 SHA 链 | 不跳过上游 validator |
| 三线任一 P0/P1/P2 非零 | 修复并重新冻结/复审 | 不提交最终波次 |

## 16. 偏航检查

每波开始和结束都回答：

1. 是否仍以 R10 为唯一主线？
2. 是否只做 P04 离线 readiness 和未来 live proof 合同？
3. 是否把 candidate、external passed、live P04 三层分开？
4. 是否仍是合成数据、零网络、零 OpenAPI、零业务写？
5. 是否保持 P03 blocked、P04 not_tested？
6. 是否未修改 W6 private guard、正式 Base、公开报名材料或真实 executor？
7. 是否保留“石听未来”“石听 NeoLoop”和固定一句话价值？
8. 是否未外推准确率、效率、收益、企业效果？

任一答案为“否”即停止，不进入下一波。

## 17. 允许的最终交付表述

### 17.1 只有 candidate 时

> 石听 NeoLoop 已完成 P04 本地合成 readiness candidate 的工程验证：合同、错误脱敏、隔离运行时、合成场景和未来 live proof validator 已通过离线测试。外部 trusted launcher 与签名验收尚未完成；赛事飞书 P04 仍未测试。

### 17.2 外部签名 passed 后

> 石听 NeoLoop 已完成 P04 相关本地合成内核的可复验安全准备：结构化 envelope、提示注入隔离、单次修复、二次失败转人工，以及 N5/Day7 回执边界均有本地工程证据。赛事飞书 AI、额度、运行记录与现场 P04 尚未验证。

### 17.3 禁止表述

不得删去“本地”“合成”“尚未验证”，不得写成 P04/飞书 AI/企业数据/正式工作流已经上线或完成。

## 18. 本计划审批门

参赛者复核本计划后，必须再次明确批准，才能执行 G0。批准本计划不自动批准 F0 或 F1；两者各自需要新的明确授权。

项目接近最终交付时，再按工作区规则提醒参赛者是否启动“三次九轮协议”；该协议不是 P04 隐含完成门，本计划不自动启动。
