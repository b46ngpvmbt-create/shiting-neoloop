# P03 partial-blocked 现场证据验证器设计

日期：2026-08-08
状态：纳入 R10 现场验收主线
事实类别：方案设计

## 为什么需要单独验证

P03 已发生首个权限动作，但目标独立视图分享没有稳定保存。当前正确状态是：父 P03 与 prebuild 均为 `blocked / result=null`，`actual_prebuild_proof=null`；postbuild 及 A02 无特权访问仍为 `not_tested / result=null`。

完整七事件验证器只接受完整轨迹，不能拿 2/7 的片段冒充现场完成；P12/P13 验证器又有独立职责，不应继续膨胀。因此需要一个只验证“现场文档是否诚实保持 partial-blocked”的独立入口。

它验证文档结构、状态和脱敏绑定，不验证飞书页面观察本身是否真实，也不证明业务写入为 0。

## 方案选择

### A．独立 snapshot validator（采用）

固定读取两份 live 脱敏证据，检查 P03 partial-blocked、A02 not-tested、证据索引绑定和停止点声明。

优点：不创造第四份真值；不改变七事件完成口径；与现有 P12/P13 live validator 的安全读文件方式一致。

代价：每次 P03 现场事实发生真实变化，都要同步更新验证器和测试。

### B．给七事件 validator 增加 prefix 模式（不采用）

这会把“完整轨迹可用性判断”和“现场中间状态一致性”混在一起。当前 live 文档也没有可供机器读取的 E1/E2 对象，容易把自由文本翻译成伪事件。

### C．并入 P12/P13 validator（不采用）

文件更少，但会把三个不同权限门绑在同一故障域里，后续维护和状态裁决都会变得含混。

## 输入边界

生产 CLI 固定读取：

- `feishu/evidence/live/2026-08-07-day-1-probe-results.redacted.json`
- `feishu/evidence/live/2026-08-07-on-site-evidence.redacted.json`

CLI 不接受路径参数。模块可以暴露 documents、text、buffer、files 四层纯验证入口，供测试和内部复用。

读取要求：

- 每个文件不超过 128 KiB；
- UTF-8 fatal decode；
- 拒绝重复 JSON key、非有限数、尾随内容和 malformed JSON；
- 拒绝 symlink，并对打开前后的 inode 做复核；
- 不读取七事件 fixture，也不读取飞书 URL、账号、资源 ID、locator、token 或 provider 原始错误。

## 必须验证的状态

1. results 中恰有一个 P03 和一个 A02，on-site 中恰有一个 P03。
2. P03 parent 为 `blocked/null`，并绑定非空脱敏证据。
3. prebuild 为 `blocked/null`，`actual_prebuild_proof=null`。
4. postbuild 保持 `not_tested/null`。
5. results 的 `evidence`、`evidence_index` 与 on-site 的 `structured_evidence_index` canonical deep-equal。
6. prebuild phase evidence 等于 parent indexes 按 `prebuild_gate` 过滤后的完整结果，顺序和身份均不漂移。
7. action、result、time、executor、role、limitations、verifier 在两份 live 文档中保持同义一致。
8. 当前停止点声明完整：分享回退关闭；未复制或发送链接；未邀请第二身份；未建立外部访问；业务字段、关系和审计零写仍未完成；第二身份、mutation、撤权、刷新和重登未执行。
9. A02 的状态、result、evidence 及所有 runtime 字段保持 `not_tested/null`。
10. `r10_subchecks=null`，不得提前生成完成态 proof 或部分七事件轨迹。

## 固定报告

报告只允许以下键：

```text
schema_version
scope
fact_class
result_input_sha256
onsite_input_sha256
validation_status
p03_parent_blocked_verified
p03_prebuild_blocked_verified
p03_partial_attempt_verified
p03_full_event_trace_verified
p03_full_prebuild_proof_verified
p03_postbuild_not_tested_verified
p03_completion_verified
p03_evidence_identity_verified
p03_evidence_binding_verified
p03_evidence_entry_count
safe_stop_claims_bound
a02_not_tested_verified
unprivileged_access_capability_derived
formal_build_gate_open
automatic_retry_allowed
observation_truth_machine_verified
business_write_count
redaction_verified
issue_codes
```

当前 snapshot 通过时仍必须输出：

```text
validation_status = passed
p03_partial_attempt_verified = true
p03_full_event_trace_verified = false
p03_full_prebuild_proof_verified = false
p03_completion_verified = false
a02_not_tested_verified = true
unprivileged_access_capability_derived = false
formal_build_gate_open = false
automatic_retry_allowed = false
observation_truth_machine_verified = false
business_write_count = null
```

这里的 `passed` 只表示两份 blocked 文档一致、结构合法且已脱敏。

## 禁止外推

以下任一情况都必须 fail-closed：

- P03、prebuild 或 postbuild 被提前写成 completed；
- P03 result 非 null，或 partial 阶段出现非 null proof；
- A02 从 not-tested 前移；
- 声称第二身份、无特权访问、零业务写或正式建设门已经通过；
- 把 owner 视觉记录标成 machine-verified 现场事实；
- 写入企业数据接入、生产上线、真实 OpenAPI 成功或真实业务收益结论；
- 输入中出现 URL、账号、App ID、Base/table/view/record ID、locator、凭证、二维码内容或 provider 原始错误。

## 测试矩阵

正例只保留当前两份 live snapshot。必须证明报告绑定两个输入 SHA，且不会回显现场文本。

负例至少覆盖：

- parent、prebuild、postbuild、A02 任一状态或 null 合同漂移；
- 三份 evidence 缺失、增项、重排、不等或 phase filter 漂移；
- evidence identity、actor、时间、slot、capture phase 漂移；
- 两份 live 的 action/result/role/limitations/verifier 不一致；
- 任一安全停点声明缺失；
- completed、available、restricted、unavailable、零写或正式建设门等越权外推；
- URL、账号、token、App ID、资源 ID、locator、provider raw 哨兵；
- duplicate key、malformed JSON、非 UTF-8、超限、symlink、inode 替换；
- serializer 额外键、伪造布尔或污染 issue code；
- 任何错误报告回显输入哨兵。

## 文件所有权与验收

T3 只新增：

- `feishu/scripts/validate-live-p03-partial-blocked-evidence.mjs`
- `tests/core/live-p03-partial-blocked-evidence.test.mjs`

不得修改完整七事件 validator、P12/P13 validator、两份 live evidence、飞书模板或 `.codex`。

验收需要：定向测试、P03/P12/P13 联合回归、Live P02、Contract、Offline、Day-1、scoped ESLint、`node --check`、diff-check 和敏感值扫描全部通过。即使全部通过，P03 仍保持 `blocked/null`，正式 10 表、5 视图、7 AI 节点和 6 工作流继续关闭。
