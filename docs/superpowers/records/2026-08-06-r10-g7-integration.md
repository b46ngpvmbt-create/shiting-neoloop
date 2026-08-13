# R10 G7 主控集成记录

日期：2026-08-06
范围：飞书九文件同步、F1 权限结果合同纠偏、三层 validator 收口
结论：`已纠正`。第五候选通过主控复验，G7 离线包可以冻结；未执行 Git 提交、推送或飞书现场操作。

## 1. 本轮裁决

- T1、T2、T3 对第五候选的结论均为 P0=0、P1=0、P2=0。三条任务只读复核，写入文件数均为 0。
- 主控随后独立执行语法检查、Contract、Offline、Day1 和局部 ESLint。结果全部通过，起止 SHA 一致。
- 当前链路为 `R9 -> R10 core/test/record -> logical -> build -> derivatives`。下游只引用上游，没有回指或环。
- G7 的结果是离线合同和合成测试通过。它不代表真实飞书写入、跨表原子性、失败恢复、CAS 或 exactly-once 已被现场证明。

## 2. 主控复验结果

| 检查 | 结果 |
| --- | --- |
| 三个 validator 的 `node --check` | 3 项 exit 0 |
| Contract | 2597/2597，failed=0，upstream_conflicts=0 |
| Contract permission fixtures | 60/60 |
| Offline | 自身 143/143，累计 2740/2740 |
| Offline 负控 | 125/125 |
| Day1 | 自身 121/121，累计 2861/2861 |
| Day1 负控 | 74/74 |
| Day1 `contract_mutations` | 30/30，候选 30、摘要 30、唯一摘要 30 |
| 三个 validator 的局部 ESLint | 0 error，0 warning |

30 个 `contract_mutations` 由 6 个独立变异输入、1 个包含六份真实变异 bundle 的聚合输入和 23 个 permission candidate 构成。摘要只读取 `structuredClone(mutatedInput)`，不把名称、通过状态、issue 或运行结果混入摘要。74 项总门仍检查名称闭集、名称唯一、类别计数和真实拒绝，不把这 74 项写成已经做了同一种内容摘要。

## 3. 基数和空态

- P01 至 P13 共 13 项，全部为 `not_tested`，`result=null`，`evidence=null`。
- R10 子检查共 5 项，全部为 `not_tested`，实际结果槽位 0。
- P06、P07 均依赖 P02 和 P05；P05 未完成时不能启动两项后续探针。
- P03 保留 prebuild 和 postbuild 两阶段。postbuild 不能先于已完成的 prebuild，prebuild 时间也不能晚于 postbuild。
- 固定基数为 13 个探针、5 个 smoke unit、41 个 evidence unit、36 个 result unit、70 条未执行记录、48 个空资源字段。
- Base 仍为 10 张表；import plan 为 13 个 execution unit；7 个 AI 节点和 6 条工作流没有增减。
- `execution_mode=insufficient`，自动投影未启用。
- validator 执行的真实飞书操作、lark-cli 安装或登录、OpenAPI 调用、Base 写入尝试均为 0。

## 4. 冻结哈希

### 4.1 规划和 validator

| 文件 | SHA-256 |
| --- | --- |
| R10 实施计划 | `d70eec85c65ea86a64947e55d799c57c5c28bbcc9e60507ae6102172889f15cf` |
| Contract validator | `0e5bc1dfeee9a9218758ac64660a14770aefef2a625eb2fa58a27c582f62fc6f` |
| Offline validator | `fd22e89ebd0da98108f08da3a3bc4f34c755464c3b540971c15992e061329c14` |
| Day1 validator | `e944bb5df3a78aa00f58bb3eec22bbf77f9e928569891cfc1ae2bf48b193cb85` |

### 4.2 G7 内容和配套合同

| 文件 | SHA-256 |
| --- | --- |
| logical manifest | `c4e9790c724723864869365bebfc98a3d72baceb5e643386df5b1685a43d8f60` |
| build package | `8fe61f8f6fff7c3608bcb2a7cfc57011fc0fa21b9b9b2db9e28c2bcd38690e58` |
| probe suite | `54f22d4b90621a536ac143f2f742f0d0b5171c09d9944ec7133430a0a39d6c40` |
| import plan | `4741cef79b6bb62ec3083d7bda7a93148030c0a173a6f99513abe6b68bceb7cc` |
| smoke plan | `06d202f8e6462ac5bab565fc143dc30af820fe9ec87e0a152aef8af624ef4f3c` |
| onsite evidence template | `a8fa777c2ffcb06a52d5ab7ef99e778d7376f3a521fc962f80b06f9ea033944f` |
| permission result template | `2c6e3deef0126e5b937cd835b95d8588ff6e92d69c30bd0ffa0b8baa579ffa8b` |
| permission acceptance | `1111f50764ed46fcc764cd566e4703544436989f561168fe335fb716dc94178d` |
| permission matrix | `a9fd7b33447dce0395d1bc03ab43e2cc345a610b48eaf0dd90142e5748ce9688` |

