# P01 匿名文档现场证据验证器设计

日期：2026-08-08
状态：方案 A 已由参赛者确认；待书面规格复核
事实类别：方案设计

## 1. 目标

新增一个只读验证器，机器检查两份 live 脱敏证据是否仍诚实表达 P01 当前状态：规定动作已经尝试，但匿名刷新、刷新后正文可读和无编辑入口三项证据未闭环，因此只能保持 `blocked / result=null`。

验证器只证明“证据文件结构、状态和脱敏绑定一致”，不证明飞书页面观察本身真实，不把历史人工确认升级为机器验证，也不把 P01 判为已完成。

## 2. 方案选择

### A．独立 P01 snapshot validator（采用）

固定读取两份 live 脱敏证据，只检查 P01 当前 blocked 快照、三方证据绑定、缺失证据和禁止外推项。

优点：P01 与 P03、P12、P13 的权限门和故障域保持分离；现场状态没有第四份真值；GitHub 技术附录可以直接展示一条独立、可重复的审计入口。

代价：P01 获得新现场证据或发生状态迁移时，验证器和测试必须同步评审，不能静默接受漂移。

### B．并入 P12/P13 live validator（不采用）

文件更少，但匿名文档访问与 CLI/OpenAPI 的身份、scope 和资源入口没有同一业务边界。合并会让报告字段和失败原因含混。

### C．继续只依赖通用 Day-1 validator（不采用）

通用 validator 能检查 `blocked/null` 的基础状态合同，却不能冻结 P01 当前混合来源、三项缺口、零截图/零运行索引和不外推规则。

## 3. 输入与真值边界

生产 CLI 固定读取：

- `feishu/evidence/live/2026-08-07-day-1-probe-results.redacted.json`
- `feishu/evidence/live/2026-08-07-on-site-evidence.redacted.json`

CLI 不接受路径、模式或状态参数。验证器不得读取浏览器会话、飞书 URL、账号、资源 ID、locator、token、二维码或 provider 原始输出。

两份 live JSON 仍是唯一现场文档真值。验证器不新增证据文件，也不改写输入。

## 4. 当前 P01 必须满足的合同

### 4.1 状态与记录

1. results 中恰有一条 `unit_id=P01`，on-site 中恰有一条 `key=P01`。
2. results 状态精确为 `execution_status=blocked`、`result=null`。
3. on-site 状态精确为 `status=已阻塞`。
4. 规定动作已经发生，因此 action、result、time、executor、account role、limitations、cleanup、verifier 均为非空且类型正确。
5. `fallback_verified=false`，on-site fallback 仍为“未测试”，不得写成已验证。
6. results 的 P01 记录必须保持 20 个 exact keys，on-site 的 P01 记录必须保持 19 个 exact keys；未知键和缺键均失败。

### 4.2 证据绑定

1. results 的 `evidence` 与 `evidence_index` canonical deep-equal。
2. 两者与 on-site 的 `structured_evidence_index` canonical deep-equal。
3. 索引恰有一项，`r10_subchecks=null`。
4. 当前证据身份固定为：
   - `evidence_id=T2-EV-P01-20260808-1903-01`
   - `observed_at=2026-08-08T19:03:33+08:00`
   - `actor_role=participant_attestation_plus_controller_browser_operator`
   - `redacted_storage_slot=controlled-slot-P01-anonymous-readonly-incomplete-01`
   - `capture_phases=[before_action,failure,after_boundary]`
   - `redaction_checked=true`
5. `screenshot_indexes=[]`、`run_indexes=[]`；不得用空索引冒充已有截图或机器运行证据。
6. 对 P01 两条记录分别做递归排序键的 canonical JSON SHA-256，冻结为：
   - results P01：`4a85ff72b26042771919ea58096730be27573f8f381cb50145075cfd296b8a6b`
   - on-site P01：`dbb4ff1254f3471c22b921e836f24fe54c5ceecc2daf7edb42841acfab7389ad`

这两个记录摘要用于阻止“两份文档一起改成另一套说法”后仍误通过；整文件输入摘要另行绑定原始输入，不把 P02—P13 的合法后续变化冻结为 P01 语义。

### 4.3 跨文档字段映射

只比较真实存在的映射，不虚构 on-site 字段：

