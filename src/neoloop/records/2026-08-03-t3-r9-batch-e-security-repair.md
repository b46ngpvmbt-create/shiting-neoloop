# T3-R9｜Batch E 语义重放安全收口

日期：2026-08-03
任务线：T3 工程内核
对应主线：W6 跨事件聚类、改进与复发观察
结论：`已纠正`

## 1. 收口结论

R8 的本地实现虽曾自评 `P0=0、P1=0、P2=0`，但独立终验随后发现反枚举授权、公开结果脱敏、typed provenance、完整零写入和私有 proof 两阶段绑定仍有缺口。R9 保留 R8 记录原文和 SHA，不回写历史结论；本记录明确纠正该次假绿。

本轮最终关闭的边界为：

1. 不同 `event_id` 的 exact / near / miss 在授权前不可区分，且私有语义重放 lookup 为 0；同一 `event_id` 重放仍由事件账本缓存并保持零重复授权。
2. 授权通过后才查询仓储私有提交举证：exact 返回最小语义幂等结果，near 返回安全 `event_conflict`，miss 进入正常 W5 provenance、时序、成员、CAS 和原子提交路径。
3. 成功语义重放的 public output 与 workflow audit 都使用 exact own-key allowlist；旧 history/cycle/receipt、principal、policy、grant、W5 provenance、私有指纹和拒绝 sentinel 不进入公开结果或审计。
4. `findW6RecurrenceReplayCandidate` 返回的私有 proof 指纹被带入 `resolveAuthorizedW6RecurrenceReplay`；resolve 在授权能力消费后重新计算当前 receipt/history/cycle proof 并精确比较，关闭 find→resolve 替换窗口。
5. W5 provenance、并发和时序错误由 `W6TransitionFailure` 的闭集类型分类；普通 `Error` 即使使用相同文案仍是 `repository_failure`，typed W5 错误即使更换文案仍是 `w5_closure_provenance_failure`。不存在 message、regex 或 `constructor.name` 分类。
6. 错 event、command、target、case、cluster、improvement、已消费复用、旧 cycle proof 和跨两个合法 cluster/improvement 的 capability 组合全部失败关闭。

没有改变一个 Base、10 张表、5 个视图、3 类逻辑角色、7 个 AI 节点、6 条工作流、固定状态枚举、N5/N6 模式、AI envelope 或四类事实边界。

## 2. RED → GREEN 证据

### 第一组 RED

测试先于实现增加，首次执行：

`node tests/core/run-core-tests.mjs --local-only`

结果：287 项中 284 通过、3 失败。

- actor 近似请求在授权前暴露了私有命中差异。
- semantic replay 返回了过量 receipt/cycle/history 与授权信息。
- typed W5 provenance 仍被非类型化路径误分为 `repository_failure`。

完成反枚举、最小 artifact 和 typed error 修复，并补齐合法 miss、capability、跨合法簇隔离测试后，local 曾达到 290/290。

### 冻结前新增硬门 RED

T1 只读预审要求单独验证 find→resolve 私有 proof 替换。增加测试后再次执行同一 local 命令：

- 291 项中 290 通过、1 失败。
- 失败测试：`W6 Batch E authorized miss creates a new recurrence while an old semantic replay resolves its exact private cycle`。
- 修复前，将第二周期 proof 替换到第一周期请求后，公共路径仍错误返回 `idempotent`。

最小修复是在仓储 resolve 输入中加入只在工作流与仓储间传递的 `private_proof_fingerprint`，并在完整资源锁、活动事件和已消费授权上下文内，与当前私有 receipt/history/cycle proof 精确比较。修复后 local 为 291/291。

## 3. Public-path 安全测试映射

以下测试均通过公共 `runW6Improvement`；direct repository 用例只保留为补充证据，不代替高层验收。