### 4.3 R9 和 R10 保护文件

| 文件 | SHA-256 |
| --- | --- |
| R9 `w6-improvement.ts` | `22990e48fadbdfa8c97b7e3deac72fd5e403d9636753f4b2d64974c5a1a16485` |
| R9 `repository.ts` | `789968005ac9c8c96c3773bcbdeb44d48741b8cfcb5f20f9dc91b5557b568e34` |
| R9 `w6-improvement.test.mjs` | `4c31ebdf59be57d66c58fccb999cabaaef34988f5819eda49e81e9dd796bc0ed` |
| R9 `model.ts` | `622e65f2d4ee3b9fc0757a914fc57401c4b1f0cde264747c638a06c7408cc753` |
| R9 `index.ts` | `c111b505a23ff807a616311567c7c3b1f66da8d2a4eb88f2e5e30b76fb2e4cd3` |
| R9 `w6-repository.test.mjs` | `be8210c323c5a95a13824ba476c5ba31896f676fb626a0a7f73fb74d6132b0fb` |
| R10 core | `47a429d650e663d008b25dd023f7fc2ed71286bf92708de1252db7fa302b7ffd` |
| R10 test | `13e38abf203fc13695ff2e0dda81193088187cc22dfb3c0f3f53bd8452a726dd` |
| R10 round record | `81634c132c7206f9230a1000d8f808b8c49b77654ffd4cda5ec28c798acf4f10` |

### 4.4 冻结摘要

- Contract permission fixture 名称摘要：`30f5bd415be81c83bb05f364e414f721dc569dcced476a45f1d94d1740d44d1a`
- Offline 125 项负控名称摘要：`c7ef7d7686397238bed49672078f198085ed56784b3b9a1037999728c4f591c9`
- Day1 74 项负控名称摘要：`f44a969337d09e5c592172bec062e6dc4f4a140e59c53a7d0b73bd0dcc614517`
- 权限结果合同 5 源摘要：`c0c471b5e780e72b31a718bd3cc43096942918ae0f567ca6d44b03bcfbd91712`
- 权限内容 6 源摘要：`9bd8a75fc245784be6221ff0f5abf4409a6325086a16a14a1217cbc4c79afc1c`
- Day1 A/B/C 29 源摘要：`bdfcfa202ec6fbb907d90de04ced9f2ac98710e7fe94d198e2879c7cbc8a2e41`

## 5. 此前的假绿和修正

早期候选虽然脚本退出码为 0，静态复核仍发现了四类问题：

1. P03 的反例先制造场景、再叠加 mutation，却在场景建立前检查 baseline。多个错误混在一起时，顺序守卫可能没有被真正验证。
2. strict-input fatal 一度没有独立的版本化 exact schema，缺字段、多字段和等基数改名无法形成完整的闭集证明。
3. Offline 对受信 report 的嵌套结构检查不全，`permission_result_contract`、versions、counts、fixtures、sources 以及 c12/c13 tradeoff 层存在缺口。
4. 第四候选登记了 30 个 `contract_mutations`，内容摘要只覆盖后 23 个 permission candidate。

第五候选逐项关闭这些问题。P03 现在使用 setup、baseline=0、clone、single mutation、目标 issue 的顺序；fatal root 和 nested schema 都做 exact 校验；Offline 覆盖 15 个受信嵌套层及 45 个 missing、extra、等基数改名变异；Day1 将 30 个真实变异输入全部纳入统一摘要门。

因此，本轮没有用退出码替代静态审查。此前候选的绿灯不计入最终冻结证据。

## 6. 四类证据口径

- 公开事实：只记录能够由公开来源或冻结公开材料支持的内容。本轮没有新增企业事实。
- 待企业验证：飞书租户权限、无特权访问、OpenAPI scope、CLI 可用性、跨表原子能力、durable outbox、CAS、lease 和现场故障恢复都在此类。当前状态仍是未测试。
- 方案设计：一个 Base、10 张表、5 个视图、3 个逻辑业务角色、7 个 AI 节点、6 条工作流，以及 R10 projector、写白名单、人工停点和回退路径属于设计合同。
- 合成实验：三层 validator、负控、fixture、合成数据和本地测试结果属于此类。它们可以证明离线合同自洽，不能外推新石器的真实业务效果。

## 7. 边界和下一步

- 没有登录赛事飞书，没有创建真实 Base，没有调用 OpenAPI，也没有安装或登录 lark-cli。
- 没有接入新石器真实数据，没有执行车辆控制，也没有自动判责、赔偿、承诺恢复时间或确认最终根因。
- 没有证明真实平台支持 `atomic_all_targets` 或 `sealed_outbox_cas`。在 F1 得到证据前，R10 自动写入保持关闭。
- 下一步是 F0 身份与权限盘点，以及 F1 的 P01 至 P13 最小现场探针。先使用可清理的临时 Base；正式 10 表不能提前批量创建。
- R10 不是项目最终完成门。当前不启动三次九轮协议，也不把它当作隐含完成条件。

偏航结论：`已纠正`。
