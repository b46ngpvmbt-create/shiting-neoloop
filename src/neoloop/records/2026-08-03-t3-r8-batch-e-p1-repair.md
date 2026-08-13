# T3-R8｜Batch E 跨事件重放与授权后错误分类修复

日期：2026-08-03
任务线：T3 工程内核
对应主线：W6 跨事件聚类、改进与复发观察
结论：`已纠正`

## 本轮范围

本轮只关闭 Batch E 的两个 P1：

1. 通过公共 `runW6Improvement` 重现并修正“复发重开后已完成 Day-7、Day-30 和二次归档，再用不同 `event_id` 重放原稳定语义”的路径。
2. 将授权等待后的跨簇占用、W5 结案举证失效和时序过期从笼统的 `authorization_capability_invalid` 中分离，返回可审计的结构化错误类。

没有改变 action、状态枚举、N5/N6 模式、AI envelope、W6 工作流归属或公开数据契约。`model.ts`、`index.ts` 和仓储单测文件未修改。

## RED 证据

在实现修复前，先增加 4 个 public-path 测试，执行：

`node tests/core/run-core-tests.mjs --local-only`

结果为 285 项中 281 通过、4 失败：

1. 不同 `event_id` 的同稳定语义晚重放在授权前被当作新重开，返回 `invalid_state`，无法实施新请求边界的重新授权。
2. 授权等待期间触发案被另一问题簇占用，错误被误报为 `authorization_capability_invalid`。
3. 授权等待期间 W5 结案举证失效，同样被误报为授权能力错误。
4. 授权等待期间换入合法新举证，但 `closed_at <= archive_at`，时序错误仍被误报为授权能力错误。

这一 RED 替代了早先 direct repository 路径的假绿证据。原 direct 测试标题已更正为“仓储补充证据”，不再冒充高层编排验收。

## P1-A：不同事件的可授权语义重放

### 稳定语义与私有举证

- 稳定语义包含 action、actor、排序案件并集、cluster、improvement、triggering cases 和 reason。
- 稳定语义不包含 `event_id`、`cycle_id`、`occurred_at`、`history_id` 或 `receipt_id`；这些可变的执行标识不能决定业务语义。
- 第一次合法提交时，仓储将稳定语义指纹绑定到私有 recurrence receipt 索引。重放查找会重验原 receipt、history 和 cycle，因此该指纹只是不可变提交事实的派生索引，不是第二份业务真值。
- actor、reason、案件并集、触发案、cluster 或 improvement 不同时，不会命中原结果，而是冲突或失败关闭。

### 授权与幂等

- 同一 `event_id` 重放继续由事件账本返回缓存结果；授权通过和授权拒绝两种结果都已直接断言不重复调用 authorizer、不重复审计、不生成 ID。
- 不同 `event_id` 是新请求边界；必须再次调用 authorizer。授权 target 由仓储私有原 receipt/history/cycle 构造，新 grant 同时绑定新 event fingerprint 和原提交事实。
- 授权通过后，在完整 case/cluster/improvement 资源锁内再次验证私有举证和 capability，只返回原 cycle/receipt 及当前 cluster/improvement 快照。
- 该路径不生成新 cycle/history/receipt/业务 ID，不追加域 history，不重复业务审计效果。新 event 仅保留自己的事件结果和 workflow audit。
- 授权拒绝返回通用的 `authorization_failure` 结果，不返回旧 receipt、cycle、principal、grant 或 W5 provenance。

## P1-B：授权后结构化错误

- 仓储增加 `W6TransitionFailure`，只携带闭集 `concurrency_conflict / w5_closure_provenance_failure / invalid_state`。
- 触发案已被另一簇占用，返回 `concurrency_conflict`。
- repository-issued W5 结案链失效，返回 `w5_closure_provenance_failure`。
- 新举证合法但不满足 `archive_at < closed_at <= reopen_at`，返回 `invalid_state`。
- `authorization_capability_invalid` 只由 `W6AuthorizationCapabilityError` 映射，用于 grant 不可识别/已消费、claims、binding 或消费上下文不匹配。
- 高层分类使用 `instanceof` 和闭集 `error_class`，没有依赖任意英文错误文本匹配。未分类的基础设施异常保留为 `repository_failure`。

三个授权等待竞态均由确定性 barrier 构造，并以授权等待前的目标 W6 durable snapshot 证明失败后零目标业务写入。

## GREEN 与验证