| results | on-site | 规则 |
| --- | --- | --- |
| `actual_action` | `actual_action` | 精确相等 |
| `actual_result` | `actual_result` | 精确相等 |
| `actual_time` | `actual_time` | 精确相等 |
| `executor` | `executor` | 精确相等 |
| `account_role` | `platform_account_role` | 精确相等 |
| `limitations` | `limitations` | 精确相等 |
| `verifier` | `verifier` | 精确相等 |
| `fallback_verified=false` | `fallback_verification_status=未测试` | 固定映射 |
| 无独立字段 | `fallback_actual_result=null` | 固定为空 |

`cleanup_result` 只存在于 results，验证器检查其固定安全停点语义，但不得声称与 on-site 存在同名字段或做不存在的跨文档比较。

### 4.4 引用字段边界

results P01 中的 `probe_ref`、`evidence_unit_ref`、`expected_result_ref` 和 `fallback_path` 来自模板复制，当前 live 文件位置不能作为可靠的相对解析基准。v1 只冻结这四个引用字符串，不解引用、不声称目标已验证，并固定输出：

```text
reference_strings_bound = true
reference_resolution_verified = false
```

已知引用未解析不会让当前 blocked snapshot 失败，但它禁止验证器据此推导 P01 completed。未来若要修复引用基准，必须先单独迁移两份 live 证据，再更新冻结摘要和验证器。

### 4.5 已知事实与未闭环项

验证器只绑定下列文档语义：

- 历史“未登录可打开且只读”是 `user_attested`，不是机器验证。
- 当前机器只取得页面打开及刷新后地址/标题稳定的元数据。
- 当前浏览器会话是否真正未登录仍未验证。
- `refresh_completion=unverified`。
- `body_readability_after_refresh=unverified`。
- `edit_entry_absence=unverified`。
- 截图不可用，第二独立浏览器会话未建立。
- 本轮没有修改分享设置、权限或正文，也没有发送链接或上传文件；这些是受控文档声明，不等于验证器亲自观察到零写。
- 记录时间是脱敏证据落盘复核时间，不冒充历史观察或浏览器调用的精确发生时间。

任一文本若被同步改写成“匿名访问已机器验证”“刷新已完成”“正文可读”“无编辑入口”“P01 已完成”或“业务写计数已机器证明为 0”，验证器必须 fail-closed。

## 5. 固定报告

报告只允许以下键，顺序固定：

```text
schema_version
scope
fact_class
result_input_sha256
onsite_input_sha256
p01_result_snapshot_sha256
p01_onsite_snapshot_sha256
validation_status
p01_state_verified
p01_result_null_verified
p01_attempt_verified
p01_evidence_identity_verified
p01_evidence_binding_verified
p01_evidence_entry_count
historical_user_attestation_bound
current_browser_metadata_bound
reference_strings_bound
reference_resolution_verified
current_session_logged_out_verified
refresh_completion_verified
body_readability_after_refresh_verified
edit_entry_absence_verified
screenshot_evidence_count
run_evidence_count
fallback_verified
p01_completion_verified
anonymous_document_access_derived
observation_truth_machine_verified
business_write_count
redaction_verified
issue_codes
```

当前合法 blocked 快照的关键输出固定为：

```text
schema_version = live_p01_evidence_report.v1
scope = P01_redacted_live_evidence_only
fact_class = synthetic_experiment
validation_status = passed
p01_state_verified = true
p01_result_null_verified = true
p01_attempt_verified = true
p01_evidence_entry_count = 1
historical_user_attestation_bound = true
current_browser_metadata_bound = true
reference_strings_bound = true
reference_resolution_verified = false
current_session_logged_out_verified = false
refresh_completion_verified = false
body_readability_after_refresh_verified = false
edit_entry_absence_verified = false
screenshot_evidence_count = 0
run_evidence_count = 0
fallback_verified = false
p01_completion_verified = false
anonymous_document_access_derived = false
observation_truth_machine_verified = false
business_write_count = null
redaction_verified = true
```

这里的 `passed` 只表示当前 blocked 文档合法、一致并已脱敏。它不等于 P01 通过。

## 6. 安全读取和失败处理