- `W6 Batch E denied exact near and miss requests are indistinguishable before private replay lookup`
  - exact、actor、reason、case union、trigger miss 在拒绝授权时返回深度等价的公开失败 envelope。
  - authorizer 每个新事件调用一次；授权时和返回后 private lookup 都为 0。
  - 授权失败后的 same-event replay 不再授权、不 lookup、不重复 workflow audit。
- `W6 Batch E public late recurrence replay reauthorizes before lookup and returns one redacted artifact`
  - 第一轮 reopen→Day-7→Day-30→二次归档后，不同事件 exact replay 必须重新授权。
  - public result、audit record、audit payload、nested result、external effects 和 existing artifact 分别做 exact own-key allowlist。
  - 所有已提交 history/cycle/receipt ID、principal、policy、authorization target fingerprint 和 denial sentinel 均做递归禁止值断言。
  - same-event replay 为零授权、零新审计、零业务 ID。
- `W6 Batch E authorized miss creates a new recurrence while an old semantic replay resolves its exact private cycle`
  - 真实构造“第一轮复发完成→Day-7→Day-30→再次归档→新增 repository-issued W5 closure 触发案→第二次正常 reopen”。
  - 合法 miss 明确新增一个 cycle、一个 history 和一个 receipt；随后同 event replay 不授权、不再新增任何业务记录或 ID。
  - 两周期再次归档后，旧稳定语义仍精确解析到旧 cycle；把新 cycle 私有 proof 替换到旧语义 find→resolve 间时返回 `concurrency_conflict`，完整 durable snapshot 不变。
- `W6 Batch E public semantic replay rejects forged and consumed request capabilities without writes`
  - 分别覆盖错 event、command fingerprint、target fingerprint、case、cluster、improvement、伪造 target 和已消费 capability 复用。
  - 每项均为 `authorization_capability_invalid`，且 case、feedback、work order、W5、索引、W6 history/cycle/checkpoint/receipt 与 ID 计数不变。
- `W6 Batch E public replay keeps two valid cluster and improvement histories isolated`
  - 构造两个各自合法、可归档并可复发的 cluster/improvement，证明 exact replay 不跨对象返回结果。
  - 将第二个合法资源组合签发的 capability 投向第一个命令时失败关闭；错误 cluster/improvement 组合不能命中其他历史。
- `W6 Batch E reopen rejects unsorted or duplicate case and trigger arrays before every public port`
  - `case_ids` 换序、`case_ids` 重复、`triggering_case_ids` 换序、`triggering_case_ids` 重复四例均为 `invalid_command`。
  - event ledger/repository、authorizer、clock、ID 和 audit 端口属性读取总数为 0。
- `W6 Batch E public provenance classification uses typed errors and never message text`
  - 普通 `Error` 使用与 typed W5 相同文案，仍分类为 `repository_failure`。
  - `W6TransitionFailure("w5_closure_provenance_failure", ...)` 使用完全不同文案，仍分类为 `w5_closure_provenance_failure`。
  - typed `invalid_state` 使用相同中性文案仍保持 `invalid_state`。
- 三个确定性 authorizer barrier：
  - `W6 Batch E public reopen reports a cross-cluster authorization-wait race as concurrency_conflict`
  - `W6 Batch E public reopen reports W5 provenance invalidated during authorization wait`
  - `W6 Batch E public reopen reports valid replacement provenance with stale chronology as invalid_state`
  - 外部竞态提交后、释放 authorizer 前取得完整高层 durable baseline；目标 W6 失败后相对该 baseline 零额外业务写入。事件结果和 workflow audit 是该新请求的预期记录，不冒充数据库事务回滚。

## 4. 最终验证

- local：`node tests/core/run-core-tests.mjs --local-only`，291/291。
- cross：`node tests/core/run-core-tests.mjs --cross-only`，4/4。
- full：`node tests/core/run-core-tests.mjs`，295/295。
- scoped strict TypeScript：`rg --files src/neoloop services/openapi-ingest -g '*.ts' | xargs npx tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext`，退出码 0，0 error。
- typed-classification 禁用模式扫描：message/regex/`constructor.name` 相关模式零命中。
- scoped ESLint：`npx eslint src/neoloop/workflows/w6-improvement.ts src/neoloop/workflows/repository.ts tests/core/w6-improvement.test.mjs`，退出码 0，0 error，0 warning。
- full lint：`npm run lint`，退出码 0，0 error，0 warning。