- local：`node tests/core/run-core-tests.mjs --local-only`，285/285。
- cross：`node tests/core/run-core-tests.mjs --cross-only`，4/4。
- full：`node tests/core/run-core-tests.mjs`，289/289。
- scoped strict TypeScript：`tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext`，覆盖 `src/neoloop/**/*.ts` 和 `services/openapi-ingest/**/*.ts`，退出码 0，0 error。
- scoped ESLint：`w6-improvement.ts`、`repository.ts` 和 `w6-improvement.test.mjs`，退出码 0。
- 全仓 `npm run lint`：退出码 0，0 error，0 warning。

新增的 4 项高层回归分别覆盖：不同 event 重新授权的晚重放、跨簇授权竞态、W5 provenance 失效和合法新 provenance 下的过期时序。晚重放用例另直接覆盖授权通过/拒绝后的同 event 重放、不同 actor/reason/案件并集/触发案/cluster/improvement 不得误命中。

## 兼容性与事实边界

- Batch C 继续使用 `improvement_batch_c`、`return_existing_W6_batch_c_result` 和 `do_not_repeat_N5_or_N6`。
- D1 继续使用 `observation_batch_d` 和其独立 replay 文案。Batch E 仍使用 `observation_batch_e`。
- 已有 `W6-BATCH-C-WORKFLOW-AUDIT-*` 兼容 ID 没有修改；新稳定语义指纹不改变公共事件指纹。
- 10 张表、5 组状态、3 类事实边界、7 个 AI 节点和 6 条工作流均未改变。新仓储方法只是 W6 内部幂等/授权边界，不是新工作流。
- 归档不等于最终根因确认或知识发布；复发重开不并案、不改连 feedback、不回写 case/work order/SLA。
- 所有证据都来自本地 `synthetic_experiment`、test clock、in-memory repository 和 fake authorizer。不表示真实数据库事务、跨进程 exactly-once、企业 IAM、真实飞书或真实经营效果已验证。

## 文件、SHA-256 与所有权

开始候选 SHA-256：

- `src/neoloop/workflows/w6-improvement.ts`：`fda6b55264d2007fe4785e485fb3f8297f78427e852b7e3463c93e6990ac82a5`
- `src/neoloop/workflows/repository.ts`：`1714941412abd7965f823b873257f99f26cba84210cf87c457bd0ec5c5b7428b`
- `tests/core/w6-improvement.test.mjs`：`43d21862585b431f45763d8ac72370994ddde1673c52f858e9f4a84e81e97308`

最终候选 SHA-256：

- `src/neoloop/workflows/w6-improvement.ts`：`c2ce2fe40b1d06435e8ac98ea5ddcd11fb7194ad4f44b18f803f1abae384bf0d`
- `src/neoloop/workflows/repository.ts`：`cf18f93dc4f7e41c0fb59d038ce0d5f978bcca9d6f4a900e52bfb64dd1206cb7`
- `tests/core/w6-improvement.test.mjs`：`c1d4bb9b167c83c1293696aa9fb604d8c6a31acffa47ea115352cb0aa18d2d8b`

明确未变的冻结入口：

- `src/neoloop/workflows/model.ts`：`622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753`
- `src/neoloop/workflows/index.ts`：`c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3`
- `tests/core/w6-repository.test.mjs`：`be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb`
- 主计划：`6d926c4991c8d1156b3456d33b57c717f08ce882ce8a625b5af94710a4e9145f`
- A+ 规格：`e4448de64569c1f449470a6c8cbeaf32cc7660cc94023667ee8532034d95abd1`

本轮实际修改/新增仅为：

- `src/neoloop/workflows/w6-improvement.ts`
- `src/neoloop/workflows/repository.ts`
- `tests/core/w6-improvement.test.mjs`
- `src/neoloop/records/2026-08-03-t3-r8-batch-e-p1-repair.md`

工作树中的 `feishu/**`、`data/**`、`app/**`、package、README、计划/规格和其他脏文件均为并行或既有修改，本轮没有整理、覆盖或回退。越界文件：0。

## 保留限制与终审

- in-memory 私有 receipt、事件账本和资源锁只证明单进程合成内核语义；生产持久化需要等价的数据库唯一约束、CAS/事务与可修复审计机制。
- authorizer 是确定性合成 fake，不是企业身份系统。正因如此，不同 event 重放必须重新授权，不得只根据 caller actor 命中旧结果。
- Lunar OS bridge 按主控命令未重试；既有子任务环境阻塞为 `Operation not permitted` 写 `.codex/PROJECT_MEMORY.json.tmp`。本轮未删除、覆盖或改写 `.codex/PROJECT_UPDATE.md`，不声称记忆已同步。
- 未调用真实飞书、OpenAPI、LLM、新石器或车辆控制；未读取凭证，未推送或部署。
- Batch E 本轮两个 P1 已关闭；P0=0、P1=0、P2=0。

偏航结论：`已纠正`