1. 单文件上限 128 KiB，UTF-8 fatal decode。
2. 拒绝 duplicate JSON key、malformed JSON、非有限数和尾随内容。
3. 固定可信项目根；从文件系统根开始逐组件检查精确大小写和普通目录/文件类型。
4. 拒绝 trusted root、祖先目录、父目录或最终文件 symlink。
5. 打开前后复核整条路径的设备号、inode、类型、大小及时间元数据，文件使用 `O_NOFOLLOW`。
6. CLI 有任何参数即失败，不回显参数或路径。
7. 两份完整输入递归扫描敏感模式：键名使用精确 credential-key denylist，字符串值使用 URL、账号、凭证、资源 ID、locator、二维码和 provider raw 模式；报告和错误只输出闭集 issue code，不回显输入文本。
8. serializer 只接受固定报告键和值域；额外键、伪造 `true`、伪造计数和未知 issue code 全部拒绝。
9. documents 入口的 `result_input_sha256/onsite_input_sha256` 使用递归排序键后的 canonical JSON bytes；text、buffer、file 入口使用收到或读取的原始 bytes。两类入口都必须另外得到相同的 P01 canonical record 摘要。
10. issue code 必须按固定闭集顺序去重输出。失败报告中所有 `verified/bound/derived` 布尔值为 false，计数为 null，`p01_completion_verified=false`、`business_write_count=null`；只有已经安全取得的输入摘要可以保留。

建议 issue code 闭集：

```text
input_transport
duplicate_json_key
invalid_json
document_shape
p01_record_shape
onsite_record_shape
p01_state
p01_evidence_identity
p01_evidence_binding
p01_onsite_alignment
p01_snapshot_drift
p01_reference_binding
p01_latest_fact
sensitive_value
completion_claim
cli_arguments_forbidden
report_shape
```

## 7. 测试矩阵

正例只使用当前两份 live snapshot，并断言报告绑定两个输入 SHA、不回显任何现场文本。

负例至少覆盖：

- P01 缺失、重复、改为 `not_tested/completed`、`result` 非 null；
- results/on-site 任一 exact key 缺失、增项或类型漂移；
- 三份 evidence 缺失、增项、重排、不等；
- evidence ID、时间、actor、slot、capture phase、redaction 漂移；
- action/result/time/executor/role/limitations/verifier 跨文档不一致，或 results 独有的 cleanup 安全停点漂移；
- 四个引用字符串漂移，或验证器伪称相对引用已经解析；
- 两条 P01 canonical snapshot SHA 与冻结值不一致；
- 历史 attestation 被改成 machine verified；
- 当前登录态、刷新完成、刷新后正文可读或无编辑入口被伪造为已验证；
- screenshot/run index 非空，fallback 被改为已验证；
- completed、available、restricted、unavailable、匿名能力已证明、业务写为 0 等越权外推；
- URL、账号、token、App ID、Base/table/view/record ID、locator、二维码或 provider raw 哨兵；
- duplicate key、malformed、非 UTF-8、超限、路径逃逸、大小写别名、任意层 symlink、文件或父目录 inode 替换；
- serializer 额外键、伪造布尔/计数和未知 issue code；
- CLI 参数及任何失败报告回显输入哨兵。

## 8. 文件所有权与实施顺序

实现只新增：

- `feishu/scripts/validate-live-p01-evidence.mjs`
- `tests/core/live-p01-evidence.test.mjs`

不修改两份 live JSON、通用 Contract/Offline/Day-1 validator、P03/P12/P13 validator、manifest、runbook、公开文稿或 `.codex`。

实施顺序固定为：

1. 新测试因模块不存在确定性 RED。
2. 实现 documents、texts、buffers、files 四层入口和固定 CLI。
3. 定向 GREEN。
4. P01 与 P03/P12/P13 联合回归。
5. Live P02、Contract、Offline、Day-1、`node --check`、scoped ESLint、diff-check 和敏感扫描。
6. 只报告真实测试数和最终 SHA。

## 9. 状态迁移规则

本验证器 v1 故意只接受当前 blocked snapshot。未来取得真正未登录首屏、刷新后正文可读和无编辑入口三项证据时：

1. 先由总控裁决新现场事实和脱敏证据；
2. 更新两份 live JSON，并保持三方 canonical 绑定；
3. 单独评审 P01 的 `completed/可用|受限|不可用` 迁移；
4. 再升级验证器合同和测试。

不得先改验证器去接受 completed，再反向制造现场结论。

## 10. 验收口径

实现通过后，只允许写：

> P01 当前 blocked 现场证据快照已通过本地只读结构、绑定和脱敏验证；匿名刷新、刷新后正文可读和无编辑入口仍未完成机器证明，P01 未完成。

仍禁止写：

- “P01 已通过”或“匿名访问已验证”；
- “飞书作品文档已公开发布”；
- “已接入新石器真实数据”；
- “验证器证明了浏览器现场事实或业务写入为 0”。