## 5. 文件、SHA-256 与所有权

R8 冻结基线：

- `src/neoloop/workflows/w6-improvement.ts`：`c2ce2fe40b1d06435e8ac98ea5ddcd11fb7194ad4f44b18f803f1abae384bf0d`
- `src/neoloop/workflows/repository.ts`：`cf18f93dc4f7e41c0fb59d038ce0d5f978bcca9d6f4a900e52bfb64dd1206cb7`
- `tests/core/w6-improvement.test.mjs`：`c1d4bb9b167c83c1293696aa9fb604d8c6a31acffa47ea115352cb0aa18d2d8b`
- `src/neoloop/records/2026-08-03-t3-r8-batch-e-p1-repair.md`：`71e67dd004604e5d3948f8815831f1a33c799ff46d7a6d90cece8553a0f8a476`

R9 最终候选（记录文件自身 SHA 在正式交接中给出）：

- `src/neoloop/workflows/w6-improvement.ts`：`22990e48fadbdfa8c97b7e3deac72fd5e403d9636753f4b2d64974c5a1a16485`
- `src/neoloop/workflows/repository.ts`：`789968005ac9c8c96c3773bcbdeb44d48741b8cfcb5f20f9dc91b5557b568e34`
- `tests/core/w6-improvement.test.mjs`：`4c31ebdf59be57d66c58fccb999cabaaef34988f5819eda49e81e9dd796bc0ed`

明确未变的边界文件：

- R8 记录：`71e67dd004604e5d3948f8815831f1a33c799ff46d7a6d90cece8553a0f8a476`
- `model.ts`：`622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753`
- `index.ts`：`c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3`
- `w6-repository.test.mjs`：`be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb`
- 主计划：`6d926c4991c8d1156b3456d33b57c717f08ce882ce8a625b5af94710a4e9145f`
- A+ 规格：`e4448de64569c1f449470a6c8cbeaf32cc7660cc94023667ee8532034d95abd1`

本轮实际修改/新增仅为：

- `src/neoloop/workflows/w6-improvement.ts`
- `src/neoloop/workflows/repository.ts`
- `tests/core/w6-improvement.test.mjs`
- `src/neoloop/records/2026-08-03-t3-r9-batch-e-security-repair.md`

工作树中其余 `feishu/**`、`data/**`、`app/**`、package、README、计划/规格及其他脏文件均属于并行或既有修改，本轮没有整理、覆盖或回退。越界文件：0。

## 6. 事实边界、限制与偏航检查

- 证据只来自 `synthetic_experiment`、test clock、in-memory repository、fake authorizer 和本地 Node 测试。
- 未连接真实飞书、OpenAPI、LLM、新石器数据、企业 IAM 或车辆控制；未读取凭证，未推送、未部署。
- 本地资源锁、事件账本和 opaque capability 只证明单进程内存适配语义，不等于生产数据库的跨进程事务或 exactly-once。生产适配仍需等价唯一约束、CAS/事务、私有 receipt 存储和审计修复协议。
- 归档不确认最终根因、不发布知识；复发重开不并案、不改连 feedback、不改变 case/work order/SLA。
- Batch C 的 `improvement_batch_c`、D1 的 `observation_batch_d`、Batch E 的 `observation_batch_e` 及既有 `W6-BATCH-C-WORKFLOW-AUDIT-*` 兼容键未改变。
- Lunar OS bridge 按总控命令未重试；未删除、覆盖或改写 `.codex/PROJECT_UPDATE.md`，不声称同步成功。

P0=0、P1=0、P2=0。
偏航结论：`已纠正`
