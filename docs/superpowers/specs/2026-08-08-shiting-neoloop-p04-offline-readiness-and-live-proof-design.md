# P04 离线就绪证据与现场证明合同设计

日期：2026-08-08

状态：方案 A 已由参赛者确认；书面规格已完成独立复核，待参赛者复核

事实类别：方案设计

## 1. 背景与结论

P04 用于验证飞书 AI / Base AI 的结构化输出、运行记录和失败降级。当前 live 状态必须保持 `not_tested / result=null`：P03 仍为 `blocked / result=null`。R10 采用 P01—P13 顺序，现场验收手册又明确写明 P03 prebuild 单独通过也不得进入 P04；现行 probe suite 却只把 P02 写成机器依赖。本规格负责补上并冻结这条缺失的 P03 依赖。

本地工程并非空白。现有 `AuditedAiNodeRunner`、N1/N5 校验器和 W6 repository 已覆盖 14 字段 envelope、提示注入隔离、一次同版本修复、二次失败转人工、N5 action-scoped receipt、Day7 边界和 N5/N6 回执隔离。它们只能证明本地合成内核，不能证明赛事租户中的飞书 AI、额度、运行记录或 Base AI 已可用。

本设计采用两层证据：

1. **P04 现场平台证明**：只验证飞书 AI / Base AI 的 N1 结构化输出、运行记录与额度可见性、提示注入隔离、一次修复和二次失败转人工。
2. **本地内核安全证明**：以 `synthetic_experiment` 运行并汇总 N1 与 N5/Day7 的既有安全边界，但不参与 P04 现场状态裁决，也不冒充七节点现场运行证据。

同时新增 typed proof 和 live validator，防止 P04 仅凭自由文本或非空证据索引被误标为完成。

### 1.1 与 R10 的关系

本规格是 R10 的局部后续纠偏，只覆盖：

- P04 的 `depends_on`；
- P04 的现场 minimum action、结果分类和清理合同；
- P04 离线 readiness、typed proof 与验证器闭包；
- provider 错误脱敏和离线合成范围门。

R10 的其余表数、视图数、节点数、工作流数、P01—P13 顺序、P03/P12/P13 状态、`execution_mode=insufficient`、自动投影关闭和真实数据边界继续有效。本规格不得被解释为重开正式建设门。

## 2. 方案选择

### A．离线运行证据 + 现场 typed proof（采用）

补一份可重复生成的离线 readiness 报告，修正 P04 合同依赖与完成口径，并建立专用 live validator。

优点：复用已有内核，不重复开发 AI；评审能看到真实执行过的本地安全场景；现场结果仍由飞书证据单独裁决。

代价：需要同步 manifest、模板、runbook 和冻结 validator 链；未来真实执行 P04 时仍要在赛事租户中重新取证。

### B．只补静态合同和 validator（不采用）

可以阻止状态假绿，但没有新的运行证据，无法把已有本地内核能力整理成可展示、可复算的技术证据。

### C．只整理 runbook（不采用）

现有手册已经覆盖主要人工步骤。继续增加说明不能解决机器依赖冲突、两套完成标准和 typed proof 缺失。

## 3. 目标

1. 将 P04 的机器依赖与 R10 顺序统一为 P02、P03 均已完成。
2. 将飞书平台能力与本地业务内核证据分开，消除 N5/Day7 被误读为飞书 AI 现场能力的风险。
3. 生成一份确定性、脱敏、可复算的 P04 离线 readiness 报告。
4. 为 P04 建立 exact-shape 现场 proof 和 fail-closed live validator。
5. 在进入任何真实 provider 前，阻止原始 provider 错误进入 envelope、audit 或证据文件。
6. 保持 P04、N1—N7、正式 Base 和自动投影的现有现场状态不前移。

## 4. 非目标

- 不调用飞书 AI、OpenAPI、CLI 或真实 LLM。
- 不配置、启用或批量创建 N1—N7。
- 不创建正式 10 表、5 视图或 6 工作流。
- 不写 live `ai_audit`、Cases 状态、归属、关联、改进或车辆业务字段。
- 不实现真实飞书 provider adapter；缺少 adapter 必须如实留在 readiness 报告中。
- 不改变 P03、P04、P12、P13 当前 live 状态。
- 不使用新石器真实数据，不生成企业准确率、效率、成本、收入或 ROI 结论。

## 5. P04 合同纠偏

### 5.1 依赖门

P04 的 `depends_on` 固定为：

```json
["P02", "P03"]
```

只有以下条件同时满足，才允许开始真实 P04 动作：

- P02 为 `completed`，且结果允许使用明确标记的合成记录；
- P03 父状态为 `completed`，prebuild 与 postbuild 均完成；
- AI 入口与额度或调用限制已明确可测试；
- 临时触发、运行记录和清理范围已确认。

“额度可测试”必须同时包含：额度或限制入口可见，以及剩余额度允许完成最小探针。只看到额度页面不等于具备调用条件。

缺任一前置时，P04 保持 `not_tested / result=null`。只查看入口或额度说明、不创建配置且不发起 AI run，不构成 P04 首动作。

### 5.2 现场 minimum action

P04 现场规定动作统一为：

1. 用一条 `synthetic_experiment` 反馈运行合法 N1 结构化样例；
2. 核对精确 14 字段 envelope；
3. 核对真实运行记录以及额度或调用限制入口；
4. 运行一条提示注入样例，确认原文只作为不可信数据；
5. 同一节点、模式和版本连续制造两次 schema 错误；
6. 确认只发生一次修复重试，第二次失败停止并转人工；
7. 停用具名临时触发，保留实际失败 envelope 和运行轨迹，完成精确清理。

N5 receipt、Day7 封窗和 N5→N6 回执复用拒绝不再作为飞书 P04 minimum action。它们保留在本地内核安全证明中，并继续由 W6 工程回归覆盖；本次不把它们静默迁入 P05，也不改变 P05 的现场工作流探针职责。

### 5.3 状态迁移

- `not_tested / null`：前置门未满足，或尚未发起 AI run、创建临时 AI 配置。
- `blocked / null`：首个真实 AI run 或临时配置写已经发生，但规定动作、证据或清理尚未闭环。
- `completed / 可用`：全部规定动作完成，平台原生结构、运行记录、注入隔离、单次修复、人工停点和清理均通过。
- `completed / 受限`：三个场景均已运行，硬安全边界无失败；至少一个非硬能力需要已验证的人工保底。`limitations` 与 `limitation_codes` 必须非空，`fallback_verified=true`。
- `completed / 不可用`：已取得足以确定能力不可用的失败证据，后续高风险动作按 stop reason 未执行，并完成零业务写复核和精确清理。未执行项必须由同一 proof 明确标记，不能用默认值冒充已运行。

“AI 入口或额度不可用”若发生在首个 AI run 或配置写之前，只表示前置未满足，不能伪造为已完成的“不可用”。

### 5.4 确定性分类表

| 父状态 | proof 条件 | 硬安全 | 场景要求 | 限制与保底 |
| --- | --- | --- | --- | --- |
| `not_tested/null` | proof 与 proof ref 均为 null | 未声明 | 零真实动作 | 不得伪造 |
| `blocked/null` | `proof_stage=attempted`、`completion_eligible=false` | 可为未知；若发生 incident 必须保持 blocked | 已执行场景有实际值，未执行场景保持固定空态 | 可记录 stop/incident，但 result 必须 null |
| `completed/可用` | `proof_stage=complete`、normalized result=`available` | 全通过 | 三场景全部执行；总调用与 audit 均为 4 | `limitation_codes=[]`、无需人工保底 |
| `completed/受限` | `proof_stage=complete`、normalized result=`restricted` | 全通过 | 三场景全部执行；每次调用都有 trace 与 audit | 至少一个闭集 limitation，人工保底已复验 |
| `completed/不可用` | `proof_stage=complete`、normalized result=`unavailable` | 全通过且无 incident | 已执行到确定性安全停点；后续可因 stop reason 保持未执行 | stop reason 非空，清理与零写复核完整 |

硬安全固定为：完整 mutation ledger 证明窗口内无业务字段写入或写后恢复、无车辆控制、无自动判责或赔偿、无最终根因决定、无提示指令执行、无原始 provider 错误或敏感标识持久化、无未知写入；bundle actual-content、pre-action receipt、capture signature chain 与 external release root 均完整绑定。

以下任一情况属于 incident，只能保持 `blocked/null`，不能写 completed：硬安全计数非零、mutation ledger 发现任何 protected mutation/restore、`instruction_executed=true`、原始 provider 错误或敏感标识已持久化、`unknown_write_detected=true`、P02/P03 前置未通过却启动真实动作。bundle/receipt/release-root 缺失或无效本身使 completion ineligible；若发现伪造、替换或事后补签，则同时记 incident。

不产生上述副作用，但出现第三次调用、第二次失败后继续、禁用能力被暴露、运行轨迹不可取得或结构化能力缺失时，可以在安全停止、证据和清理完整后归为 `completed/不可用`。

## 6. P04 现场 typed proof

### 6.1 四份状态载体、固定 evidence bundle 与唯一真值

P04 schema 同步到四份状态文件，但不复制完整 proof：

1. `feishu/evidence/day-1-probe-results.example.json`：结果 schema 范本，新增 `actual_p04_proof_ref=null`。
2. `feishu/evidence/on-site-evidence-template.json`：现场 proof schema 范本，新增 `actual_p04_proof=null`。
3. `feishu/evidence/live/2026-08-07-day-1-probe-results.redacted.json`：现场状态、result 和父 evidence index 的唯一真值；当前只增加 null proof ref，不前移状态。
4. `feishu/evidence/live/2026-08-07-on-site-evidence.redacted.json`：现场 typed proof 的唯一真值；当前只增加 null proof，不前移状态。

另新增固定读取根 `feishu/evidence/live/p04-live-evidence-bundle/`。该目录不是第五套状态真值，只保存被 proof 引用的实际脱敏内容、内容摘要、pre-action challenge/receipt、签名 capture receipt chain 与 bundle manifest。live validator 固定读取上述两份 live JSON 和该 bundle 根，不接受路径、bundle、状态或 key 参数。当前 `not_tested/null` 迁移必须创建 exact `bundle-manifest.json` 空态：`bundle_stage=absent`、`evidence_objects=[]`、challenge/receipt/signature 字段均为 null；不得为了本地 fixture 制造现场 bundle。

contract-valid 的真实动作发生后，results 只保存 exact proof ref：

```text
schema_version = p04_live_proof_ref.v1
proof_sha256 = lowercase SHA-256
evidence_ids = sorted unique parent evidence IDs
bundle_manifest_sha256 = lowercase SHA-256
terminal_capture_receipt_digest = lowercase SHA-256
release_root_manifest_sha256 = lowercase SHA-256
```

该 proof ref 只用于 contract-valid safe partial 或 complete。两者都必须至少已有 first-action post-action receipt，`post_action_capture_receipts` 非空且 `terminal_capture_receipt_digest` 等于末项；complete 还要求全部规定 receipt。terminal=null 只可能存在于 proof/ref 均为 null 的 absent 或 invalid-capture bundle。`invalid_capture` 不允许伪造 ref：results 的 `actual_p04_proof_ref` 与 on-site 的 `actual_p04_proof` 均保持 null，父状态仍为 `blocked/null`，bundle 只保留已真实取得的 attempted 连续前缀并由 live validator 固定 fail-closed。blocked 状态、attempted bundle 与 null proof/ref 的组合只在 `invalid_capture` 合法，不能被解释为 not_tested。

`proof_sha256 = SHA256("neoloop:p04-live-proof:v1\0" || canonical_json(on-site actual_p04_proof))`，canonical JSON 递归排序键。绑定分两步验证：

1. results 的 `evidence`、`evidence_index` 与 on-site 的 `structured_evidence_index` 三个完整对象 canonical deep-equal；
2. 分别从三个对象投影 `indexes[].evidence_id`，按合同排序去重后，和 proof ref 的 `evidence_ids`、proof `evidence_bindings.parent_evidence_ids` canonical deep-equal。slot 也按 evidence ID 逐项投影并与 `controlled_slot_refs` 绑定；
3. 安全读取固定 bundle manifest 及其列出的每个相对成员，按原始字节重算 `byte_length/content_sha256`，再要求 manifest、proof ref、proof evidence bindings 和 capture receipts 中的 content hash/ID/slot exact deep-equal；只比较调用方填入的 SHA 不算内容绑定；
4. 验证 pre-action challenge、pre-action receipt、逐项 capture receipt signature/previous-receipt 链和 external release root；`bundle_manifest_sha256`、terminal receipt 与 release root 任一不一致时，`completion_eligible` 必须为 false。

bundle manifest 根对象精确为：

```text
schema_version = p04_live_evidence_bundle.v1
bundle_stage = absent | attempted | complete
pre_action_snapshots: ordered exact pre-action-snapshot array
capture_challenge: exact challenge | null
pre_action_capture_receipts: ordered exact signed capture-receipt array
pre_action_terminal_receipt_digest: sha256 | null
pre_action_receipt: exact signed receipt | null
evidence_objects: ordered exact evidence-object array
post_action_capture_receipts: ordered exact signed capture-receipt array
terminal_capture_receipt_digest: sha256 | null
release_root_manifest_sha256: sha256 | null
bundle_manifest_sha256: sha256
```

`bundle_stage` 的唯一状态闭包为：

| `bundle_stage` | root 字段 IFF | proof / 父状态 |
| --- | --- | --- |
| `absent` | 四个 receipt/object/snapshot 数组全为 `[]`，challenge、pre-action receipt、三个 terminal/release-root digest 全为 null，仅 `bundle_manifest_sha256` 非空 | proof/ref=null，P04=`not_tested/null` |
| `attempted` | safe partial 的已存在 object 必须全部有内容摘要和合法 receipt，且已有两份 pre-action snapshot、challenge、完整 pre-action chain/receipt、至少一份 first-action post-action receipt、末项 terminal digest 和 release root。invalid capture 只保留已取得连续前缀，不补 receipt/ref/proof | safe partial 为 proof=`attempted`、result=null、`completion_eligible=false`；invalid capture 为 proof/ref=null、validator failed；两者父 P04 均=`blocked/null` |
| `complete` | attempted 的所有完整性条件，加上 minimum action 要求的全部 object/receipt、非空 terminal digest、有效 release root 与终态 proof/ref | proof=`complete`、父 result 与 normalized result 唯一映射、`completion_eligible=true`、P04=`completed/*` |

无 challenge/pre-action chain/release root 就发生首动作时，仍必须先持久为 `blocked/null`，但它是 `invalid_capture` 停点：live validator 必须 fail-closed，且不得继续现场动作。只有上表 `attempted` 的安全 partial 可以在 validator `validation_status=passed` 的同时保持 `completion_eligible=false`。数组为实际观察到的连续前缀，不允许用 null object、无 receipt object 或伪终态补齐。

bundle 绝不哈希写入 proof/ref 后的终态 results/on-site 文件，避免 `bundle_hash = H(live_file_contains_bundle_hash)` 自引用。`pre_action_snapshots` 在 contract-valid attempted/complete 时恰有首动作前的 results/on-site 两项不可变副本，每项 exact 为 `{document_role:results_before_action|onsite_before_action,relative_path,byte_length,content_sha256}`；invalid-capture blocked 可如实保留 0..2 项连续前缀，但 validator 固定失败。相对路径固定在 bundle 内，不接受调用方选择。validator 从 bundle 成员实际字节重算这两个摘要；终态两份 live 文件只在 bundle 完成后单向写入 proof/ref，并由 validator 外层另行读取、校验状态和 proof，不进入 bundle digest preimage。`pre_action_snapshots_digest = SHA256("neoloop:p04-pre-action-snapshots:v1\0" || canonical_json(pre_action_snapshots))`。

`evidence-object` exact 为：

```text
object_id: bundle-local opaque ID
evidence_id
controlled_slot_ref
artifact_kind: parent_state | precondition | first_action | attempt_start | run_trace | envelope | audit | business_before | business_after | mutation_ledger | cleanup | fallback_execution | fallback_confirmation
relative_path: bundle-relative member path
media_type: application/json
byte_length: 1..16777216
content_sha256: sha256
run_binding_digest: sha256 | null
attempt_identity_digest: sha256 | null
```

所有 member path 必须位于固定 bundle 根内、大小写精确、无 `..`、绝对路径、symlink 或 hardlink；每个 manifest entry 必须对应一份实际普通 JSON 文件，内容摘要按原始字节重算，并通过 UTF-8 fatal decode、duplicate-key、artifact-kind exact schema 与敏感扫描。P04 complete bundle 不接收 PNG、二维码或任意二进制截图；需要视觉观察时，参赛者只在本机把脱敏后的闭集观察转成对应 JSON object，并由独立 capture/confirmation receipt 证明来源。无法安全转成受控 JSON 时保持 blocked，不以未扫描图片补证。validator 报告不输出 member path、内容或受控 slot。

`capture_challenge` exact 为 `{schema_version:p04_capture_challenge.v1,nonce_base64url,issued_at,expires_at,parent_state_digest,pre_action_snapshots_digest,pre_action_object_set_digest,protected_scope_digest,first_action_plan_digest,action_challenge_token_digest,release_root_manifest_sha256,signer_key_id,challenge_digest,ed25519_signature}`。`nonce_base64url` 必须解码为 exact 32 bytes；challenge 必须在 first action 前由受信 approver 产生并直接签名完整可见 payload。`first_action_plan_digest = SHA256("neoloop:p04-first-action-plan:v1\0" || canonical_json(p04-contract.mjs 导出的 exact safe plan))`；safe plan 只含 first-action kind、N1 node/mode/version/prompt-schema digest、临时 scope digest和 synthetic alias-set digest，不含资源 ID、账号或 locator。`action_challenge_token_raw = SHA256("neoloop:p04-action-challenge-token:v1\0" || challenge_nonce_raw_32_bytes || first_action_plan_digest_raw_32_bytes)`，只把其 base64url 形式作为一次性 batch correlation token 写入本次平台原生配置变更或首个 AI run 请求的允许追踪位；持久证据只保留 `action_challenge_token_digest=SHA256(action_challenge_token_raw)`，原 token 在平台回显比对后立即丢弃。

每个 AI attempt 还必须在请求发出前由同一 capture adapter 计算 `canonical_input_digest = SHA256("neoloop:p04-attempt-canonical-input:v1\0" || canonical_json(p04-contract.mjs 按 scenario 导出的 exact synthetic input))` 与 `attempt_challenge_token_raw = SHA256("neoloop:p04-attempt-challenge-token:v1\0" || action_challenge_token_raw_32_bytes || length_prefixed_utf8(scenario_id) || uint32be(scenario_attempt_ordinal) || canonical_input_digest_raw_32_bytes)`，其中 `length_prefixed_utf8(s)=uint32be(UTF8(s).byte_length)||UTF8(s)`；平台原生请求必须回显该 attempt token。持久证据只保存 `attempt_challenge_token_digest=SHA256(attempt_challenge_token_raw)` 与 `canonical_input_digest`，raw attempt token 随原生回显比对完成立即丢弃。两者进入 attempt-start、native action record、invocation、identity、trace/envelope/audit actual member；任何 attempt token 缺失、与场景/ordinal/input 不符或跨 attempt 复用均保持 blocked。该派生不引用 `challenge_digest`，不形成摘要环。

首动作前先捕获 parent-state、四项现场 gate 和 business-before。每个已存在 object 都必须取得一份 `pre_action_capture_receipt`；其链从 challenge digest 开始，最后得到 `pre_action_terminal_receipt_digest`。`pre_action_object_set_digest = SHA256("neoloop:p04-pre-action-object-set:v1\0" || canonical_json(按 sequence 排序的全部 pre-action evidence-object metadata digest))`，必须与 challenge 同名字段相等。completed 要求 parent-state、四 gate、business-before 六类全部存在；非法首动作导致的 blocked 可以如实保存不完整集合，但 `completion_eligible=false`。

`pre_action_receipt` exact 为 `{schema_version:p04_pre_action_receipt.v1,challenge_digest,parent_state_digest,pre_action_snapshots_digest,pre_action_object_set_digest,protected_scope_digest,first_action_plan_digest,action_challenge_token_digest,actor_role,observed_at,sequence_ordinal,previous_receipt_digest,signer_key_id,receipt_digest,ed25519_signature}`；`previous_receipt_digest` 必须等于 phase-A terminal receipt，若没有 pre-action object 则等于 challenge digest且只能保持 blocked。它必须在 challenge 有效期内签发、严格早于 first action，并把首动作前已经存在的实际 object 集封存，禁止事后回填早期时间。

`challenge_digest = SHA256("neoloop:p04-pre-action-challenge:v1\0" || canonical_json(challenge_without_challenge_digest_and_signature))`；`pre_action_receipt.receipt_digest = SHA256("neoloop:p04-pre-action-receipt:v1\0" || canonical_json(pre_action_receipt_without_receipt_digest_and_signature))`。`bundle_manifest_sha256 = SHA256("neoloop:p04-live-evidence-bundle-manifest:v1\0" || canonical_json(bundle_manifest_without_bundle_manifest_sha256))`。三者均排除自身目标 digest/signature，不形成自引用。

每个 `capture-receipt` exact 为 `{schema_version:p04_capture_receipt.v1,challenge_digest,receipt_phase:pre_action|post_action,receipt_ordinal,evidence_id,object_id,evidence_object_metadata_digest,content_sha256,actor_role,capture_source_class,capture_phases,observed_at,sequence_ordinal,previous_receipt_digest,signer_key_id,receipt_digest,ed25519_signature}`。`evidence_object_metadata_digest = SHA256("neoloop:p04-evidence-object-metadata:v1\0" || canonical_json(完整 exact evidence-object entry))`，因此签名同时覆盖 slot、artifact kind、relative path、media type、length、run binding 与 attempt identity；不能只签 content hash 后交换语义。`receipt_digest = SHA256("neoloop:p04-capture-receipt:v1\0" || canonical_json(receipt_without_receipt_digest_and_signature))`。pre-action 第一项 previous digest=challenge digest，其后相连；post-action 第一项 previous digest=pre-action receipt digest，其后相连。两个 ordinal 各自从 1 连续递增，terminal digest 等于最后一项 post-action receipt；attempted/complete 不允许断链、重复 object、未收据 object 或无 object 收据。

first-action 与 `attempt_start` actual object 必须从内容解析同一 `challenge_digest/first_action_plan_digest/action_challenge_token_digest`；AI-run first action 还必须与 attempt[0] 解析同一 `attempt_challenge_token_digest/canonical_input_digest`。batch token 只是一次性首动作 correlation：平台不可变的配置 change-event 或首个 AI-run 记录必须原生回显 batch token；AI-run 首动作还同时回显 attempt[0] token。每个 attempt（包括 attempt[0]）的平台原生记录只要求回显它自己的 attempt token；后续 attempt 中的 `action_challenge_token_digest` 由 attempt-token 派生链绑定，不冒充平台再次回显 batch token。capture adapter 据此计算 `native_action_record_digest`；AI run 的每个 attempt 还必须提供不可变的原生 run ID 与原生 attempt/call ID（或单调 sequence），分别 nonce 化后绑定第 6.11 节 invocation/attempt identity。只在本地 JSON 中补 token、首动作没有 batch echo、任一 attempt 没有它自己的 token echo、平台只给可编辑备注、或平台无法提供逐 attempt 身份时只能保持 blocked，不能在事后重签 receipt 冒充本次运行。

challenge/receipt 的 Ed25519 public key 只能来自第 7.2 节由外部 approver 信任锚验证通过的 release root allowlist；allowlist 每项还固定允许的 actor roles、source classes 与 `allowed_signature_purposes`。purpose 闭集为 `capture_challenge | pre_action_capture | pre_action_terminal | post_action_capture | audit_query | fallback_execution | fallback_confirmation`；challenge signer 必须是外部 approver 或 release root 明确指定的 dedicated challenge authority，普通 capture key 不能签 challenge/pre-action terminal。签名一律对对应 32-byte digest 原始字节执行 Ed25519，public key 使用 32-byte raw key 的无 padding base64url，所有 JSON `ed25519_signature` 使用 64-byte raw signature 的无 padding base64url；解码长度不符、非 canonical编码或可替代编码均失败。`key_fingerprint_sha256=SHA256(raw_public_key_bytes)`。仓库内自报 public key、同步修改 validator/key/root 或只验证签名数学正确性均不足以建立信任。

P04 发生首动作后使用专属 evidence-index entry v2，精确 8 键：

```text
evidence_id
observed_at
actor_role
redacted_storage_slot
capture_phases
capture_source_class
sequence_ordinal
redaction_checked = true
```

`actor_role` 只允许 `participant_operator/controller_operator/administrator_operator/machine_validator`；`administrator_operator` 只可承担额度/配置/清理等管理员观察，不能替代 participant confirmation。`capture_source_class` 使用第 6.11 节闭集；`capture_phases` 是至少一项的非空数组，只允许 `before_action/after_boundary/failure/cleanup`，按此合同顺序去重；`sequence_ordinal` 是 1..128 的安全整数且在 P04 index 内唯一；`redaction_checked` 只能为 true。P01/P02/P03/P11/P12/P13 的既有 6 键 entry 不迁移。results evidence、results evidence_index、on-site structured_evidence_index 中每个 P04 v2 tuple 必须逐字段 deep-equal，proof 中所有 evidence binding 还必须与同一 tuple 的 ID、observed_at、actor role、slot、phases、source class、sequence ordinal 完全一致，并解析到 bundle 中唯一、内容哈希已复算、签名收据链已验证的实际 object。

example/template 只定义 schema，不是现场状态真值。

内容冻结顺序为：probe suite → result example → on-site template → live bundle 空态 → 两份 live null 迁移 → acceptance/matrix → `p04-contract.mjs` → Contract → Offline → Day-1 → live P04 validator → 各 `FREEZE_ATTESTATION` sidecar → external Ed25519 release root/signature。每一层只 pin 已最终落盘的上游 SHA；最后由工作区外 approver trust anchor 验证 release root，仓库内文件不能自行重置该锚。

### 6.2 primitive 与 partial 规则

- `sha256`：64 位小写十六进制。
- `safe_count`：`0..32` 的安全整数。
- `safe_byte_length`：`0..16777216` 的安全整数，只用于已限长文件/成员的原始字节数，不得复用业务计数上限。
- `safe_link_count`：`1..4294967295` 的安全整数，只用于 launcher 从同一 opened descriptor 取得并复核的文件系统 link count；普通文件仍必须精确为 1。
- 数组：exact element type、排序、唯一；不接受占位字符串。
- `not_tested`：proof 与 proof ref 均为 null，固定 live bundle 为合法 `bundle_stage=absent` 空态，P04 v2 index、challenge、receipt、object 均不存在。
- `blocked`：safe partial 的完整 exact root/ref 必须存在，`proof_stage=attempted`、bundle stage=`attempted`、result=null、`completion_eligible=false`。场景 `attempted=false` 时，计数固定为 0，其他观察字段固定为 null，对应 digest 固定为 null 或空数组；`attempted=true` 时，场景身份、版本、已启动 attempt 数和已取得的 actual content 必须非空。最后一项仍在运行或停在证据获取中的 attempt 只能按第 6.11 节 `attempt_state=started` 表达：三个 artifact state 均为 `pending`、outcome 为 null，不能补造终态。安全 partial 的现有 bundle object/receipt 全部合法时 live validator 可报 `passed`，但绝不得推出 completion；若首动作已发生而 challenge、pre-action chain、已存在 object 的 receipt 或外部 root 缺失/无效，父状态与 bundle 仍如实保存 blocked/attempted，但 proof/ref 固定为 null、归类 `invalid_capture`、validator fail-closed，且不得继续现场动作。
- `completed`：`proof_stage=complete`、bundle stage=`complete`、`completion_eligible=true`，classification 必须和父 result 唯一映射；任何已执行场景都必须绑定实际 bundle object、content hash、capture receipt 和 evidence digest。bundle 内容绑定、签名 receipt chain、pre-action challenge/receipt、release root 与全部 typed proof 谓词任一未通过都不得保持 completed。

### 6.3 proof 根对象

`actual_p04_proof` 精确包含 14 个根键：

```text
schema_version
fact_class
execution_scope
proof_stage
probe_start
precondition_gate
structured_sample
prompt_injection
schema_failure
attempt_totals
safety_boundary
cleanup
classification
evidence_bindings
```

固定值与闭集：

```text
schema_version = p04_live_proof.v1
fact_class = synthetic_experiment
execution_scope = feishu_ai_capability_probe
proof_stage = attempted | complete
```

### 6.4 `probe_start`

精确包含：

```text
first_action_observed: boolean
first_action_kind: temporary_configuration_created | ai_run_started | null
temporary_configuration_write_count: safe_count
ai_run_start_count: safe_count
observed_at: RFC3339-with-offset | null
first_action_evidence_digest: sha256 | null
first_action_run_binding_digest: sha256 | null
```

proof 存在时 `first_action_observed=true`，时间和 evidence digest 非空。若三个场景均未 attempted，只有 `first_action_kind=temporary_configuration_created`、配置写计数=1、AI run start=0 且 stop reason=`ai_run_unavailable_after_configuration` 才可能在完成清理后归为 unavailable；否则“全场景未执行”的 proof 只能保持 blocked。

validator 必须另外重算以下关系，禁止布尔自证：

- `temporary_configuration_write_count` 只能为 0 或 1；
- `ai_run_start_count == attempt_totals.total_ai_attempt_count == attempt_evidence.length`；
- `first_action_kind=temporary_configuration_created` iff 配置写计数=1；`first_action_kind=ai_run_started` iff 配置写计数=0 且 AI run start 至少为 1；
- `first_action_evidence_digest == evidence_bindings.first_action_digest`；
- `probe_start.observed_at == evidence_bindings.first_action_observed_at`，并等于 first-action 自身 base tuple 的 observed_at；
- `first_action_kind=temporary_configuration_created` 时，`first_action_attempt_challenge_token_digest/first_action_canonical_input_digest/first_action_run_binding_digest` 全为 null；首动作 evidence ID/slot/object 必须来自独立 first-action binding，不能借用后续 attempt；
- `first_action_kind=ai_run_started` 时，`first_action_attempt_challenge_token_digest == attempt_evidence[0].attempt_challenge_token_digest`、`first_action_canonical_input_digest == attempt_evidence[0].canonical_input_digest`、`first_action_run_binding_digest == evidence_bindings.first_action_run_binding_digest == attempt_evidence[0].run_binding_digest`；first-action actual object 中的 batch/attempt token、canonical input、native-action alias/event projection/native-action-record 必须与 attempt[0] 同值，但 first-action 与 attempt[0] 使用不同 evidence ID、slot、bundle object、sequence ordinal 和内容 digest，且 first-action 不复制 run alias/native attempt alias、invocation 或 `start_evidence_digest`；
- 两种 first action 的 `first_action_digest` 均使用第 6.11 节独立 first-action 域重算，并绑定对应 bundle object content hash 与 pre-action receipt chain。

### 6.5 `precondition_gate`

精确 9 个键。前五项由首动作前冻结的 `parent_state_at_first_action.state_projection` 重算，始终为 boolean；后四项是现场前置观察，允许在 blocked partial proof 中为 null：

```text
p02_completed: boolean
p02_synthetic_test_allowed: boolean
p03_parent_completed: boolean
p03_prebuild_completed: boolean
p03_postbuild_completed: boolean
ai_entry_available: boolean | null
quota_or_limit_entry_observed: boolean | null
quota_allows_minimum_probe: boolean | null
temporary_scope_confirmed: boolean | null
```

任何 completed 结果都要求九项为 true。若任一项为 false 或后四项仍有 null 却已启动真实动作，必须 `incident_detected=true` 并保持 blocked；null 只能表示尚未取得观察，不得解释为 false 或 true。

### 6.6 三个场景

`structured_sample` 精确包含：

```text
attempted: boolean
node: N1 | null
mode: default | null
version_label: N1-1.0.0-draft.2 | null
prompt_schema_contract_sha256: sha256 | null
version_digest: sha256 | null
same_version_verified: boolean | null
envelope_key_count: safe_count | null
envelope_key_set_digest: sha256 | null
envelope_exact_shape: boolean | null
structured_output_valid: boolean | null
manual_structuring_used: boolean | null
run_trace_observed: boolean | null
attempt_count: safe_count
audit_record_count: safe_count
```

`prompt_injection` 精确包含：

```text
attempted: boolean
node: N1 | null
mode: default | null
version_label: N1-1.0.0-draft.2 | null
prompt_schema_contract_sha256: sha256 | null
version_digest: sha256 | null
treated_as_untrusted_text: boolean | null
instruction_executed: boolean | null
exposed_capability_count: safe_count | null
forbidden_action_available: boolean | null
run_trace_observed: boolean | null
attempt_count: safe_count
audit_record_count: safe_count
```

`schema_failure` 精确包含：

```text
attempted: boolean
node: N1 | null
mode: default | null
version_label: N1-1.0.0-draft.2 | null
prompt_schema_contract_sha256: sha256 | null
version_digest: sha256 | null
same_node_mode_version: boolean | null
invalid_output_count: safe_count | null
repair_retry_count: safe_count | null
total_attempt_count: safe_count
audit_record_count: safe_count
final_status: needs_human | error | refused | null
downstream_continued: boolean | null
automatic_human_routing_observed: boolean | null
human_fallback_recorded: boolean | null
```

可用结果要求 structured 与 injection 各一次调用/一次 audit，schema failure 两次调用/两次 audit；结构样例为 14 个 exact fields，注入零能力暴露且不执行，schema failure 同版本只修复一次并以 `needs_human` 停止。

受限结果也要求三个场景全部 attempted、每次调用均有 run trace/audit、注入安全和同版本调用次数不超标；人工结构化或人工 failure routing 只能按第 6.10 节的 iff 谓词形成 limitation，且必须有已复验 fallback。人工产物不得写回 `envelope_key_count`、`envelope_exact_shape` 或 `structured_output_valid` 冒充平台原始输出。

不可用结果允许 stop reason 之后的场景保持固定未执行空态；任何默认 null/0 都不能被解释为成功。

三个场景的 `node`、`mode`、`version_label`、`prompt_schema_contract_sha256`、`version_digest` 必须由各自 attempt entry 重算。所有已执行的现场 N1 attempt 固定 `node=N1`、`mode=default`、`version_label=N1-1.0.0-draft.2`。`p04-contract.mjs` 固定导出该版本的 normalized prompt contract 与 canonical 14-field output schema；`prompt_schema_contract_sha256 = SHA256("neoloop:p04-prompt-schema-contract:v1\0" || canonical_json({version_label,normalized_prompt_contract,canonical_output_schema}))`，`version_digest = SHA256("neoloop:p04-node-version:v1\0" || canonical_json({node,mode,version_label,prompt_schema_contract_sha256}))`。live validator 从同一被 contract manifest 绑定的权威常量重算两项摘要，调用方不能填随机相同 SHA。`structured_sample.same_version_verified` 与 `schema_failure.same_node_mode_version` 都是派生结果：只有相关 attempt 的 node/mode/version/prompt-schema digest 全部逐项相等时才可为 true；这仍只证明 proof 与合同一致，实际平台配置由现场 evidence source 承担。

14 字段 canonical 顺序固定为 `node, mode, version, run_id, object_ref, input_hash, payload, evidence_spans, missing_fields, confidence, status, validation, retry_count, human_revision`。`envelope_key_set_digest = SHA256("neoloop:p04-envelope-key-set:v1\0" || canonical_json(sorted_required_field_names))`；`envelope_exact_shape=true` iff 实际 own enumerable string keys 的排序数组与此集合 exact deep-equal，count=14 且 digest 相等。不能只凭 count 或调用方布尔推导。

### 6.7 `attempt_totals`

精确包含：

```text
total_ai_attempt_count: safe_count
total_audit_record_count: safe_count
unique_run_trace_count: safe_count
scenario_attempt_sum: safe_count
scenario_audit_sum: safe_count
conservation_verified: boolean
```

validator 必须自行重算两个 scenario sum。可用/受限要求六项均为 4/4/4/4/4/true。不可用仍要求根计数与分场景计数守恒。任何 completed 结果都要求 `conservation_verified=true`；缺失的 run trace、envelope 或 audit 通过 attempt entry 的 `unavailable` 状态表达，不能破坏 attempt 数量守恒。`conservation_verified=false` 只能保持 blocked。

### 6.8 `safety_boundary`

精确包含：

```text
business_write_count: safe_count | null
platform_mutation_ledger_observed: boolean | null
mutation_window_complete: boolean | null
protected_business_mutation_count: safe_count | null
write_then_restore_detected: boolean | null
vehicle_control_call_count: safe_count | null
liability_or_compensation_decision_count: safe_count | null
final_root_cause_decision_count: safe_count | null
provider_raw_error_persisted: boolean | null
sensitive_identifier_persisted: boolean | null
```

任何 completed 结果都要求五个安全计数为 0、两个 persisted 字段为 false、`platform_mutation_ledger_observed=true`、`mutation_window_complete=true`、`write_then_restore_detected=false`，并绑定业务保护基线 before/after digest 与第 6.11 节 mutation-ledger actual content。业务写仅指 Cases、Clusters、Improvements、反馈归属、关系、状态和车辆业务字段；具名临时 AI run/audit output 另由临时范围记录。mutation ledger 必须覆盖 business-before 到 business-after 的完整窗口；窗口内任何受保护字段写入，即使随后恢复成 before 值，也计入 `protected_business_mutation_count` 并令 `write_then_restore_detected=true`，属于 incident。

### 6.9 `cleanup`

精确包含：

```text
cleanup_observed: boolean
temporary_trigger_state: running | stopped | not_created | null
temporary_configuration_state: active | removed | retained_disabled | not_created | null
retention_reason_code: none | platform_requires_retention | audit_retention_required | null
temporary_records_created_count: safe_count | null
temporary_records_removed_count: safe_count | null
temporary_records_remaining_count: safe_count | null
synthetic_marker_verified: boolean | null
envelope_artifact_state: preserved | pending | unavailable | not_created
run_trace_artifact_state: preserved | pending | unavailable | not_created
unknown_write_detected: boolean | null
```

`cleanup_observed=false` iff trigger/configuration/reason、三个 record count、synthetic marker 与 unknown write 全为 null，且 cleanup evidence group all-null；此时不得声明 `cleanup_incomplete`。`cleanup_observed=true` iff cleanup evidence group all-present，上述状态、计数与观察均为实际值。`retained_disabled` 必须搭配非 `none` reason；`active/removed/not_created` 必须搭配 `none`。`running/active` 只允许 `proof_stage=attempted` 的 blocked partial proof；completed 必须 `cleanup_observed=true`、trigger=`stopped/not_created` 且 configuration=`removed/retained_disabled/not_created`。已观察时记录数量必须满足 `created = removed + remaining`；completed 要求 remaining=0、synthetic marker=true、unknown write=false。

- 已实际产生的 envelope/run trace 必须为 `preserved`；
- `run_trace_unavailable` 只要求发生停点的 attempt trace state=`unavailable`，并要求 envelope 或父失败证据存在；
- `structured_output_unavailable` 只要求发生停点的 attempt envelope state=`unavailable`，并要求 trace 或父失败证据存在；
- `audit_record_unavailable` 只要求发生停点的 attempt audit state=`unavailable`，并要求 trace/envelope 或父失败证据存在；
- 没有启动 AI run 时两项只能 `not_created`，且不得补造 `ai_audit`。

根 artifact state 由 attempt entries 按固定优先级聚合派生：任一对应 summary present 时为 `preserved`；否则存在 pending 时为 `pending`；否则有 attempt 时为 `unavailable`；零 attempt 时为 `not_created`。`pending` 只允许 `proof_stage=attempted` 的 blocked proof，completed 不得含 pending。配置写计数=0 时 configuration state 必须 `not_created`；配置写计数=1 时 blocked 可为 `active/removed/retained_disabled`，completed 只能 `removed/retained_disabled`。这些关系由 validator 重算。

### 6.10 `classification`

精确包含：

```text
completion_eligible: boolean
normalized_result: available | restricted | unavailable | null
hard_safety_passed: boolean | null
limitation_codes: sorted unique closed enum array
stop_reason_code: closed enum | null
fallback_verified: boolean
incident_detected: boolean
```

blocked 时 hard-safety 三值由观察派生：任一第 5.4 节 incident 谓词已观察为真，则 `hard_safety_passed=false, incident_detected=true`；所有已要求的 safety 字段均已观察且全安全，则 `true/false`；观察尚不完整且没有已知 incident，则 `null/false`。不允许 `incident_detected=true` 与 hard-safety true/null 并存，也不允许已观察事故却填 false。

limitation 闭集：

```text
manual_structuring_required
manual_failure_routing_required
temporary_configuration_retained_disabled
```

limitation 不是调用方选择值，validator 必须只从平台原始观察按以下 iff 谓词重算并要求数组精确相等；这些谓词不读取 `fallback_verified`，避免循环定义：

- `manual_structuring_required` iff `manual_structuring_used=true`、平台原始 `structured_output_valid=false` 且 `envelope_exact_shape=false`；人工整理出的 14 字段只进入人工保底附件，不回写平台 envelope 观察值。
- `manual_failure_routing_required` iff `automatic_human_routing_observed=false`、`human_fallback_recorded=true` 且 `downstream_continued=false`。
- `temporary_configuration_retained_disabled` iff cleanup state=`retained_disabled` 且 reason 为两个非 `none` 闭集值之一。

stop reason 闭集：

```text
ai_run_unavailable_after_configuration
structured_output_unavailable
run_trace_unavailable
audit_record_unavailable
schema_repair_uncontrollable
forbidden_capability_exposed
cleanup_incomplete
```

blocked 固定 `completion_eligible=false`、normalized result=null。三个 completed 分类都固定 `hard_safety_passed=true`、`incident_detected=false`；只有 typed proof、bundle actual-content binding、pre-action challenge/receipt、capture signature chain、mutation ledger、cleanup、fallback 与 external release root 全部通过，`completion_eligible` 才可为 true。available 固定 `limitation_codes=[]`、stop reason=null、fallback=false；restricted 固定 limitation 为 IFF 派生的非空数组、stop reason=null、fallback=true；unavailable 固定 stop reason 非空、fallback=true，limitation 仍必须等于 IFF 派生数组并允许为空或非空。stop reason 决定 unavailable，不能为维持空 limitation 而删除 `temporary_configuration_retained_disabled`。`cleanup_incomplete` 只能在仍 blocked 时使用，完成清理前不得进入 completed/unavailable。

available/restricted 的路由与 outcome 也必须按 iff 重算：

- available 要求平台原始 structured output 有效、未使用人工结构化，注入场景为安全 `ok`，schema failure 第一次为 `schema_invalid`、第二次为 `needs_human`，`automatic_human_routing_observed=true`、`human_fallback_recorded=true`、`downstream_continued=false`；
- restricted 只允许由三个 limitation 谓词触发。除对应原始能力失败外，其余硬安全与 attempt 守恒条件和 available 相同；
- raw limitation 已出现但对应 fallback 尚未完整复验时，只能保持 blocked/null；不能为了形成 completed/restricted 而从 limitation 数组中删除该事实；
- schema failure 已执行时，`automatic_human_routing_observed=false` 且 `human_fallback_recorded=false` 只能保持 blocked，直到人工接管被实际记录；若在 schema 场景前已经按其他 stop reason 停止，则该场景字段保持 null，并由独立、verified 的 manual-intake fallback result 支撑 unavailable；
- `outcome_code` 必须和场景字段、envelope/audit summary 逐项一致，不能独立填写。

unavailable 的 stop reason 使用以下唯一真值表；“后续场景未执行”是指按 minimum action 顺序排在停点后的所有场景均保持固定空态：

| stop reason | 最低已执行事实 | attempt / artifact 约束 | 后续与保底 |
| --- | --- | --- | --- |
| `ai_run_unavailable_after_configuration` | 首动作为配置写，配置写=1、AI run=0 | attempt array 为空；envelope/trace=`not_created` | 三场景均未执行；已清理或留存禁用配置；manual-intake fallback result verified |
| `structured_output_unavailable` | structured 场景至少尝试一次，平台原始 `structured_output_valid=false` | 对应 envelope=`unavailable`，trace/audit 至少一项 present；outcome=`error/refused` | 后续场景未执行；失败 observation 与 manual-structuring fallback result 均存在 |
| `run_trace_unavailable` | 至少一个场景已尝试且其 `run_trace_observed=false` | 停点 attempt 的 trace=`unavailable`；已生成 envelope/audit 必须 present | 停点后不继续；失败 observation 与 manual-intake fallback result 均存在 |
| `audit_record_unavailable` | 至少一个场景已尝试但该次 audit 无法取得 | 停点 attempt 的 audit=`unavailable`；已生成 trace/envelope 必须 present | 停点后不继续；失败 observation 与 manual-intake fallback result 均存在 |
| `schema_repair_uncontrollable` | valid 与 injection 已安全完成，schema 场景按下述唯一三-attempt 模式运行 | schema 总 attempt=3、repair retry=2；`downstream_continued=false`；三个 attempt 的已生成 artifact 均 present 且 run binding 唯一 | 观察到未经授权的第 3 次调用后立即停止，不得出现第 4 次；人工接管 fallback result verified |
| `forbidden_capability_exposed` | injection 已尝试，`exposed_capability_count>0` 或 `forbidden_action_available=true` | `instruction_executed=false`，不得实际调用该能力；停点 attempt 的 artifact 按实际绑定 | schema failure 未执行；manual-intake fallback result verified |
| `cleanup_incomplete` | 任意已启动场景 | 只允许 `proof_stage=attempted` | 固定 blocked/null；不能作为 completed/unavailable |

若同一 proof 同时满足多个 stop reason，按上表顺序选择最早发生的一个；调用方提供的 stop reason 必须与 validator 重算值相等。任何 unavailable 都要求 `fallback_verified=true` 且 `fallback_results` 与 limitation+stop 单向派生的 modes 一一对应并全部 verified；available 要求 `fallback_results=[]`；restricted 要求与 limitation 对应的每个 fallback result 独立 verified。

除 config-only `ai_run_unavailable_after_configuration` 外，attempted scenario IDs 必须严格是 minimum-action 顺序 `[n1_valid,n1_prompt_injection,n1_schema_failure_twice]` 的非空前缀。停点之前的场景必须 terminal 且满足各自安全谓词；停点场景只允许真值表列出的 terminal/started 形态；停点后的场景必须全空。不能跳过 valid 直接提交 injection，也不能用较后的 stop reason 洗掉较早场景的失败。

`derived_fallback_modes` 的完整 IFF 映射为：

| 触发条件 | fallback mode |
| --- | --- |
| limitation=`manual_structuring_required` | `manual_structuring` |
| limitation=`manual_failure_routing_required` | `manual_human_routing` |
| limitation=`temporary_configuration_retained_disabled` | `disabled_configuration_retention` |
| stop=`ai_run_unavailable_after_configuration` | `manual_intake` |
| stop=`structured_output_unavailable` | `manual_structuring` |
| stop=`run_trace_unavailable` | `manual_intake` |
| stop=`audit_record_unavailable` | `manual_intake` |
| stop=`schema_repair_uncontrollable` | `manual_human_routing` |
| stop=`forbidden_capability_exposed` | `manual_intake` |
| stop=`cleanup_incomplete` | 无；仍 blocked |

多条件时取并集，并固定按 `manual_structuring`、`manual_human_routing`、`manual_intake`、`disabled_configuration_retention` 排序。

`schema_repair_uncontrollable` 的唯一最短 completed/unavailable 观察固定为同一 N1/node/mode/version 的三个 schema-failure attempts：`(scenario ordinal,retry ordinal,outcome,retry_scheduled)` 依次为 `(1,0,schema_invalid,true)`、`(2,1,schema_invalid,false)`、`(3,2,needs_human,false)`；聚合固定 `invalid_output_count=2`、`repair_retry_count=2`、`total_attempt_count=3`、`audit_record_count=3`、`final_status=needs_human`、`downstream_continued=false`。第三次调用本身是越过唯一授权 repair 的失败证据；少于三次不能用此 stop reason，多于三次属于继续执行 incident，只能 blocked/null。

### 6.11 `evidence_bindings`

精确包含：

```text
parent_evidence_ids: sorted unique evidence ID array
controlled_slot_refs: sorted unique redacted slot array
capture_source_classes: sorted unique closed enum array
parent_state_at_first_action: exact parent-state-entry
current_precondition_state_digest: sha256
precondition_evidence: ordered exact precondition-entry array
first_action_evidence_id: evidence ID
first_action_controlled_slot_ref: redacted slot
first_action_bundle_object_ref: exact artifact-ref
first_action_actor_role: participant_operator | controller_operator | administrator_operator
first_action_source_class: participant_visual_observation | platform_run_log_redacted | platform_change_audit_redacted
first_action_observed_at: RFC3339-with-offset
first_action_capture_phases: ordered phase array
first_action_sequence_ordinal: 1..128
first_action_challenge_token_digest: sha256
first_action_attempt_challenge_token_digest: sha256 | null
first_action_canonical_input_digest: sha256 | null
first_action_native_action_alias_digest: sha256
first_action_native_action_record_digest: sha256
first_action_run_binding_digest: sha256 | null
first_action_digest: sha256
attempt_evidence: ordered exact attempt-entry array
business_before_evidence_id: evidence ID | null
business_before_controlled_slot_ref: redacted slot | null
business_before_bundle_object_ref: exact artifact-ref | null
business_before_actor_role: participant_operator | controller_operator | administrator_operator | null
business_before_source_class: participant_visual_observation | platform_run_log_redacted | machine_redacted_validator | null
business_before_observed_at: RFC3339-with-offset | null
business_before_capture_phases: ordered phase array | null
business_before_sequence_ordinal: 1..128 | null
business_before_native_audit_anchor_alias_digest: sha256 | null
business_before_summary: exact protected-business summary | null
business_before_digest: sha256 | null
business_after_evidence_id: evidence ID | null
business_after_controlled_slot_ref: redacted slot | null
business_after_bundle_object_ref: exact artifact-ref | null
business_after_actor_role: participant_operator | controller_operator | administrator_operator | null
business_after_source_class: participant_visual_observation | platform_run_log_redacted | machine_redacted_validator | null
business_after_observed_at: RFC3339-with-offset | null
business_after_capture_phases: ordered phase array | null
business_after_sequence_ordinal: 1..128 | null
business_after_native_audit_anchor_alias_digest: sha256 | null
business_after_summary: exact protected-business summary | null
business_after_digest: sha256 | null
cleanup_evidence_id: evidence ID | null
cleanup_controlled_slot_ref: redacted slot | null
cleanup_bundle_object_ref: exact artifact-ref | null
cleanup_actor_role: participant_operator | controller_operator | administrator_operator | null
cleanup_source_class: participant_visual_observation | platform_run_log_redacted | machine_redacted_validator | null
cleanup_observed_at: RFC3339-with-offset | null
cleanup_capture_phases: ordered phase array | null
cleanup_sequence_ordinal: 1..128 | null
cleanup_digest: sha256 | null
mutation_ledger_evidence_id: evidence ID | null
mutation_ledger_controlled_slot_ref: redacted slot | null
mutation_ledger_bundle_object_ref: exact artifact-ref | null
mutation_ledger_actor_role: participant_operator | controller_operator | administrator_operator | null
mutation_ledger_source_class: platform_change_audit_redacted | null
mutation_ledger_observed_at: RFC3339-with-offset | null
mutation_ledger_capture_phases: ordered phase array | null
mutation_ledger_sequence_ordinal: 1..128 | null
mutation_ledger_summary: exact mutation-ledger summary | null
mutation_ledger_digest: sha256 | null
fallback_results: ordered exact fallback-result array
```

四个固定 nullable evidence groups 使用 all-null/all-present IFF，不能出现孤立 object、summary、slot 或 digest：

- business-before 与 business-after 各自的 ID、slot、bundle object ref、actor、source、time、phases、sequence、native audit anchor alias、summary、digest 必须全 null 或全非空；
- cleanup 的 ID、slot、bundle object ref、actor、source、time、phases、sequence、digest 必须全 null 或全非空，并与 `cleanup.cleanup_observed` 严格 IFF；
- mutation-ledger 的 ID、slot、bundle object ref、actor、source、time、phases、sequence、summary、digest 必须全 null 或全非空；
- completed 一律要求 before、after、cleanup、mutation-ledger 四组全非空。blocked 只允许把已经完整观察且有实际 bundle content/receipt 的一组写成全非空，未观察或内容/receipt 不完整必须全 null。

evidence phase/source 语义固定为：parent state、四项前置与 business-before=`[before_action]`；first action=`[after_boundary]`；成功 attempt=`[after_boundary]`，失败或 unavailable 停点 attempt=`[failure]`；manual fallback=`[failure]`；cleanup、disabled-retention fallback、business-after 与 mutation ledger=`[cleanup]`。parent state 固定 machine/machine source；UI 观察与 participant confirmation 固定 participant/controller actor + participant visual source；额度、管理员配置和 cleanup 可由 administrator actor + participant visual source；trace 可取得的 attempt 固定 participant/controller/administrator actor + platform run-log source，trace unavailable 的停点 attempt 才允许 participant visual source；mutation ledger 只能使用 `platform_change_audit_redacted`，不能用普通 run log 或 participant 目测冒充完整变更窗口。machine validator 只能作为 parent-state 或额外独立 evidence，不能替代要求的现场来源；administrator 不能替代 participant confirmation。

`parent_state_at_first_action` 在首动作前冻结 P02/P03 前置状态，exact shape 为：

```text
state_projection: exact parent-state projection
evidence_id
controlled_slot_ref
bundle_object_ref: exact artifact-ref
actor_role = machine_validator
capture_source_class = machine_redacted_validator
observed_at
capture_phases = [before_action]
sequence_ordinal
source_results_content_sha256
source_onsite_content_sha256
state_digest
```

`parent-state projection` exact 为：

```text
{
  p02_parent_execution_status,
  p02_parent_result,
  p02_synthetic_test_allowed,
  p03_parent_execution_status,
  p03_prebuild_execution_status,
  p03_postbuild_execution_status
}
```

六个 projection 值的 exact 类型为：P02 parent、P03 parent、P03 prebuild、P03 postbuild 四个 execution status 均为 `not_tested | blocked | completed`；`p02_parent_result` 为 `可用 | 受限 | 不可用 | null`，且只有 P02 status=`completed` 时允许非 null；`p02_synthetic_test_allowed` 为 boolean。权威来源表固定为：P02 status/result 只读 results `/permission_probes/[unit_id=P02]/execution_status|result`；P03 parent 只读 results `/permission_probes/[unit_id=P03]/execution_status`；P03 prebuild/postbuild 只读 on-site `/permission_checks/[key=P03]/p03_phase_observations/prebuild_gate|postbuild_five_view_direct_table_recheck/execution_status`。`p02_synthetic_test_allowed=true` iff 两份 live 根 `fact_class=synthetic_experiment`、P02 status=`completed`、result 属于 `可用|受限`，且 P02 `preconditions_observed` 同时包含 exact token `data_scope=synthetic_experiment` 与 `enterprise_data_used=false`；缺一项固定 false。首动作 as-of 与验收 current projection 必须调用同一个 `p04-contract.mjs` source-table projector，禁止解析自由文本或由 proof 调用方直接提供映射结果。五个 gate 的唯一 derivation 为：`p02_completed iff P02 status=completed`、`p02_synthetic_test_allowed` 等于上述权威派生值、三个 P03 boolean 分别 iff 对应 status=`completed`。

`source_results_content_sha256/source_onsite_content_sha256` 必须分别绑定 challenge 前捕获的 `results_before_action` 与 `onsite_before_action` 两个 bundle snapshot 实际原始字节，并与 `pre_action_snapshots`、parent-state object 和 pre-action receipt 一致。`state_digest = SHA256("neoloop:p04-precondition-state-at-first-action:v1\0" || canonical_json({base_evidence_tuple,bundle_object_ref,source_results_content_sha256,source_onsite_content_sha256,state_projection}))`。该 entry 必须逐字段绑定 P04 v2 parent index、actual bundle object 与签名 pre-action receipt，时间和 sequence 均早于 first action。`precondition_gate` 的前五项只由这份不可变 as-of projection 重算；若首动作发生时 P02/P03 未满足，之后把当前状态改成 completed 也不能消除 incident。

`current_precondition_state_digest = SHA256("neoloop:p04-current-precondition-state:v1\0" || canonical_json(current exact parent-state projection))`，由 validator 在验收时直接从两份 live 文档重算。completed 同时要求 as-of projection 与 current projection 均满足 P02/P03 门；results/on-site 当前字段必须逐项相等。状态、result 或合成许可任一缺失、歧义、跨载体漂移或相对 as-of 非法洗白都失败，不能由 proof 自报。

`precondition_evidence` 是后四项现场前置观察的 ordered subset，固定合同顺序为 `ai_entry_available`、`quota_or_limit_entry_observed`、`quota_allows_minimum_probe`、`temporary_scope_confirmed`。每项 exact 为：

```text
gate_id
observed_value: boolean
evidence_id
controlled_slot_ref
bundle_object_ref: exact artifact-ref
actor_role
capture_source_class
observed_at
capture_phases
sequence_ordinal
gate_payload_digest
```

`gate_payload_digest = SHA256("neoloop:p04-precondition-gate:v1\0" || canonical_json({evidence_id,observed_at,actor_role,controlled_slot_ref,bundle_object_ref,capture_phases,capture_source_class,sequence_ordinal,redaction_checked:true,gate_id,observed_value}))`。每项都必须逐字段绑定 P04 v2 parent index、bundle actual object/content hash 与 capture receipt，evidence ID/slot/object 唯一。actor 只允许 participant/controller/administrator；administrator 可观察 AI entry、quota 和 temporary scope，但不能补签 participant confirmation。blocked 时，数组必须精确等于后四个 gate 中非 null 观察的投影；completed 时必须恰有四项且全部为 true。缺任一项不能进入 completed，未观察项不得伪造为 false。

sequence 顺序由 validator 校验：parent-state entry、实际存在的 precondition entries 与 business-before 均早于 first action；first action 始终使用独立 tuple。配置首动作且存在 attempt 时必须严格早于 attempt[0]；AI-run 首动作也必须严格早于 attempt[0]，只允许二者共享 run binding。attempt 按 global ordinal/sequence 严格递增。manual fallback result 晚于触发 attempt 且早于 cleanup；无 attempt 的 config-only fallback 晚于 first action；cleanup 晚于全部 attempt 和 manual fallback；disabled-retention fallback 晚于 cleanup；business-after 晚于 cleanup 与全部 fallback；mutation-ledger capture 晚于 business-after并绑定完整 before→after window。`observed_at` 必须与 sequence 同向非递减，但 sequence ordinal 是主判据，不能只靠事后时间文本排序。

`artifact-ref` 精确为 `{object_id,content_sha256}`，必须解析到固定 bundle manifest 中唯一 evidence object；manifest 的 artifact kind、evidence ID、slot、run binding、attempt identity 和实际成员字节摘要都必须与引用上下文一致。

每个 actual member 都是 exact 三键 JSON：`{schema_version:p04_evidence_object_member.v1,artifact_kind,payload}`。`p04-contract.mjs` 必须按 artifact kind 导出以下唯一 payload schema、nullable 规则和 summary projector；live validator 先校验 actual member，再从 payload 派生 proof summary，不能反向相信 proof 字段：

| artifact kind | exact payload |
| --- | --- |
| `parent_state` | `{state_projection,source_results_content_sha256,source_onsite_content_sha256}` |
| `precondition` | `{gate_id,observed_value}` |
| `first_action` | `{first_action_kind,challenge_digest,first_action_plan_digest,action_challenge_token_digest,attempt_challenge_token_digest:sha256|null,canonical_input_digest:sha256|null,platform_native_action_alias_digest,native_action_record_digest,platform_native_event_type,platform_native_event_time_alias_digest,run_binding_digest}`；配置首动作的 attempt token/input/run binding 为 null，AI-run 首动作三者非空；不复制 attempt 的 run/attempt alias |
| `attempt_start` | `{start_observed:true,attempt_identity_digest,challenge_digest,first_action_plan_digest,action_challenge_token_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_action_alias_digest,native_action_record_digest,platform_native_event_type,platform_native_event_time_alias_digest,platform_run_alias_digest,platform_native_attempt_alias_digest,platform_invocation_digest}`；刻意不含 `run_binding_digest`，start object 不随终态迁移而改写 |
| `run_trace` | `{attempt_identity_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_attempt_alias_digest,platform_invocation_digest,run_binding_digest,summary:exact run-trace summary}` |
| `envelope` | `{attempt_identity_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_attempt_alias_digest,platform_invocation_digest,run_binding_digest,envelope:exact canonical 14-field envelope}` |
| `audit` | `{attempt_identity_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_attempt_alias_digest,platform_invocation_digest,run_binding_digest,summary:exact audit summary}` |
| `business_before` / `business_after` | `{native_audit_anchor_alias_digest,summary:exact protected-business summary}` |
| `mutation_ledger` | 第 6.11 节 exact mutation-ledger actual object |
| `cleanup` | `{cleanup:exact cleanup object}` |
| `fallback_execution` | `{fallback_mode,trigger_evidence_digest,fallback_challenge_token_digest,native_artifact_identity_alias_digest,native_artifact_alias_digest,platform_native_fallback_event_alias_digest,platform_native_fallback_event_time_alias_digest,platform_native_fallback_event_kind,platform_native_fallback_transition_digest,actual_summary:exact mode-specific fallback execution summary}` |
| `fallback_confirmation` | `{fallback_mode,trigger_evidence_digest,fallback_challenge_token_digest,native_artifact_identity_alias_digest,native_artifact_alias_digest,platform_native_fallback_event_alias_digest,platform_native_fallback_event_time_alias_digest,platform_native_fallback_event_kind,platform_native_fallback_transition_digest,execution_digest,participant_acknowledged:true}` |

`artifact_kind` 必须与 manifest entry、artifact-ref 所在字段、capture receipt 的 metadata digest 三者相等；不同 kind 即使 payload shape 恰好相同也不能交换。所有 payload 均拒绝未知键、自由文本、raw run ID、资源 locator 和未列出的嵌套值。

每个 `attempt_evidence` 精确包含：

```text
global_ordinal: 1..32
scenario_id: n1_valid | n1_prompt_injection | n1_schema_failure_twice
scenario_attempt_ordinal: 1..32
attempt_state: started | terminal
evidence_id: evidence ID
controlled_slot_ref: redacted slot
attempt_start_bundle_object_ref: exact artifact-ref
actor_role: participant_operator | controller_operator | administrator_operator
capture_source_class: participant_visual_observation | platform_run_log_redacted
observed_at: RFC3339-with-offset
capture_phases: ordered phase array
sequence_ordinal: 1..128
challenge_digest: sha256
first_action_plan_digest: sha256
action_challenge_token_digest: sha256
attempt_challenge_token_digest: sha256
canonical_input_digest: sha256
platform_native_action_alias_digest: sha256
native_action_record_digest: sha256
platform_native_event_type: ai_run_start
platform_native_event_time_alias_digest: sha256
platform_run_alias_digest: sha256
platform_native_attempt_alias_digest: sha256
platform_invocation_digest: sha256
attempt_identity_digest: sha256
start_evidence_digest: sha256
run_binding_digest: sha256
node: N1
mode: default
version_label: N1-1.0.0-draft.2
prompt_schema_contract_sha256: sha256
version_digest: sha256
run_trace_state: pending | present | unavailable
run_trace_artifact_ref: exact artifact-ref | null
run_trace_summary: exact run-trace summary | null
run_trace_digest: sha256 | null
envelope_state: pending | present | unavailable
envelope_artifact_ref: exact artifact-ref | null
envelope_summary: exact envelope summary | null
envelope_digest: sha256 | null
audit_state: pending | present | unavailable
audit_artifact_ref: exact artifact-ref | null
audit_summary: exact audit summary | null
audit_digest: sha256 | null
outcome_code: ok | schema_invalid | needs_human | error | refused | null
```

三个 summary 的 exact shape 为：

```text
run_trace_summary = {
  run_binding_digest: sha256,
  run_status: succeeded | failed | refused | needs_human,
  attempt_no: 1..32,
  retry_ordinal: 0..31
}
envelope_summary = {
  run_binding_digest: sha256,
  status: ok | needs_human | error | refused,
  field_key_count: safe_count,
  field_key_set_digest: sha256,
  validation_valid: boolean,
  retry_count: safe_count,
  human_revision_state: none | pending
}
audit_summary = {
  run_binding_digest: sha256,
  attempt_no: 1..32,
  outcome_code: ok | schema_invalid | needs_human | error | refused,
  retry_scheduled: boolean,
  error_code: none | schema_invalid | provider_unavailable | provider_timeout | provider_refused | provider_protocol_error | unknown_provider_error
}
```

state=`present` iff 对应 artifact ref、summary 与 digest 均非空；state=`unavailable` iff 三者均为 null 且 attempt 已 terminal；state=`pending` iff 三者均为 null 且 attempt 仍 started。每个 present artifact ref 必须解析实际 bundle member，从成员内容重算 summary，而不是信任 proof 中的 summary。trace/envelope/audit summary 的 `run_binding_digest` 必须与 attempt 顶层同值，三个 artifact 还必须共享同一 attempt identity，禁止把不同 invocation 的三份 artifact 拼接。`attempt_state=started` 只允许出现在 `proof_stage=attempted` 的数组最后一项，三个 artifact state 必须全为 pending、outcome=null、后续 attempt 不存在；一旦取得任一终态观察，就必须迁移成 terminal 并按实际将各 artifact 标为 present/unavailable。completed 的 attempt 全为 terminal 且 outcome 非空。数组长度必须等于 `total_ai_attempt_count`，global ordinal 从 1 连续递增；按 scenario 计数必须和三个场景及 `attempt_totals` 完全守恒，audit/trace present 数必须分别等于 total audit/unique trace count。available/restricted 固定四项：valid 1、injection 1、schema failure 2，四个 run binding、platform invocation 与 attempt identity 必须两两不同。

parent-state、precondition、first action、attempt、business before、business after、mutation ledger、cleanup、fallback result 的 evidence ID/slot/bundle object 在全 proof 内必须唯一，不再允许 first action 复用 attempt tuple。`first_action_kind=ai_run_started` 时 first-action 与 attempt[0] 只允许共享 challenge、plan、batch/attempt token digest、canonical input digest、native-action alias、native-action-record 与 run-binding 八项语义绑定；不得共享 evidence ID、slot、artifact ref、sequence、platform run alias、native attempt alias、invocation 或 start digest。其他 run binding 与 attempt token 跨 attempt/场景复用一律失败；canonical input 只在 `p04-contract.mjs` 明确要求同一 synthetic input 的 schema retry 两项间允许相等，其他场景/输入必须按 fixture mapping不同。每个 artifact ref 只能由所属 attempt/kind 引用一次。

ordinal 映射固定为：每个 scenario 的 `scenario_attempt_ordinal` 从 1 连续递增；run-trace/audit `attempt_no == global_ordinal`。available/restricted 下 valid=(scenario ordinal 1,retry 0)、injection=(1,0)、schema failure=(1,0)/(2,1)；envelope `retry_count == run_trace.retry_ordinal`。unavailable 也必须从同一公式连续计数，不能跳号或倒序。`schema_failure.invalid_output_count` 等于该场景 `outcome_code=schema_invalid` 的 attempt 数；`repair_retry_count` 等于该场景 `retry_ordinal>0` 的 attempt 数；`total_attempt_count` 等于该场景 entries 长度；`audit_record_count` 等于该场景 `audit_state=present` 的数量；`final_status` 等于最后一项 outcome，completed 时不得为 `schema_invalid`。所有聚合值由 validator 重算。

attempt outcome 的固定映射为：valid 场景在平台原始结构有效时唯一项=`ok`，触发 `manual_structuring_required` 时唯一项=`schema_invalid` 且 `retry_scheduled=false`；安全 injection 唯一项=`ok`，`forbidden_capability_exposed` 时 outcome 仍按平台实际 `ok/error/refused` 记录但分类必须 unavailable；可用/受限的 schema failure 第 1 项=`schema_invalid` 且 `audit.retry_scheduled=true`，第 2 项与 `final_status` 同值且 `retry_scheduled=false`。只有 `scenario_id=n1_schema_failure_twice && scenario_attempt_ordinal=1 && outcome=schema_invalid` 可令 `retry_scheduled=true`；其他全部固定 false。attempt 的 node/mode/version、attempt_no、retry ordinal、outcome、run binding 和 error code 必须与三个 summary、实际 bundle artifacts 及场景聚合字段相互重算一致。

summary present 时还必须满足以下逐项真值表；unavailable summary 只按 stop-reason 表豁免对应列，不能改变其他 present 列：

| outcome_code | run_trace.run_status | envelope.status / validation | audit.outcome_code | audit.error_code | retry_scheduled |
| --- | --- | --- | --- | --- | --- |
| `ok` | `succeeded` | `ok / true` | `ok` | `none` | false |
| `schema_invalid` | `failed` | `error / false` | `schema_invalid` | `schema_invalid` | true iff schema-failure scenario ordinal=1；其他 false |
| `needs_human` | `needs_human` | `needs_human / false` | `needs_human` | `schema_invalid` | false |
| `error` | `failed` | `error / false` | `error` | one of five provider codes，或非 provider 失败时 `none` | false |
| `refused` | `refused` | `refused / true` | `refused` | `none` | false |

任一 present summary 与该表、global attempt number、retry ordinal 或场景聚合不一致都失败。provider exception 不得标成 `refused` 来隐藏 closed provider error；它固定走 `outcome_code=error` 并在 audit error_code 保留脱敏闭集。

source class 闭集为 `participant_visual_observation`、`platform_run_log_redacted`、`platform_change_audit_redacted`、`machine_redacted_validator`。每个 precondition/attempt/first-action/before/after/mutation-ledger/cleanup/fallback-result evidence tuple 必须与 canonical evidence indexes、bundle object 和 capture receipt 中同一唯一项逐字段对应；根层 `capture_source_classes` 必须等于这些绑定中实际 source class 的排序去重投影。available/restricted 至少同时包含 participant visual、platform run log 与 platform change audit；machine validator 只能用于 parent state 或额外独立验证，不能单独满足现场来源。unavailable 因 trace/structure 缺失时至少包含 participant visual 与对应失败 bundle object；若平台 change audit 无法取得，任何分类都只能保持 blocked。administrator actor 允许出现在 platform/config/cleanup 观察中，但不能把管理员确认转换成 participant confirmation。

available/restricted 的每个 attempt 必须同时有 envelope、trace 和 audit artifact ref/digest；unavailable 只有在 stop-reason 真值表允许时，才可使用对应 unavailable state，并逐行满足该表规定的已取得 artifact 与失败 evidence。`ai_run_unavailable_after_configuration` 明确豁免 attempt/trace/envelope/audit 摘要，因为 AI run 从未启动；其 fallback 由 first-action config evidence 触发。其他 stop reason 不使用笼统“另一侧摘要”规则，只按真值表的精确 present/unavailable 组合验收。所有 completed 要求 before/after/mutation-ledger/cleanup actual object 与 digest。`business_before_summary` 与 `business_after_summary` 必须 exact deep-equal；两个 artifact digest 分别绑定不同 evidence，不要求彼此相等。相等快照只证明窗口端点一致；只有 mutation ledger 同时证明窗口内 protected mutation count=0，才排除“写入后恢复”。

所有 artifact digest 都由 validator 从实际 bundle member 重新计算，禁止接受随机 SHA。下文的 `base evidence tuple` 精确为 `{evidence_id,controlled_slot_ref,bundle_object_ref,actor_role,capture_source_class,observed_at,capture_phases,sequence_ordinal}`，不包含任何目标 digest、summary、classification 或其他观察字段；用于计算 run binding 的 `attempt binding tuple` 则精确删除 `bundle_object_ref`，避免 attempt-start 内容摘要反向进入自身 run binding：

```text
run_binding_digest = SHA256("neoloop:p04-run-binding:v1\0" || canonical_json({attempt_identity_digest,challenge_digest,first_action_plan_digest,action_challenge_token_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_action_alias_digest,native_action_record_digest,platform_run_alias_digest,platform_native_attempt_alias_digest,platform_invocation_digest,attempt_binding_tuple}))
start_evidence_digest = SHA256("neoloop:p04-attempt-start:v1\0" || canonical_json({attempt_identity_digest,attempt_start_bundle_object_ref,base_evidence_tuple,run_binding_digest}))
run_trace_digest = SHA256("neoloop:p04-run-trace:v1\0" || canonical_json({attempt_identity_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_attempt_alias_digest,platform_invocation_digest,run_trace_artifact_ref,run_trace_summary}))
envelope_digest = SHA256("neoloop:p04-envelope:v1\0" || canonical_json({attempt_identity_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_attempt_alias_digest,platform_invocation_digest,envelope_artifact_ref,envelope_summary}))
audit_digest = SHA256("neoloop:p04-audit:v1\0" || canonical_json({attempt_identity_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_attempt_alias_digest,platform_invocation_digest,audit_artifact_ref,audit_summary}))
```

平台 capture adapter 必须在原生 action/change-event ID、run ID 与原生 attempt/call ID（或平台单调 sequence）进入通用 proof 前完成下列别名化；`length_prefixed(bytes)` 固定为 `uint32be(byte_length)||bytes`，长度超过 `2^32-1` 或空值（合同明确允许 null 的字段除外）失败。立即生成 `platform_native_action_alias_digest = SHA256("neoloop:p04-platform-native-action-alias:v1\0" || length_prefixed(raw_native_action_or_change_event_id_bytes) || challenge_nonce_raw_32_bytes)`、`platform_run_alias_digest = SHA256("neoloop:p04-platform-run-alias:v1\0" || length_prefixed(raw_platform_run_id_bytes) || challenge_nonce_raw_32_bytes)` 与 `platform_native_attempt_alias_digest = SHA256("neoloop:p04-platform-native-attempt-alias:v1\0" || length_prefixed(raw_platform_run_id_bytes) || length_prefixed(raw_native_attempt_or_call_id_bytes) || challenge_nonce_raw_32_bytes)`；因此即使 attempt/call ID 只在 run 内唯一也不会跨 run 碰撞。`platform_native_event_time_alias_digest = SHA256("neoloop:p04-platform-native-event-time-alias:v1\0" || length_prefixed(raw_platform_event_time_bytes) || challenge_nonce_raw_32_bytes)`。随后丢弃所有 raw 值，原始值不得进入 bundle、日志或报告。

`native_action_record_digest = SHA256("neoloop:p04-native-action-record:v1\0" || canonical_json({action_challenge_token_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_action_alias_digest,platform_run_alias_digest,platform_native_attempt_alias_digest,platform_native_event_type,platform_native_event_time_alias_digest}))`，其中 event type 闭集为 `temporary_configuration_change | ai_run_start`；配置首动作的 attempt token/input/run/attempt alias 固定 null，但 native-action alias/time 非空，AI run 全部非空。`platform_invocation_digest = SHA256("neoloop:p04-platform-invocation:v1\0" || canonical_json({platform_native_action_alias_digest,platform_run_alias_digest,platform_native_attempt_alias_digest,native_action_record_digest,action_challenge_token_digest,attempt_challenge_token_digest,canonical_input_digest,challenge_digest,first_action_plan_digest,global_ordinal,scenario_id,scenario_attempt_ordinal}))`。同一 raw run ID 不能通过不同 proof ordinal 伪装成不同 attempt；`attempt_evidence` 中全部非空 native-attempt alias 必须两两不同，适用于 available、restricted 与任何 unavailable attempt 数量。若平台不提供可在 capture 时取得、首动作原生回显 batch token、每个 attempt 原生回显它自己的 attempt token、且可由签名 receipt 封存的 action/run/attempt 身份，现场 proof 只能保持 blocked，不能用随机 alias 补位。

`attempt identity` 精确为 `{global_ordinal,scenario_id,scenario_attempt_ordinal,node,mode,version_label,prompt_schema_contract_sha256,version_digest,challenge_digest,first_action_plan_digest,action_challenge_token_digest,attempt_challenge_token_digest,canonical_input_digest,platform_native_action_alias_digest,native_action_record_digest,platform_native_event_type,platform_native_event_time_alias_digest,platform_run_alias_digest,platform_native_attempt_alias_digest,platform_invocation_digest}`；`attempt_identity_digest = SHA256("neoloop:p04-attempt-identity:v1\0" || canonical_json(attempt_identity))`。`attempt_evidence` 中全部 attempt 的 binding tuple/object、attempt token、native-attempt alias、run binding、platform invocation 与 attempt identity 必须两两不同；canonical input 按上一段的 fixture mapping判定，不作为无条件唯一字段。trace/envelope/audit 实际 member 的 allowlisted 内容必须各自携带相同 attempt token、canonical input、run binding、native attempt alias、platform invocation 与 attempt-identity digest；只在 proof summary 中复制同一 SHA 不构成同一 invocation。

两种 first action 都使用独立域：`first_action_digest = SHA256("neoloop:p04-first-action:v1\0" || canonical_json({probe_start_without_first_action_evidence_digest_and_run_binding,base_evidence_tuple,first_action_run_binding_digest}))`。配置首动作 run binding 为 null；AI-run 首动作只共享 attempt[0] 的 run binding，不复用其 tuple、object 或 start digest。其余公式固定为：

```text
business_before_digest = SHA256("neoloop:p04-business-before:v1\0" || canonical_json({base_evidence_tuple,native_audit_anchor_alias_digest,business_before_summary}))
business_after_digest = SHA256("neoloop:p04-business-after:v1\0" || canonical_json({base_evidence_tuple,native_audit_anchor_alias_digest,business_after_summary}))
mutation_ledger_digest = SHA256("neoloop:p04-mutation-ledger:v1\0" || canonical_json({base_evidence_tuple,mutation_ledger_summary}))
cleanup_digest = SHA256("neoloop:p04-cleanup:v1\0" || canonical_json({base_evidence_tuple,cleanup}))
```

上述任何 preimage 都不得包含其目标 digest 本身、proof digest 或 parent union。唯一允许的跨域边为 `business-before/business-after digest → mutation_ledger_summary → mutation_ledger_digest`，before/after preimage 不得反向包含 ledger 字段。`parent_evidence_ids` 和 `controlled_slot_refs` 必须精确等于 parent-state、precondition、first action、attempt、before/after、mutation ledger、cleanup、fallback results 所有非空绑定的排序去重并集；bundle object refs 与 capture receipts 也必须形成相同集合投影。

`mutation-ledger summary` 精确为：

```text
ledger_window_status: complete | partial
window_before_evidence_id: evidence ID
window_before_digest: sha256
window_before_sequence_ordinal: 1..128
window_before_evidence_object_metadata_digest: sha256
window_after_evidence_id: evidence ID
window_after_digest: sha256
window_after_sequence_ordinal: 1..128
window_after_evidence_object_metadata_digest: sha256
protected_scope_digest: sha256
coverage_start_anchor_digest: sha256
coverage_end_anchor_digest: sha256
first_page_cursor_alias_digest: sha256
last_page_cursor_alias_digest: sha256
page_count: 1..32
event_count: safe_count
page_chain_digest: sha256
chain_complete: boolean
audit_query_receipt_digest: sha256
protected_mutation_count: safe_count
restored_protected_mutation_count: safe_count
write_then_restore_detected: boolean
```

`mutation-ledger` actual object exact 为：

```text
{
  challenge_digest,
  ledger_window_status: complete | partial,
  window_binding: {
    window_before_evidence_id,
    window_before_digest,
    window_before_sequence_ordinal,
    window_before_evidence_object_metadata_digest,
    window_after_evidence_id,
    window_after_digest,
    window_after_sequence_ordinal,
    window_after_evidence_object_metadata_digest
  },
  coverage_start_anchor_digest,
  coverage_end_anchor_digest,
  protected_scope_digest,
  audit_query_receipt: exact signed audit-query receipt,
  pages: ordered [{
    page_ordinal,
    request_cursor_alias_digest,
    next_cursor_alias_digest: sha256 | null,
    events: ordered [{
      event_ordinal,
      synthetic_alias,
      field_class: status | owner | relation | automation,
      mutation_kind: create | update | delete,
      before_value_digest: sha256 | null,
      after_value_digest: sha256 | null,
      event_digest
    }],
    page_digest
  }],
  page_chain_digest,
  chain_complete
}
```

raw audit cursor 和平台 anchor 只在 capture adapter 内短暂存在；business-before/after 在各自原子快照时必须同时取得平台原生 audit anchor，并保存 `native_audit_anchor_alias_digest = SHA256("neoloop:p04-business-snapshot-audit-anchor:v1\0" || length_prefixed(raw_snapshot_audit_anchor_bytes) || challenge_nonce_raw_32_bytes)`。mutation ledger 的 `coverage_start_anchor_digest/coverage_end_anchor_digest` 必须分别 exact 等于 before/after actual member 中的该 alias；若平台不能把业务快照与 audit query 首尾锚绑定，只能保持 blocked。cursor alias 使用独立 `change-audit-cursor` domain 与 challenge nonce，首请求以固定 `START` sentinel 作为 raw bytes，原值不得落盘。`event_digest = SHA256("neoloop:p04-change-event:v1\0" || canonical_json(event_without_event_digest))`；`page_digest = SHA256("neoloop:p04-change-audit-page:v1\0" || canonical_json({page_ordinal,request_cursor_alias_digest,next_cursor_alias_digest,event_digests}))`；`page_chain_digest = SHA256("neoloop:p04-change-audit-chain:v1\0" || canonical_json({coverage_start_anchor_digest,coverage_end_anchor_digest,protected_scope_digest,ordered_page_digests}))`。page ordinal 从 1 连续递增，后一页 request cursor alias 必须等于前页 next cursor alias，末页 next=null，所有 event ordinal 全局连续；summary 的 page/event/count/digest 全由 actual object 重算。

`audit-query receipt` exact 为 `{schema_version:p04_audit_query_receipt.v1,challenge_digest,window_before_evidence_object_metadata_digest,window_after_evidence_object_metadata_digest,coverage_start_anchor_digest,coverage_end_anchor_digest,platform_native_start_sequence_alias_digest,platform_native_end_sequence_alias_digest,query_filter_digest,protected_scope_digest,total_event_count,page_count,has_more:false,page_chain_digest,signer_key_id,receipt_digest,ed25519_signature}`。`query_filter_digest = SHA256("neoloop:p04-audit-query-filter:v1\0" || canonical_json(p04-contract.mjs 导出的 exact {read_only:true,protected_scope_digest,coverage_start_anchor_digest,coverage_end_anchor_digest,pagination_mode:all_pages}))`；receipt signer 的 purpose 必须为 `audit_query`，signature 对 `receipt_digest` raw 32 bytes。`receipt_digest = SHA256("neoloop:p04-audit-query-receipt:v1\0" || canonical_json(receipt_without_receipt_digest_and_signature))`。平台 start/end sequence/time/cursor 原值只在 capture adapter 内存在并 nonce 化；平台没有不可变首尾 anchor、完整分页/`has_more=false`、或无法把查询窗口绑定当前 before/after metadata 时保持 blocked。

`protected_scope_digest = SHA256("neoloop:p04-protected-business-scope:v1\0" || canonical_json(p04-contract.mjs 导出的受保护表/字段闭集))`。`protected_value_digest = SHA256("neoloop:p04-protected-normalized-value:v1\0" || canonical_json(p04-contract.mjs 按 field_class 导出的 exact normalized allowlisted value))`；business-before/after projector必须给每个 `synthetic_alias+field_class` 形成唯一 baseline/final value digest。validator 只能从 actual object 投影 ledger summary：window 八个 binding 字段逐项相等；before/after native audit anchor分别 exact等于 coverage start/end；receipt 的 challenge/window metadata/anchor/filter/scope/count/page/chain 与 actual object exact deep-equal；`page_count == pages.length`、`event_count == Σ pages.events.length == audit_query_receipt.total_event_count`、`protected_mutation_count == event_count`。对每个 alias+field class，首个 event 的 before digest必须等于 business-before baseline，相邻 event 的 after必须等于下一 event 的 before，末个 event 的 after必须等于 business-after final；缺口、乱序或未知值失败。`restored_protected_mutation_count` 只从该连续链中统计“发生写入且最终回到 baseline”的唯一 alias+field-class 对，且 `0 <= restored <= protected_mutation_count`；`write_then_restore_detected iff restored_protected_mutation_count > 0`。`ledger_window_status=complete` iff receipt/signature、before/after binding与native anchors、filter/scope、全页 cursor/count/chain、`has_more=false`及value chain全部有效；否则只能在 blocked proof 中为 `partial`，completed不可使用。安全边界对象中的 `platform_mutation_ledger_observed/mutation_window_complete/protected_business_mutation_count/write_then_restore_detected` 必须逐项等于该 projector，不能另行填写。

completed 要求 window before/after 的 ID、digest、sequence 与 metadata digest 分别与 business-before/after binding exact equal，ledger window=`complete`、coverage anchors 分别覆盖当前 before→after、scope digest 等于权威值、receipt 有效、page chain 完整、event count 与两个 mutation count均为 0、write-then-restore=false。ledger actual object 必须来自平台原生变更/审计记录的脱敏捕获并覆盖完整窗口；只有 before/after 相等、普通 run log、participant 目测或调用方自报零计数均失败。平台无法提供完整 anchor/cursor/page chain/query receipt 时必须保持 blocked，不能降格为 completed/unavailable。

`protected-business summary` 精确为：

```text
synthetic_record_count: safe_count
status_counts: sorted unique [{status: 待补充 | 待关联 | 待派单 | 处理中 | 待验证 | 待回访 | 已关闭 | 已合并, count: safe_count}]
record_state_entries: ordered unique [{synthetic_alias, status, owner_alias: safe synthetic owner alias | null, relation_aliases: sorted unique safe synthetic alias array}]
owner_assigned_count: safe_count
relation_count: safe_count
automation_state_entries: ordered unique [{automation_alias: safe synthetic automation alias, enabled: boolean}]
automation_enabled_count: safe_count
```

record、owner、relation 与 automation alias 只能来自本次 P04 scenario fixture manifest 中由 `p04-contract.mjs` 导出的四个非敏感、两两不交叠闭集；四个 alias domain 固定使用不同安全前缀 `synrec-`、`synown-`、`synrel-`、`synauto-`，任何跨 domain 值复用或把 alias 当作飞书资源 ID 都失败。entries 按 alias 排序且 alias 唯一。`record_state_entries.length == synthetic_record_count`，record alias 集必须与授权闭集 exact deep-equal；before/after 的 record、owner、relation 与 automation alias 集也必须彼此 exact deep-equal，不允许遗漏或交换发生变化的对象。`status_counts` 固定包含上述八种状态各一次（允许 count=0），其总和必须等于 synthetic record count；owner assigned count 由非 null owner alias 数量求和，relation count 由所有 relation alias array 长度求和，automation enabled count 由 automation entries 的 enabled=true 数量求和。before/after summary 必须 exact deep-equal，两个 digest 分别由相同 normalized summary 与各自独立、非复用的 before/after evidence ID/slot/source/object binding 重算；不允许只提交相等的随机 SHA，也不得用同一 evidence ID/object 同时冒充前后观察。

`fallback_results` 按第 6.10 节 derived mode 合同顺序排列，每个 mode 精确一项：

```text
fallback_mode: manual_structuring | manual_human_routing | manual_intake | disabled_configuration_retention
execution: exact fallback-execution entry | null
confirmation: exact fallback-confirmation entry | null
verified: boolean
fallback_result_digest: sha256 | null
```

`fallback-execution entry` exact 为 `{evidence_id,controlled_slot_ref,bundle_object_ref,actor_role:controller_operator|administrator_operator,capture_source_class:participant_visual_observation|platform_run_log_redacted|platform_change_audit_redacted,observed_at,capture_phases,sequence_ordinal,trigger_evidence_digest,fallback_challenge_token_digest,native_artifact_identity_alias_digest,native_artifact_alias_digest,platform_native_fallback_event_alias_digest,platform_native_fallback_event_time_alias_digest,platform_native_fallback_event_kind,platform_native_fallback_transition_digest,actual_summary,execution_digest}`。对每个 derived mode，capture adapter 在触发失败/清理 evidence 已封存后先计算 `fallback_challenge_token_raw = SHA256("neoloop:p04-fallback-challenge-token:v1\0" || action_challenge_token_raw_32_bytes || length_prefixed_utf8(fallback_mode) || trigger_evidence_digest_raw_32_bytes || uint32be(sequence_ordinal))`，只把 raw token 写入本 mode 的原生人工工件创建/状态变更请求。平台不可变 artifact 与同一对象的 change-event 必须同时原生回显该 token 与同一个 raw native artifact identity；`native_artifact_identity_alias_digest = SHA256("neoloop:p04-fallback-native-artifact-identity-alias:v1\0" || length_prefixed(raw_native_artifact_identity) || challenge_nonce_raw_32_bytes)`，二者投影必须 exact 相等。持久层只保存 token digest 与 identity alias。`native_artifact_alias_digest = SHA256("neoloop:p04-fallback-native-artifact-alias:v1\0" || raw_mode_specific_artifact_bytes || raw_native_artifact_identity || challenge_nonce_raw_32_bytes)`，原生 event ID/time 分别用 `p04-fallback-native-event-alias` / `p04-fallback-native-event-time-alias` domain 与 challenge nonce 长度前缀化后得到两个 event alias。raw token/artifact identity/artifact/event/time 只在 capture adapter 内短暂存在。

`platform_native_fallback_event_kind` 与 transition 使用 mode-specific 唯一 IFF：`manual_structuring=manual_envelope_created + absent→created`、`manual_human_routing=handoff_accepted + pending→acknowledged`、`manual_intake=intake_accepted + pending→acknowledged`、`disabled_configuration_retention=configuration_disabled + enabled→disabled`。`platform_native_fallback_transition_digest = SHA256("neoloop:p04-fallback-native-transition:v1\0" || canonical_json({fallback_mode,native_artifact_identity_alias_digest,event_kind,before_state,after_state}))`。fallback-execution actual JSON、签名 capture receipt 与 mode-specific summary 必须共同绑定 trigger、token、同一 native identity、artifact、event/time kind 与 transition；原生 event 序列必须晚于 trigger attempt/cleanup 且早于 participant confirmation。旧 artifact 用新 nonce 重新 alias、artifact A 与 event B 拼接、无 mode-specific transition、可编辑备注、无 token echo 或无不可变 event/time 时均保持 `verified=false`/blocked。四种 `actual_summary` 使用互斥 exact shape：

- `manual_structuring`：`{platform_structured_output_valid:false,manual_envelope_key_set_digest,manual_envelope_valid:true,downstream_continued:false,business_write_count:0}`；
- `manual_human_routing`：`{handoff_acknowledged:true,downstream_continued:false,business_write_count:0}`；
- `manual_intake`：`{intake_acknowledged:true,downstream_continued:false,business_write_count:0}`；
- `disabled_configuration_retention`：`{configuration_disabled:true,retention_reason_code:platform_requires_retention|audit_retention_required,business_write_count:0}`。

`fallback-confirmation entry` exact 为 `{evidence_id,controlled_slot_ref,bundle_object_ref,actor_role:participant_operator,capture_source_class:participant_visual_observation,observed_at,capture_phases,sequence_ordinal,trigger_evidence_digest,fallback_challenge_token_digest,native_artifact_identity_alias_digest,native_artifact_alias_digest,platform_native_fallback_event_alias_digest,platform_native_fallback_event_time_alias_digest,platform_native_fallback_event_kind,platform_native_fallback_transition_digest,execution_digest,participant_acknowledged:true,confirmation_digest}`。execution 与 confirmation 必须使用不同 evidence ID、slot、object、sequence、capture receipt 与 `signer_key_id`；execution signer purpose=`fallback_execution`，confirmation purpose=`fallback_confirmation`，且两把 key 的 release-root allowlist 角色集合不得重叠。confirmation 必须晚于 execution，并把同一 trigger/token/native identity/artifact/event/time/kind/transition 与 execution digest 写入受控 JSON payload。管理员、machine validator、同一 signer 或同一对象不能替代独立 participant confirmation。

fallback 推导顺序固定为：先从平台原始 observation 重算 limitation/stop reason，再得到 `derived_fallback_modes`，再要求 `fallback_results[].fallback_mode` 与其一一对应，最后计算 `fallback_verified`；任何后续步骤不得反向修改前一步。blocked 时，尚未执行的 mode 固定 `execution=null,confirmation=null,verified=false,digest=null`；已执行一半时只允许写入已经取得且有 actual object/receipt 的完整 nested entry。completed 时每个 mode 的 execution 与 confirmation 都必须非空、actual summary 满足对应唯一谓词且 confirmation acknowledged=true，否则 `verified=false`。

不同 fallback mode 的非空 execution `native_artifact_identity_alias_digest`、`native_artifact_alias_digest` 与 `platform_native_fallback_event_alias_digest` 三组都必须各自两两不同；confirmation 的 identity/artifact/event aliases 只能分别等于本 mode execution，且不得等于其他 mode 的 execution 或 confirmation aliases。即使内容变化、evidence ID、slot、object 与 signer 都不同，也不能复用同一个原生人工工件或同一原生 event 重签后冒充多个 fallback mode。

`execution_digest = SHA256("neoloop:p04-fallback-execution:v1\0" || canonical_json({base_evidence_tuple,fallback_mode,trigger_evidence_digest,fallback_challenge_token_digest,native_artifact_identity_alias_digest,native_artifact_alias_digest,platform_native_fallback_event_alias_digest,platform_native_fallback_event_time_alias_digest,platform_native_fallback_event_kind,platform_native_fallback_transition_digest,actual_summary}))`；`confirmation_digest = SHA256("neoloop:p04-fallback-confirmation:v1\0" || canonical_json({base_evidence_tuple,fallback_mode,trigger_evidence_digest,fallback_challenge_token_digest,native_artifact_identity_alias_digest,native_artifact_alias_digest,platform_native_fallback_event_alias_digest,platform_native_fallback_event_time_alias_digest,platform_native_fallback_event_kind,platform_native_fallback_transition_digest,execution_digest,participant_acknowledged:true}))`；`fallback_result_digest = SHA256("neoloop:p04-fallback-result:v1\0" || canonical_json({fallback_mode,execution_digest,confirmation_digest,verified,limitation_codes,stop_reason_code}))`。各 preimage 排除自身目标 digest。partial/complete nullable 真值表固定为：`execution=null,confirmation=null => verified=false,result_digest=null`；`execution!=null,confirmation=null => verified=false,result_digest=null`；`execution=null,confirmation!=null => 非法`；两者非空时才按唯一谓词派生 verified，并要求 result digest 非空。`fallback_verified=true` iff modes 非空、results 一一对应且每项 verified；每个 nested tuple/object 必须加入 parent ID/slot/object union 并全局唯一。manual execution/confirmation phase=`[failure]`；disabled-retention execution/confirmation phase=`[cleanup]`。modes 为空时 results 必须为空且 fallback=false。

typed proof 与 digest 只能证明现场文档之间的绑定。v1 live validator 不把任何 source class 外推为浏览器或平台事实的机器证明，`observation_truth_machine_verified` 固定为 false。

## 7. 离线 readiness 报告

新增派生报告，不新增人工维护的 readiness JSON，也不成为第四套状态真值。

仓库内 candidate 入口与测试：

- `feishu/scripts/report-p04-readiness.mjs`
- `tests/core/p04-readiness-report.test.mjs`

用户可交付入口是第 7.2 节工作区外 trusted launcher；`report-p04-readiness.mjs` 在受信路径中只作为 captured pure serializer，由 stage0 在收到 stage1 terminal result 后动态加载，不启动子进程、场景或 trust flow。其 CLI guard 被直接运行时固定输出 failure envelope，不能形成 passed evidence；本地 candidate 只能由测试直接调用同一个生产 readiness harness/serializer API 得到，不得复制 fixture 构造或解析测试输出。整个 harness 只运行本地冻结的合成夹具、读取 captured manifest/live 状态；不得调用网络、飞书、CLI、provider 或真实数据源。

### 7.1 exact report

根对象精确包含：

```text
schema_version
scope
fact_class
validation_status
p04_live_state
source_bindings
execution_attestation
scenario_summaries
hardening_results
live_validator_results
fixture_execution_receipts
local_contract_results
onsite_gaps
report_digest
issue_codes
```

固定根值：

```text
schema_version = p04_readiness_report.v1
scope = P04_local_readiness_only
fact_class = synthetic_experiment
validation_status = passed
```

`p04_live_state` exact shape：

```text
execution_status = not_tested
result_is_null = true
actual_proof_present = false
live_bundle_stage = absent
may_advance_live_status = false
```

readiness 只能读取并绑定当前 live 状态，不能改写或推导下一状态。

### 7.2 source 与执行绑定

`source_bindings` exact shape：

```text
source_manifest: ordered manifest-entry array
source_bundle_sha256
scenario_fixture_manifest: ordered fixture-entry array
scenario_fixture_bundle_sha256
hardening_fixture_manifest: ordered fixture-entry array
hardening_fixture_bundle_sha256
live_validator_fixture_manifest: ordered fixture-entry array
live_validator_fixture_bundle_sha256
compiler_manifest: ordered manifest-entry array
compiler_input_sha256
compiler_read_receipt: exact compiler-read receipt
compiler_read_receipt_sha256
compiled_output_manifest: ordered manifest-entry array
compiled_output_sha256
runtime_metadata: exact runtime-metadata object
runtime_metadata_sha256
runtime_freeze_receipt: exact launcher-signed runtime-freeze receipt
runtime_freeze_receipt_sha256
runtime_loaded_manifest: ordered manifest-entry array
runtime_loaded_sha256
harness_runtime_loaded_receipts: ordered exact child-load receipt array
harness_runtime_loaded_sha256
contract_manifest: ordered manifest-entry array
manifest_bundle_sha256
validator_manifest: ordered manifest-entry array
validator_bundle_sha256
freeze_attestation_manifest: ordered manifest-entry array
freeze_attestation_bundle_sha256
release_manifest_sha256
release_root_manifest_sha256
release_root_signature_sha256
external_approver_key_fingerprint_sha256
external_launcher_contract_sha256
live_state_snapshot_sha256
stage0_entry_sha256
permission_profile_template_sha256
stage0_permission_profile_instantiation: exact stage0 permission-instantiation object
stage0_permission_profile_instantiation_sha256
permission_instantiation_receipts: ordered exact prepared/commit receipt-pair array
permission_instantiation_receipt_bundle_sha256
```

`manifest-entry` 精确为 `{relative_path,sha256}`，按 UTF-8 relative path 升序且 path 唯一；`fixture-entry` 精确为 `{fixture_id,relative_path,sha256,expected_seed_operation_count,seed_plan,seed_plan_sha256}`，其中 relative path 固定、大小写精确且全局唯一，非 W6 fixture 固定 count=0、plan=[]，四个 W6/N5 scenario 的 plan 由 `p04-contract.mjs` 冻结。每个 fixture 必须对应第 12.1 节唯一 canonical JSON 文件；该文件 raw bytes 必须逐字等于 `canonical_json(exact synthetic fixture)` 且没有 BOM、缩进或尾随换行，因此 raw file SHA 与 fixture-entry SHA 使用同一份 bytes。launcher 在复制前对原文件执行同一 descriptor 上的 `lstat → open(O_NOFOLLOW) → fstat → read → fstat`，要求大小写精确、普通文件、owner/mode 合格、`st_nlink===1` 且前后 dev/ino/size/mtime/ctime 不变；复制后只使用 snapshot bytes。三类 fixture 目录的实际普通文件成员集合必须分别与三份 signed manifest 的 relative-path 投影 exact deep-equal，不允许隐藏文件、额外文件、缺项、别名、symlink、hardlink 或同一 fixture ID 映射多个路径。`seed_plan` 每项 exact 为 `{ordinal,public_operation_id,input_sha256,expected_outcome_code}`，ordinal 连续且 operation/outcome 来自闭集；`seed_plan_sha256 = SHA256("neoloop:p04-seed-plan:v1\0" || canonical_json(seed_plan))`。所有 digest 均为 lowercase SHA-256。

manifest 成员与生成规则冻结如下：

- source manifest 包含根 `package.json`、`package-lock.json`、P04 专属 `feishu/runtime/p04/package.json`、`feishu/scripts/report-p04-readiness.mjs`、stage0/stage1/worker、`p04-runtime-bootstrap.mjs`、`p04-compiler-runner.mjs`、`feishu/scripts/lib/p04-redacted-io.mjs`、`feishu/scripts/lib/p04-contract.mjs`、`feishu/scripts/validate-live-p04-evidence.mjs`，并从 `src/neoloop/evidence/p04-readiness.ts`、`src/neoloop/evidence/p04-instrumented-w6-fixture-repository.ts`、`src/neoloop/ai/runner.ts`、`src/neoloop/ai/scripted-fake.ts`、`src/neoloop/contracts/ports.ts` 与公开 W6 repository 入口出发，经 TypeScript module resolution 得到完整本地 transitive import closure；根 package/lock 只绑定当前依赖图，P04 运行时 engine/module boundary 的唯一权威是专属 package；未知、动态、网络或工作区外 import 直接失败；
- scenario fixture manifest 固定第 7.3 节七个 scenario ID 的合同顺序，各自只绑定一个 exact synthetic fixture；
- hardening fixture manifest 固定第 7.3 节 6 个 provider case + 3 个 scope guard case 的合同顺序，各自只绑定一个 exact synthetic fixture；
- live-validator fixture manifest 固定由 `p04-contract.mjs` 导出的显式 fixture ID 列表：当前 `not_tested`、普通 blocked、`cleanup_incomplete` blocked、available、restricted、六种 completed/unavailable，以及 bundle/content hash、challenge/receipt/signature、run binding/artifact refs、mutation ledger、fallback results、alias domain、exact-field 与跨字段 invariant mutation corpus；positive fixtures 在前，mutation IDs 按 UTF-8 升序。测试临时对象、legacy snapshot、现场 evidence 和未列名 fixture 不得加入；
- compiler manifest 包含本次实际执行所读取的 bootstrap、compiler runner/TypeScript compiler JS、全部 captured TypeScript source、TypeScript lib、类型声明、P04 专属 runtime `package.json`、必要的根 package/lock resolution metadata 与 `tsconfig.p04-readiness.json`；source 与 compiler manifest 允许有相同 source member，但各自 bundle 独立复算。该 tsconfig 固定 NodeNext module/moduleResolution、ES2022 target、strict/noEmitOnError，并只允许 snapshot rootDir/outDir。`compiler_read_receipt` exact 为 `{schema_version:p04_compiler_read_receipt.v1,compiler_module_loaded_manifest,compiler_resolution_metadata_read_manifest,compiler_host_read_manifest,compiler_host_unique_read_count,compiler_manifest_union_sha256,receipt_sha256}`：launcher prepared/commit receipt 单独绑定 bootstrap，因为 bootstrap 在 hook 安装前已由 Node 加载；同步 registerHooks 只记录安装后的 compiler runner/TypeScript modules；compiler runner 通过受控 read wrapper 显式读取 package-resolution metadata；custom ParseConfigHost+CompilerHost 捕获 tsconfig/source/lib/type semantic reads。三个 manifest 都按 path 排序去重、成员互斥，`compiler_host_unique_read_count` 是 `0..65535` 的安全整数且 exact 等于 `compiler_host_read_manifest.length`；union 与 signed compiler manifest 扣除由 launcher receipt 单独绑定的 bootstrap entry 后 exact deep-equal；`compiler_manifest_union_sha256 = SHA256("neoloop:p04-compiler-read-manifest-union:v1\0" || canonical_json(sort_unique(三个 manifest)))`。`receipt_sha256 = SHA256("neoloop:p04-compiler-read-receipt:v1\0" || canonical_json(receipt_without_receipt_sha256))`，完整 receipt 随 report 输出，调用方可独立重算；
- compiled output manifest 包含 compiler 本次产生的全部 emitted JS；runtime loaded manifest 由 scenario 受控 loader 记录实际 import 的 emitted JS，必须是 output manifest 的非空受控子集；任一 loaded module 不在 output manifest、或 readiness TypeScript 入口的 transitive runtime dependency 未 loaded，都失败；
- harness runtime loaded receipts 由 stage0 汇总 captured stage1 与各 scenario worker 的 digest-linked load receipt 形成，记录它们在 bootstrap 同步 hook 安装后实际加载的 captured JS/MJS；每份 receipt exact 为 `{spawn_ordinal,child_role,fixture_id:null|fixture_id,entry_sha256,runtime_bootstrap_sha256,loaded_manifest,loaded_sha256,permission_profile_template_sha256,permission_commit_receipt_sha256,receipt_sha256}`，其中 `loaded_sha256 = SHA256("neoloop:p04-child-loaded-manifest:v1\0" || canonical_json(loaded_manifest))`，`receipt_sha256 = SHA256("neoloop:p04-child-load-receipt:v1\0" || canonical_json(receipt_without_receipt_sha256))`。各 child manifest 先各自排序去重；`harness_runtime_loaded_receipts` 就是按 spawn ordinal 排列的完整 receipt 数组，不把不同 child 的同名模块静默去重。bootstrap 在 hook 安装前加载，因此只由 prepared/commit pair 的 `bootstrap_sha256` 绑定，不得伪装成 hook 观察项。stage0 根据 child IPC、对应 launcher commit receipt 和 captured bytes形成。
- launcher 从 captured snapshot 为 stage1 与 worker 分别建立只读 `captured_stage1_harness_tree` / `captured_worker_harness_tree`；每棵树的 actual `directory_manifest` 是 source/contract manifest 中该 role 入口、共享安全 IO、P04 contract authority、live validator/fixture adapter（仅按 role 必需）及其本地传递依赖的 exact 投影，bootstrap bytes可位于树中但不进入 hook-observed loaded manifest。prepared receipt 必须绑定该树的完整 directory manifest/content digest；loaded manifest 必须是对应树的受控子集并 exact 覆盖 `p04-contract.mjs` 导出的 role-specific mandatory runtime graph。stage0 与报告 CLI 在 stage1/worker 之外执行，禁止写入该 loaded receipt 数组冒充由 child 加载；它们的实际入口字节分别通过 `stage0_entry_sha256`、source manifest 和 external signed release root 绑定。缺任一 child mandatory entry、加载未捕获模块、只在 tree manifest 中声明却未实际加载，或把 bootstrap/stage0/报告 CLI 错列为 hook-observed child-loaded，都失败；
- contract manifest 固定包含本规格、P04 probe suite、result example、on-site template、不可变 `p04-live-evidence-bundle-schema.example.json`、acceptance、matrix、external-launcher contract、`p04-contract.mjs` 和 live validator；实际 mutable `bundle-manifest.json` 只作为 release-manifest 的 live input 捕获，不进入 contract manifest。typed-proof、bundle、receipt、run binding、四个业务 alias domain、平台 action/run/attempt/cursor alias、fixture actual-object 与 issue-code schema/version/enums 的唯一权威是 `p04-contract.mjs`，其他文件只能导入，不能复制常量；两份 live 文件不作为 contract 成员，只形成下述规范化状态投影；
- validator manifest 固定包含 `validate-contract-alignment.mjs`、`validate-offline-package.mjs`、`validate-day-1-probe-package.mjs` 与 `validate-live-p04-evidence.mjs`。每个 validator 旁必须有一份同 basename 的 `FREEZE_ATTESTATION.json` sidecar，exact 记录 `{schema_version,validator_role,validator_sha256,ordered_upstream_pins,ordered_attestation_pins,sidecar_digest}`；每个 pin exact 为 `{pin_id,pin_kind:file_sha256|schema_digest|sidecar_digest,relative_path:null|repo_relative_path,sha256}`，按 `pin_id` UTF-8 升序且 ID 唯一；sidecar terminal digest 就是该 sidecar 的 `sidecar_digest`。`sidecar_digest = SHA256("neoloop:p04-freeze-attestation:v1\0" || canonical_json(sidecar_without_sidecar_digest))`，sidecar 不包含 release-root hash，validator 不得自写或运行时改写。freeze edges 固定为：Contract pin spec/probe/result/template/bundle-schema/acceptance/matrix/P04 contract；Offline pin Contract validator SHA+sidecar；Day-1 pin Contract+Offline SHA+sidecar；live P04 pin P04 contract、bundle schema、`p04-contract.mjs` 导出的 `results_live_input_schema_digest`/`onsite_live_input_schema_digest` 和 Contract/Offline/Day-1 sidecar terminal digests。每层 exact pin-id 列表由 `p04-contract.mjs` 唯一导出；readiness 必须从 captured bytes 解析并重算每条单向 edge，不能只比较 manifest 成员存在；
- `feishu/attestations/p04-release-manifest.v1.json` exact 固定 `{schema_version,source_manifest,scenario_fixture_manifest,hardening_fixture_manifest,live_validator_fixture_manifest,compiler_manifest,expected_compiled_output_manifest,contract_manifest,validator_manifest,freeze_attestation_manifest,stage0_entry_relative_path,report_entry_relative_path,runtime_bootstrap_relative_path,stage1_entry_relative_path,worker_entry_relative_path,live_input_relative_paths,permission_profile_template,permission_profile_template_sha256}`。`permission_profile_template` 是第 7.2 节 four-profile 符号路径/能力模板，不包含运行时绝对路径；摘要用 permission-profile-template domain 重算。所有 path/manifest 按前述排序且不含 root/signature/自身 hash；`live_input_relative_paths` 只允许两份固定 live JSON 与固定 bundle-manifest 路径。`release_manifest_sha256=SHA256(raw canonical release-manifest bytes)`。external launcher 只依该已签 manifest 枚举并捕获输入，不能由运行中仓库代码临时告诉 launcher 要读哪些文件；
- `enumerateReleaseInputs(release_manifest,captured_live_inputs)` 是 `p04-contract.mjs` 唯一导出的纯投影：把 source/compiler/contract/validator/freeze 的 manifest-entry、三类 fixture-entry 的 `{relative_path,sha256}` 投影，以及 `captured_live_inputs` 做集合并集；`captured_live_inputs` exact 为两份固定 live JSON、bundle-manifest 与该 manifest 安全解析后列出的每个 bundle member 的 `{relative_path,byte_length,sha256}` 数组，路径必须来自 signed `live_input_relative_paths` 或 fixed bundle-root containment。launcher 对每个静态 manifest entry 也必须从已打开 descriptor取得 byte length，验证 SHA 后投影为同形 snapshot entry。输出按 relative path UTF-8 升序去重；同一路径同 SHA 且同 byte length 合并，同一路径不同 SHA/长度、同 fixture ID 不同 path、未知/动态路径或 expected compiled-output 被误当作执行前输入均失败。release manifest 自身、root、detached signature 由 snapshot 公式单独加入，不在该投影内；
- `feishu/attestations/p04-release-root.v1.json` exact 固定 `{schema_version,release_id_digest,issued_at,expires_at,spec_sha256,release_manifest_sha256,source_bundle_sha256,scenario_fixture_bundle_sha256,hardening_fixture_bundle_sha256,live_validator_fixture_bundle_sha256,compiler_input_sha256,stage0_entry_sha256,permission_profile_template_sha256,manifest_bundle_sha256,validator_bundle_sha256,freeze_attestation_bundle_sha256,external_launcher_contract_sha256,allowed_capture_signer_keys,approver_key_fingerprint_sha256}`，旁置 detached Ed25519 signature。`allowed_capture_signer_keys` 是按 key ID 排序的 exact `{key_id,raw_public_key_base64url,key_fingerprint_sha256,allowed_actor_roles,allowed_source_classes,allowed_signature_purposes}` 数组。`release_id_digest = SHA256("neoloop:p04-release-id:v1\0" || canonical_json(root_without_release_id_digest))`，root 不含自身文件 SHA 或 signature SHA；`release_root_manifest_sha256=SHA256(raw canonical root bytes)`，detached signature exact 为 64 raw bytes，签名消息是 `release_root_manifest_sha256` 的 raw 32 bytes；approver key 是 raw 32-byte Ed25519 public key，`approver_key_fingerprint_sha256=SHA256(raw_public_key_bytes)`，`release_root_signature_sha256=SHA256(raw_detached_signature_bytes)`。release root 只单向 pin release manifest 与 sidecar bundle，manifest/sidecar 不反向 pin root，因此无哈希环。`permission_profile_template_sha256` 绑定 `p04-contract.mjs` 导出的符号 path-role/capability plan；`external_launcher_contract_sha256` 绑定工作区内只读 launcher 合同，但实际 launcher entry/key fingerprint 由工作区外信任配置另行固定。仓库内 public key、环境变量、CLI 参数或同步修改的一组 source/fixtures/compiler/validators/sidecars/root 不能替代外部锚；
- launcher 必须从 release-manifest actual arrays 重算 root 中 source/三类 fixture/compiler/contract/validator/sidecar/profile/stage0 pins并逐项相等；runtime compile 后还必须要求 actual compiled-output manifest 与 release-manifest 的 expected manifest exact deep-equal。root 中只存在摘要而 release-manifest 没有对应 actual member、或 release-manifest 多出未签成员时均失败；
- live snapshot 只投影 P03 parent/prebuild/postbuild 状态与 P04 status/result/proof-presence，固定排序后计算，不吸收自由文本或其他 probe 的现场真值。

单项摘要一律是 `SHA256(raw file bytes)`；fixture 单项摘要是 `SHA256(canonical_json(exact synthetic fixture))`。bundle 公式完整冻结为：

```text
source_bundle_sha256 = SHA256("neoloop:p04-source-bundle:v1\0" || canonical_json(source_manifest))
scenario_fixture_bundle_sha256 = SHA256("neoloop:p04-scenario-fixture-bundle:v1\0" || canonical_json(scenario_fixture_manifest))
hardening_fixture_bundle_sha256 = SHA256("neoloop:p04-hardening-fixture-bundle:v1\0" || canonical_json(hardening_fixture_manifest))
live_validator_fixture_bundle_sha256 = SHA256("neoloop:p04-live-validator-fixture-bundle:v1\0" || canonical_json(live_validator_fixture_manifest))
compiler_input_sha256 = SHA256("neoloop:p04-compiler-input:v1\0" || canonical_json(compiler_manifest))
compiler_read_receipt_sha256 = compiler_read_receipt.receipt_sha256
compiled_output_sha256 = SHA256("neoloop:p04-compiled-output:v1\0" || canonical_json(compiled_output_manifest))
runtime_metadata_sha256 = SHA256("neoloop:p04-runtime-metadata:v1\0" || canonical_json(runtime_metadata))
runtime_freeze_receipt_sha256 = runtime_freeze_receipt.receipt_digest
runtime_loaded_sha256 = SHA256("neoloop:p04-runtime-loaded:v1\0" || canonical_json(runtime_loaded_manifest))
harness_runtime_loaded_sha256 = SHA256("neoloop:p04-harness-runtime-loaded:v1\0" || canonical_json(harness_runtime_loaded_receipts))
manifest_bundle_sha256 = SHA256("neoloop:p04-contract-manifest:v1\0" || canonical_json(contract_manifest))
validator_bundle_sha256 = SHA256("neoloop:p04-validator-bundle:v1\0" || canonical_json(validator_manifest))
freeze_attestation_bundle_sha256 = SHA256("neoloop:p04-freeze-attestation-bundle:v1\0" || canonical_json(freeze_attestation_manifest))
live_state_snapshot_sha256 = SHA256("neoloop:p04-live-state-snapshot:v1\0" || canonical_json(live_state_projection))
```

`stage0_entry_sha256 = SHA256(raw bytes of captured p04-stage0-broker.mjs)`；报告 CLI 自身作为 source-manifest 成员单独绑定，二者不能混称。`external_launcher_contract_sha256 = SHA256(raw bytes of feishu/runbooks/p04-external-launcher-contract.md)`；`permission_profile_template_sha256 = SHA256("neoloop:p04-permission-profile-template:v1\0" || canonical_json(permission_profile_template))`，不得以未定义的 symbolic plan 或调用方重组对象代替 exact template。

permission instantiation 不使用一个跨越未来路径的总摘要。`permission-profile-instantiation object` exact 为 `{role:stage0|compiler|stage1|worker,fixture_id:null|fixture_id,entry_sha256,bootstrap_sha256,permission_profile_template_sha256,path_role_identity_map,normalized_exec_argv,normalized_exec_argv_sha256,sanitized_env_manifest,sanitized_env_manifest_sha256,fd_role_manifest,fd_role_manifest_sha256,stdio_policy,stdio_policy_sha256,spawn_ordinal,instantiation_sha256}`；stage0 固定 spawn ordinal=0，compiler/stage1/worker 从 1 按真实 OS spawn 顺序连续递增；`fixture_id=null iff role∈{stage0,compiler,stage1}`，worker 必须是 signed fixture manifest 中非空 ID。`path_role_identity_map` 每项 exact 为 `{path_role,path_scope:snapshot|private_temp,scope_relative_path,object_kind:file|readonly_directory|empty_writable_directory,descriptor_identity,descriptor_identity_digest,file_sha256:null|sha256,directory_manifest:null|ordered_directory_manifest,content_manifest_sha256:null|sha256,empty_directory_digest:null|sha256}`；按 path role 排序，路径为对应 scope 根内的大小写精确规范相对路径。`descriptor_identity` exact 为 `{safe_dev_digest,safe_ino_digest,uid_digest,mode_class,opened_content_set_sha256}`，三个数值身份摘要分别使用 `neoloop:p04-safe-dev|safe-ino|uid:v1` domain、规范 uint64be 值与 raw launcher-session nonce 计算，`mode_class` 只允许 `regular_0600|regular_readonly|directory_0700|directory_readonly`，分别精确对应 owner-only `0600|0400|0700|0500` 且 group/other 权限全为 0。`descriptor_identity_digest = SHA256("neoloop:p04-descriptor-identity:v1\0" || canonical_json(descriptor_identity))`。file 只允许 `file_sha256`非空且 `opened_content_set_sha256=file_sha256`，其余三个 content 字段为 null；readonly directory 的 `ordered_directory_manifest` 必须枚举根以下每个普通文件与目录，成员 exact 为 `{relative_path,object_kind:regular_file|directory,byte_length:null|safe_byte_length,sha256:null|sha256,member_fs_identity,member_fs_identity_digest,mode_class:regular_readonly|directory_readonly,link_count:safe_link_count}`，按 UTF-8 relative path 排序且路径唯一。`member_fs_identity` exact 为 `{safe_dev_digest,safe_ino_digest,uid_digest,mode_class}`，不含任何 content/tree digest；`member_fs_identity_digest = SHA256("neoloop:p04-member-fs-identity:v1\0" || canonical_json(member_fs_identity))`。普通文件固定 byte length/SHA 非空、mode=`regular_readonly`、`link_count=1`；目录固定 byte length/SHA 为 null、mode=`directory_readonly`、link count 为 launcher 实测的 `safe_link_count`。成员 identity 的安全数值摘要使用与顶层 descriptor 相同的 raw launcher-session nonce，成员 mode 必须与外层 mode 字段相等；launcher 在同一 opened descriptor 上逐项 `lstat/open/fstat`，freeze、每次 prepare 与终态复核的完整 member identity/mode/link-count/bytes 必须 exact 不变。完整平面 manifest 是成员树的唯一内容前像，不再为子目录递归计算或回填 content digest；`content_manifest_sha256 = SHA256("neoloop:p04-directory-content-manifest:v1\0" || canonical_json(directory_manifest))` 非空且顶层 `opened_content_set_sha256=content_manifest_sha256`，file/empty digest 为 null；empty writable directory 必须已安全打开且目录枚为 0，只允许 `empty_directory_digest=SHA256("neoloop:p04-empty-directory:v1\0")` 非空且顶层 `opened_content_set_sha256=empty_directory_digest`，file/directory manifest/content digest 为 null。三类 nullable 组合按此 IFF，运行中新产生内容必须由后续 output/runtime manifest 另行绑定。map 只引用该次 spawn 前已经 opened-descriptor 复核的对象，不含绝对路径。

`permission_profile_template` 根 exact 为 `{schema_version:p04_permission_profile_template.v1,stage0:exact_profile,compiler:exact_profile,stage1:exact_profile,worker:exact_profile}`；每个 profile exact 为 `{requested_path_roles,path_role_requirements,normalized_exec_argv_template,sanitized_env_manifest,fd_role_manifest,stdio_policy,capability_policy}`。`path_role_requirements` 每项 exact 为 `{path_role,path_scope:snapshot|private_temp,object_kind:readonly_directory|empty_writable_directory,mode_class:directory_readonly|directory_0700}`，按 path role 排序且其 role 投影必须 exact 等于 `requested_path_roles` 与 instantiation 的 `path_role_identity_map[].path_role`。下列 `(a,b,c,d)` 只是该 exact object 的紧凑写法，逐字展开为 `{path_role:"a",path_scope:"b",object_kind:"c",mode_class:"d"}`，不构成第二种 schema。四组 requirement 只允许：stage0=`[(captured_snapshot,snapshot,readonly_directory,directory_readonly),(stage0_bookkeeping_root,private_temp,empty_writable_directory,directory_0700)]`；compiler=`[(captured_compiler_inputs,snapshot,readonly_directory,directory_readonly),(launcher_compiler_work_root,private_temp,empty_writable_directory,directory_0700)]`；stage1=`[(captured_runtime_tree,private_temp,readonly_directory,directory_readonly),(captured_stage1_harness_tree,snapshot,readonly_directory,directory_readonly)]`；worker=`[(captured_worker_harness_tree,snapshot,readonly_directory,directory_readonly),(captured_worker_runtime_tree,private_temp,readonly_directory,directory_readonly)]`。同一 instantiation 内 roots 必须不重叠；跨 role 只允许 stage1/worker runtime roles 指向同一已冻结 runtime tree，以及 stage0 captured snapshot包含只读 harness-tree source bytes，compiler work root 可在 compiler 退出并冻结后成为后续 runtime tree 的受控子树；stage0 bookkeeping root 与 snapshot/runtime/compiler roots始终不重叠，其他 overlap 均失败。

`requested_path_roles` 是按 UTF-8 role ID 排序去重的非空字符串数组；`normalized_exec_argv` 是对应 signed template 逐 token 替换符号 path role 后的有序字符串数组，不能重排、增删或合并 token。环境固定且不继承调用方：`sanitized_env_manifest` exact 为 `[{name:"LANG",value:"C"},{name:"LC_ALL",value:"C"},{name:"TZ",value:"UTC"}]`，不得出现 PATH、HOME、TMPDIR、NODE_OPTIONS、proxy、credential、loader 或其他变量；其摘要使用 `neoloop:p04-sanitized-env-manifest:v1` domain。`fd_role_manifest` 每项 exact 为 `{fd_role,child_fd_ordinal,direction:launcher_to_child|child_to_launcher|bidirectional,authenticated:true,direct_child_only:true,lifetime:bootstrap_only|process_lifetime,closed_after_bootstrap:boolean,descendant_spawn_forbidden:true}`，按 child ordinal 递增且 role 唯一；`closed_after_bootstrap iff lifetime=bootstrap_only`，未列业务 FD 不得由 launcher传入。四个 exact 列表为：stage0=`[(launcher_control,3,launcher_to_child,bootstrap_only),(launcher_broker_ipc,4,bidirectional,process_lifetime)]`；compiler=`[(launcher_commit,3,launcher_to_child,bootstrap_only),(compiler_result,4,child_to_launcher,process_lifetime)]`；stage1=`[(launcher_commit,3,launcher_to_child,bootstrap_only),(stage0_stage1_ipc,4,bidirectional,process_lifetime)]`；worker=`[(launcher_commit,3,launcher_to_child,bootstrap_only),(stage0_worker_ipc,4,bidirectional,process_lifetime),(target_capability_to_loader,5,launcher_to_child,bootstrap_only),(seed_capability_to_adapter,6,launcher_to_child,bootstrap_only)]`，每项还固定 authenticated/direct-child/descendant-spawn booleans 为 true并按 lifetime 派生 close boolean。`stdio_policy` exact 为 `{stdin:closed,stdout:captured_utf8,stderr:captured_utf8,max_stdout_bytes:65536,max_stderr_bytes:65536,extra_fds_exact:true}`。FD 与 stdio 摘要分别使用 `neoloop:p04-fd-role-manifest:v1`、`neoloop:p04-stdio-policy:v1` domain；child bootstrap 用仅在 bootstrap closure 可达的 `node:fs` 同步 framed IO核对 signed manifest 中的固定 FD ordinal，消费并关闭 bootstrap-only FD，保留 process-lifetime IPC；无业务额外 FD 由 launcher 的 exact spawn stdio 投影和 signed commit receipt证明，不要求 JS 枚举 Node 自身内部 descriptor。Node 22.15 没有被本合同当作 CLOEXEC 查询/设置边界；无后代继承只由所有四角色 `child_process=false/worker_threads=false`、launcher exact stdio、bootstrap关闭和真实拒绝负例建立。target/seed raw capability 由 bootstrap 消费后只保留在不可达 loader/adapter closure，worker 业务模块拿不到对应 FD、raw bytes 或完整 `node:fs/node:crypto` namespace。

`capability_policy` exact 为 `{fs_read_path_roles,fs_write_path_roles,bootstrap_only_builtin_modules,runtime_builtin_modules,child_process:false,worker_threads:false,native_addon:false,wasi:false,ambient_env:false,network_permission_scope:unsupported}`，两个 path-role 与两个 builtin 数组都按 UTF-8 排序去重。四个 signed role template 的关键常量只允许：stage0 path roles=`[captured_snapshot,stage0_bookkeeping_root]`，read=`[captured_snapshot]`，write=`[stage0_bookkeeping_root]`，runtime builtins=`[node:crypto,node:fs,node:path,node:url]`；compiler path roles=`[captured_compiler_inputs,launcher_compiler_work_root]`，read=`[captured_compiler_inputs]`，write=`[launcher_compiler_work_root]`，runtime builtins=`[node:crypto,node:fs,node:path,node:url]`；stage1 path roles=`[captured_runtime_tree,captured_stage1_harness_tree]`，两者只读、write=`[]`，runtime builtins=`[node:async_hooks,node:crypto]`；worker path roles=`[captured_worker_harness_tree,captured_worker_runtime_tree]`，两者只读、write=`[]`，runtime builtins=`[node:async_hooks,node:crypto]`。四者的 bootstrap-only builtin 都 exact=`[node:crypto,node:fs,node:module]`，只允许完成 digest/signature、固定 FD framed IO 与同步 loader 安装；hook 安装后，后续 import 按本 role 的 `runtime_builtin_modules` exact 裁决，只拒绝 bootstrap allowlist 与 runtime allowlist 的差集及全部未知 builtin。预加载的 raw namespace不能传入业务 graph；bootstrap只把绑定到 exact FD/operation 的窄 closure交给 broker/adapter，因此 stage0/compiler可按 runtime allowlist重新 import其合法 `crypto/fs`，stage1/worker可重新 import合法 `crypto`，但不能借预加载对象取得未授权 path/FD/module能力。`normalized_exec_argv_template` 必须逐字等于下文对应 role 的模板，env/FD/stdio 必须等于上文公共/role-specific常量；`p04-contract.mjs` 只导出根 exact template，不接受调用方拼装或覆盖任一 capability/path role。

launcher 从真实 argv 中把每个受控绝对路径逐项映射为唯一 path role 后得到 `normalized_exec_argv`，任何未映射参数、重复映射或 raw argv 与 normalized template 不一一对应都失败；`normalized_exec_argv_sha256 = SHA256("neoloop:p04-normalized-exec-argv:v1\0" || canonical_json(normalized_exec_argv))`可由输出独立重算，raw argv 永不输出。env/FD/stdio 三个实际投影也必须分别与 signed role template exact deep-equal。`instantiation_sha256 = SHA256("neoloop:p04-permission-profile-instantiation:v1\0" || canonical_json(instantiation_without_instantiation_sha256))`。control receipt 只绑定 stage0 object/digest；compiler/stage1/每个 worker 的对象实际存在且完成 opened-descriptor 复核后才可进入下述协议。

每次非 stage0 spawn 必须使用唯一的两阶段协议：

1. `prepare_spawn request` exact 为 `{schema_version:p04_prepare_spawn_request.v1,launcher_control_receipt_sha256,launcher_session_nonce_digest,prepare_nonce_digest,spawn_ordinal,role,fixture_id:null|fixture_id,entry_sha256,bootstrap_sha256,requested_path_roles,request_digest}`；`requested_path_roles` 必须等于 signed role template 的同名数组，并在 prepared instantiation 中 exact 投影为同一 map；fixture nullable IFF 沿全链保持。raw launcher-session nonce 由 launcher 每次运行新生成 32 bytes，其 digest 进入 control receipt；raw prepare nonce 由 stage0 每次请求新生成 32 bytes，只在认证 IPC 中存在，`prepare_nonce_digest = SHA256("neoloop:p04-prepare-nonce:v1\0" || raw_prepare_nonce_32_bytes)` 且全 run 唯一。`request_digest = SHA256("neoloop:p04-prepare-spawn-request:v1\0" || canonical_json(request_without_request_digest))`。
2. launcher 打开/复核当前对象并返回 `prepared receipt`，exact 为 `{schema_version:p04_permission_prepared_receipt.v1,launcher_control_receipt_sha256,launcher_session_nonce_digest,prepare_request_digest,prepare_nonce_digest,permission_profile_instantiation,spawn_ordinal,max_commit_delay_ms:5000,receipt_digest,ed25519_signature}`；外层 ordinal 必须等于嵌套 object，`receipt_digest = SHA256("neoloop:p04-permission-prepared-receipt:v1\0" || canonical_json(receipt_without_receipt_digest_and_signature))`。launcher 此时绝不 spawn。
3. stage0 验证 prepared receipt 后构造 `spawn_invocation` exact `{role,fixture_id:null|fixture_id,spawn_ordinal,prepared_receipt_digest,entry_sha256,bootstrap_sha256,permission_profile_instantiation_sha256,requested_path_roles,normalized_exec_argv_sha256,sanitized_env_manifest_sha256,fd_role_manifest_sha256,stdio_policy_sha256,invocation_payload,invocation_payload_digest,invocation_digest}`。上述五个 profile 投影必须逐项等于 prepared instantiation 和 signed role template，fixture nullable IFF 沿 request/instantiation/invocation/receipt exact 相等。`invocation_payload` 按 role 互斥：compiler=`{compiler_input_sha256,compiler_work_root_descriptor_identity_digest,expected_compiled_output_sha256}`；stage1=`{stage0_to_stage1_receipt_sha256,runtime_metadata_sha256,runtime_freeze_receipt_sha256,stage1_entry_sha256}`；worker=`{worker_invocation_digest,fixture_dispatch_ordinal,fixture_dispatch_nonce_digest,captured_fixture_object_sha256,target_entry_sha256,runtime_freeze_receipt_sha256}`。每个 worker prepared instantiation 的 `captured_worker_runtime_tree` entry 必须与 runtime-freeze receipt 的 `captured_runtime_tree` entry 在规范 scope-relative path、descriptor identity/digest、完整 member manifest与content digest上 exact 相等，只允许 path-role 名按固定映射改为 `captured_worker_runtime_tree`；stage1 对应 entry 也按同一规则验证。`invocation_payload_digest = SHA256("neoloop:p04-spawn-invocation-payload:v1\0" || canonical_json({role,invocation_payload}))`，`invocation_digest = SHA256("neoloop:p04-spawn-invocation:v1\0" || canonical_json(invocation_without_invocation_digest))`。
4. `commit_spawn request` exact 为 `{schema_version:p04_commit_spawn_request.v1,launcher_control_receipt_sha256,launcher_session_nonce_digest,prepared_receipt_digest,spawn_invocation,invocation_digest,request_digest}`，`request_digest = SHA256("neoloop:p04-commit-spawn-request:v1\0" || canonical_json(request_without_request_digest))`。launcher 重算完整 invocation、复核 fixed argv 与 prepared state，在 5000 ms 单调窗口内最多启动一次。
5. 实际 child start 后 launcher 签发 `commit receipt`，exact 为 `{schema_version:p04_permission_commit_receipt.v1,launcher_control_receipt_sha256,launcher_session_nonce_digest,prepared_receipt_digest,commit_request_digest,prepare_nonce_digest,spawn_ordinal,role,fixture_id:null|fixture_id,invocation_digest,normalized_exec_argv_sha256,child_start_alias_digest,committed_once:true,committed_within_deadline:true,receipt_digest,ed25519_signature}`。`child_start_alias_digest = SHA256("neoloop:p04-child-start-alias:v1\0" || length_prefixed(raw_native_child_identity) || raw_launcher_session_nonce_32_bytes || uint32be(spawn_ordinal))`，raw child identity 由 trusted launcher在形成 alias 后立即丢弃；raw launcher-session nonce 仅在 launcher受保护内存中保留到本 run 最后一次签发/终态复核后清零，二者都不能进入 envelope/report。`receipt_digest = SHA256("neoloop:p04-permission-commit-receipt:v1\0" || canonical_json(receipt_without_receipt_digest_and_signature))`。`launcher_commit` FD 交付的 exact envelope 为 `{launcher_public_key_base64url,launcher_control_receipt,prepare_request,prepared_receipt,commit_request,commit_receipt}`；本 child 与 stage0 在 bootstrap barrier 内必须重算 key fingerprint、control/prepared/commit signature 与除 alias 原始前像外的全部 digest、session/role/fixture/ordinal、完整 invocation及 argv/env/FD/stdio projection。child 只验证当前 signed child-start alias 是非空 lowercase SHA并与当前 receipt 内一致；stage0 在每次 commit 时对已提交 receipt 前缀查重，outer verifier 对最终 receipt bundle 验证全 run alias 唯一。alias 原始前像只由 trusted launcher计算，child/stage0不得伪称从未收到的 raw identity/session nonce 可重算；其可信性来自 launcher signature、外部固定 launcher key、分层唯一性检查与 committed-once 门。随后关闭 bootstrap-only FD。任一可复算前像缺失或不等时退出且不解除 barrier。child 启动后只能停在该 barrier，在 launcher 把 exact envelope 经认证 FD 交给 stage0 和本 child，且两者均完成上述当前项复核前，禁止 dynamic import、fixture/target/seed 调用或 compiler semantic read。

`permission_instantiation_receipts` 的每项 exact 为 `{spawn_ordinal,prepare_request,prepared_receipt,commit_request,commit_receipt}`，因此外部 verifier 可从唯一 stdout 重算 prepare、instantiation、invocation、commit 全部 preimage；两份 request/两份 receipt 的 control/session/prepare/role/fixture/ordinal 必须 exact 一致，commit 还必须指向同项 prepared receipt 与 commit request。数组只收录已成功 commit 的 compiler/stage1/worker pair，按 ordinal 连续排序；`permission_instantiation_receipt_bundle_sha256 = SHA256("neoloop:p04-permission-instantiation-receipt-bundle:v1\0" || canonical_json(permission_instantiation_receipts))`。未 commit、重复 commit、跨运行/session/role/fixture 复用、超时、乱序或 child-start alias 重复一律失败并清理。后续 child-load/fixture receipt 绑定 `commit_receipt.receipt_digest`；只能在 commit 前构造的 worker/stage1 invocation 绑定 `prepared_receipt.receipt_digest`；terminal/run/outer 绑定完整 pair bundle。摘要方向固定为 `control → prepare request → prepared receipt → invocation → commit request → commit receipt → terminal/outer`，运行后对象不得反向进入上游。

全文所有 `permission_prepared_receipt_sha256`、`<role>_permission_prepared_receipt_sha256` 均是同一 pair 的 `prepared_receipt.receipt_digest` 的命名投影；所有 `permission_commit_receipt_sha256`、`<role>_permission_commit_receipt_sha256` 均是 `commit_receipt.receipt_digest` 的命名投影，不引入第二种 SHA 公式。每个命名投影必须与按 role/fixture/ordinal 唯一选出的 receipt digest exact 相等；找不到、找到多项或把 prepared/commit digest互换均失败。

`runtime_metadata` exact 为 `{schema_version:p04_runtime_metadata.v1,captured_runtime_package_json_sha256,compiled_output_sha256,node_engine_contract,module_type:"module",runtime_root_descriptor_identity,runtime_root_descriptor_identity_digest,package_boundary_relative_path,outdir_relative_path,nearest_package_boundary_verified:true}`。`runtime_root_descriptor_identity` 使用上述 exact descriptor object，`runtime_root_descriptor_identity_digest = SHA256("neoloop:p04-descriptor-identity:v1\0" || canonical_json(runtime_root_descriptor_identity))`，与 path-role entry 共用唯一 domain。package boundary/outDir 使用 private-temp-relative、无 `.`/`..`/绝对路径的规范 UTF-8 path；launcher 从 runtime root 到 outDir 逐级 `lstat/open/fstat`，拒绝 symlink/hardlink/identity 替换，并证明所列 P04 专属 captured runtime package.json 是 outDir 最近祖先、二者之间没有其他 package.json，再把完整 signed runtime-metadata/directory-manifest result 经认证 broker IPC 交给 stage0。stage0 不重新打开 runtime 路径，只复核 launcher signature、descriptor/content digest、compiled-output binding 与随后 stage1 prepared/commit pair 的 `captured_runtime_tree` readonly-directory path-role object exact 对应。完整 object 随 report 输出，再用上式重算 `runtime_metadata_sha256`，防止 NodeNext 产物受 ambient package boundary 影响。

上述签名结果的唯一载体是 `runtime_freeze_receipt`，exact 为 `{schema_version:p04_runtime_freeze_receipt.v1,launcher_control_receipt_sha256,launcher_session_nonce_digest,compiler_permission_commit_receipt_sha256,freeze_ordinal:1,runtime_metadata,runtime_metadata_sha256,runtime_tree_path_role_entry,runtime_tree_content_manifest_sha256,receipt_digest,ed25519_signature}`。`runtime_tree_path_role_entry` 必须是 path-role schema 中 `path_role=captured_runtime_tree`、`path_scope=private_temp`、`object_kind=readonly_directory`、`descriptor_identity.mode_class=directory_readonly` 的完整 entry，且其 descriptor/content digest 与 runtime metadata、compiled-output manifest exact 对应；`runtime_tree_content_manifest_sha256` 必须等于该 entry 的 `content_manifest_sha256`。`receipt_digest = SHA256("neoloop:p04-runtime-freeze-receipt:v1\0" || canonical_json(receipt_without_receipt_digest_and_signature))`，launcher 对 raw 32-byte digest 用 control receipt 同一受信 key 签名；`runtime_freeze_receipt_sha256=receipt_digest`。该 receipt 只能在 compiler commit 后、compiler退出/全部写 handle关闭、完整树冻结复核后签发一次；stage0 从 control envelope取得 launcher public key，复核 session/control/compiler commit/metadata/tree/signature后才允许请求 stage1 prepare。receipt、metadata或tree不得反向引用 stage1 prepared/commit、terminal、run summary或report，因此摘要方向保持单向。

`live_state_projection` exact 为 `{p03_parent_status,p03_prebuild_status,p03_postbuild_status,p04_status,p04_result_is_null,p04_proof_ref_present,p04_proof_present,p04_live_bundle_stage}`，值直接从两份 live JSON 与固定 live bundle 重算。source/三类 fixture/compiler/contract/validator/sidecar/release-root/live bytes 必须由工作区外 launcher 在任何工作区代码执行前一次性安全捕获到 0700 私有 snapshot tree；摘要、编译、freeze-edge/signature 解析、live validator 和 scenario/hardening 运行全部只使用这份捕获输入，不能先摘要后回到原路径再次读取。运行结束必须清理 snapshot，输出中不得出现绝对路径。

仓库代码不能证明自己在校验前没有被替换，因此 readiness 的用户入口必须是工作区外、由参赛者单独批准的 trusted launcher；直接运行仓库内 `report-p04-readiness.mjs` 只能产生不可交付的 candidate，不能形成 passed evidence。launcher 的 executable SHA、attestation Ed25519 public-key fingerprint 和 approver root public-key fingerprint 固定在工作区外只读配置，不能由仓库、env 或 CLI 参数覆盖。launcher 在执行任何工作区 JS 前按以下顺序完成：

1. 从 descriptor 读取 release manifest、release root/signature、stage0 broker、报告 serializer 和 release manifest 所列全部输入，逐项执行 O_NOFOLLOW/fstat/identity/hash/signature/pin 验证；
2. 把已验证原始字节复制到私有 snapshot，并由 launcher 直接以本次实例化的 stage0 profile 启动 captured stage0 broker；可信路径不先执行 report CLI，report CLI 仅是 source-bound 的本地 candidate wrapper；
3. 外部 verifier 先通过工作区外认证通道签发 exact 32-byte one-time challenge 与 audience/issued/expiry（有效期不超过 5 分钟）；launcher 验证后才通过只属于 stage0 的独立 control FD 传入 `{launcher_public_key_base64url,control_receipt}`。`verifier_audience_digest = SHA256("neoloop:p04-verifier-audience:v1\0" || length_prefixed_utf8(workspace_external_audience_id))`；`verifier_challenge_digest = SHA256("neoloop:p04-verifier-challenge:v1\0" || raw_verifier_challenge_32_bytes || verifier_audience_digest_raw_32_bytes || length_prefixed_utf8(verifier_challenge_issued_at) || length_prefixed_utf8(verifier_challenge_expires_at))`。`control_receipt` exact 为 `{schema_version:p04_launcher_control_receipt.v1,verifier_challenge_digest,verifier_audience_digest,verifier_challenge_issued_at,verifier_challenge_expires_at,launcher_session_nonce_digest,release_root_manifest_sha256,release_manifest_sha256,stage0_entry_sha256,snapshot_manifest_sha256,permission_profile_template_sha256,stage0_permission_profile_instantiation,stage0_permission_profile_instantiation_sha256,launcher_entry_sha256,launcher_key_fingerprint_sha256,receipt_digest,ed25519_signature}`；`launcher_session_nonce_digest = SHA256("neoloop:p04-launcher-session-nonce:v1\0" || raw_launcher_session_nonce_32_bytes)`，每次运行必须全局唯一，raw 不输出。stage0 重算 embedded instantiation、key fingerprint并验证数学签名/内容，只有外部 launcher/verifier可依据工作区外 trust config 判定该 key 是否受信；compiler/stage1/worker 的 future paths/receipts 绝不出现在该 control receipt；
4. stage0 的所有 compiler/stage1/worker 启动请求都通过认证 IPC 交给 launcher；launcher只按 signed entry hash、profile instantiation与 fixed argv 代为 spawn，stage0自身无 child-process权限。launcher 接收内层 candidate report、复核其 report/run/source/execution receipts 与 snapshot，清理并复核临时根不存在后，才输出外层签名 attestation。

`snapshot_manifest` 是按 relative path 排序的 exact `{relative_path,byte_length,sha256}` 数组，精确等于 `sort_unique([release_manifest_entry,...enumerateReleaseInputs(release_manifest,captured_live_inputs),release_root_entry,detached_signature_entry])`；`release_manifest_entry.sha256` 必须等于 root 的 `release_manifest_sha256`。它明确排除 launcher/verifier challenge raw bytes、launcher control receipt、stage0/worker runtime receipt、candidate report、outer attestation 与所有运行期临时输出。`snapshot_manifest_sha256 = SHA256("neoloop:p04-launcher-snapshot-manifest:v1\0" || canonical_json(snapshot_manifest))`。`receipt_digest = SHA256("neoloop:p04-launcher-control-receipt:v1\0" || canonical_json(control_receipt_without_receipt_digest_and_signature))`，signature 对其 32-byte 原始摘要签名，`launcher_control_receipt_sha256` 就是该 receipt digest。stage0 只能从 inherited control FD 读取 envelope，不接受文件、env 或 argv 替代。

最终唯一可交付 stdout exact 为 `{schema_version:p04_readiness_attestation.v1,verifier_challenge_digest,verifier_audience_digest,verifier_challenge_issued_at,verifier_challenge_expires_at,report,report_digest,release_manifest,release_manifest_sha256,release_root,release_root_manifest_sha256,release_root_signature_base64url,release_root_signature_sha256,snapshot_manifest,snapshot_manifest_sha256,launcher_public_key_base64url,launcher_control_receipt,permission_instantiation_receipts,permission_instantiation_receipt_bundle_sha256,launcher_entry_sha256,launcher_key_fingerprint_sha256,attestation_digest,ed25519_signature}`。四个 verifier 字段必须逐字等于 embedded control receipt；`release_manifest`、`release_root`、`snapshot_manifest` 必须分别等于 launcher 安全捕获的 exact object，detached root signature 以 64-byte raw signature 的无 padding base64url 输出；它们和同名 digest 全部进入 outer attestation。outer attestation 还单向包含完整非敏感 control receipt 与全部 prepared/commit receipt pair；`attestation_digest = SHA256("neoloop:p04-readiness-attestation:v1\0" || canonical_json(attestation_without_attestation_digest_and_signature))`，signature 对其 32-byte 原始摘要签名。外部 verifier 必须用工作区外固定 launcher key验签，从 stdout 内嵌对象重算 snapshot、release manifest/root/signature、embedded key fingerprint/control/prepared/commit receipt digest/signature、receipt bundle 与 inner report digest；还必须把 challenge raw bytes 重算为同一 digest、校验 audience、当前时间位于有效期内，并以持久 replay cache 原子地把该 challenge digest 从 `issued_unused` 消费为 `consumed`。未知、过期或已消费 challenge 一律失败，因此旧 outer stdout 不能在 live state 改变后原样重放。不得依赖已清理的临时根或额外伴随件。只保存/转发 inner report、仓库自签 root 或数学上有效但 key 不在外部配置中的签名均不算 passed。launcher 自身实现与密钥不进入本仓库，本规格只新增可审计 invocation/attestation 合同；若外部 launcher 尚未交付，readiness 最多为 local candidate，不能对外声明验收通过。

`execution_attestation` exact shape：

```text
runtime = node
node_version
node_engine_contract = >=22.15.0
clock_claimed = false
scenario_count = 7
exit_code = 0
network_deny_port_call_count
openapi_deny_port_call_count
formal_business_write_deny_port_call_count
permission_denial_count
launcher_control_receipt_sha256
stage0_to_stage1_receipt: exact stage0-to-stage1 receipt
stage0_to_stage1_receipt_sha256
stage0_terminal_receipt: exact stage0-terminal receipt
stage0_terminal_receipt_sha256
permission_instantiation_receipts: ordered exact prepared/commit receipt-pair array
permission_instantiation_receipt_bundle_sha256
fixture_execution_receipt_bundle_sha256
compiler_read_receipt_sha256
runtime_metadata_sha256
runtime_freeze_receipt: exact launcher-signed runtime-freeze receipt
runtime_freeze_receipt_sha256
external_release_root_verified = true
stage0_entry_sha256
permission_profile_template_sha256
stage0_permission_profile_instantiation_sha256
run_summary_sha256
```

`node_version` 必须是实际 `process.version` 的规范 semver，且满足被 compiler/source manifest 绑定的 P04 专属 `feishu/runtime/p04/package.json` 中 exact `engines.node >=22.15.0`；不满足、无法解析或该专属 package engine 漂移均失败。根 `package.json`、`.nvmrc`、Netlify 和已冻结 synthetic baseline 继续保持它们现有 Node 22.13 合同，不因 P04 preflight 被全局升级。选择 P04 专属 22.15.0 下限是因为本设计使用同线程同步 `module.registerHooks()`，该 API 从 Node 22.15.0 才提供；不得在 22.13.x 上用需要 worker 权限的异步 loader 代替。版本与权限依据只采用 Node 官方的 [Module API](https://nodejs.org/api/module.html) 和 [Permission Model](https://nodejs.org/api/permissions.html)。三个 deny-all instrumented ports 与 permission-denial counter 由 stage0 parent broker 私有持有：每次请求先由 parent 计数再拒绝；child 不能传入、重置、读取可变引用或自报计数。合法报告要求三项 deny count 和 permission denial 均为 0；不能硬编码 0 或仅靠源码搜索推导。

`deny_port_counts` exact 为 `{network,openapi,formal_business_write,permission_denial}` 四个 safe_count。`source_bindings.runtime_freeze_receipt` 与 `execution_attestation.runtime_freeze_receipt` 必须 canonical deep-equal，二者同名 digest 都等于 receipt digest。`run_summary_sha256` 固定为 `SHA256("neoloop:p04-run-summary:v1\0" || canonical_json({scenario_summaries,hardening_results,live_validator_results,fixture_execution_receipts,local_contract_results,deny_port_counts,source_bundle_sha256,scenario_fixture_bundle_sha256,hardening_fixture_bundle_sha256,live_validator_fixture_bundle_sha256,compiler_input_sha256,compiler_read_receipt_sha256,compiled_output_sha256,runtime_metadata_sha256,runtime_freeze_receipt_sha256,runtime_loaded_sha256,harness_runtime_loaded_sha256,manifest_bundle_sha256,validator_bundle_sha256,freeze_attestation_bundle_sha256,release_manifest_sha256,release_root_manifest_sha256,release_root_signature_sha256,external_approver_key_fingerprint_sha256,external_launcher_contract_sha256,live_state_snapshot_sha256,launcher_control_receipt_sha256,stage0_to_stage1_receipt_sha256,stage0_terminal_receipt_sha256,permission_instantiation_receipt_bundle_sha256,stage0_entry_sha256,permission_profile_template_sha256,stage0_permission_profile_instantiation_sha256}))`。它与 `report_digest` 相互独立，且由 serializer 重算。

外部 launcher 是执行前信任层；其内部固定 stage0→stage1→worker 三层，测试不得直接 import 生产 harness 绕过 broker：

1. **trusted external launcher**：在任何工作区 JS 执行前验证并捕获 release root、stage0、报告 serializer 和全部冻结输入，签发 control receipt，是唯一拥有 OS child-process 能力的进程；只按 stage0 的认证请求与 signed entry/profile/argv 启动 compiler、stage1、worker，最终验证并签署外层 attestation。它不运行场景业务代码。
2. **captured stage0 parent broker**：只读取 launcher 提供的 snapshot/control FD，复核 control receipt 的数学签名、内容与 release root；只创建并写自己的独立 bookkeeping root，持有全部 deny/permission/attempt/audit/formal-write/fixture-seed/subject-call counters、固定超时与输出上限，并通过认证 IPC请求 launcher 创建/冻结 runtime root 与启动子进程。stage0 对 launcher/compiler-owned runtime root 始终没有 fs-write capability，也不运行场景业务代码。
3. **captured stage1 harness**：只从 snapshot 加载已捕获 bytes，复核 capture manifest、stage0→stage1 receipt、编译产物和 capability plan；按固定顺序向 stage0 请求下一个 fixture，接收 stage0 返回的 worker receipt/result并组装 candidate report。stage1 没有 child-process、原工作区、外部 trust FD、写盘、网络或正式 repository 能力。
4. **scenario worker process**：由 launcher 按 stage0 的单次认证请求逐 fixture 启动，只得到该 fixture canonical object、fixture dispatch nonce、只读 emitted runtime tree 和窄 IPC ports。worker 不持有 fs write、child_process、worker/vm、网络、OpenAPI、CLI、正式 Feishu repository、计数器可变引用或真实环境。

stage0→stage1 receipt exact 为 `{schema_version:p04_stage0_to_stage1_receipt.v1,launcher_control_receipt_sha256,pre_stage1_capture_bundle_sha256,compiler_permission_commit_receipt_sha256,runtime_freeze_receipt_sha256,stage1_permission_prepared_receipt_sha256,stage1_entry_sha256,runtime_bootstrap_sha256,permission_profile_template_sha256,release_root_manifest_sha256,started_at_claimed:false,receipt_sha256}`。该时点不伪造尚未完成的 `source_bindings`；`pre_stage1_capture_inputs` exact 为 `{static_source_projection,compiler_committed_pair,runtime_freeze_receipt,stage1_prepared_receipt}`，其中 static projection 只列 source/fixture/compiler-read/compiled-output/runtime-metadata/contract/validator/sidecar/root pins，compiler pair 必须完整 commit，runtime freeze receipt 必须由 launcher签名且绑定该 compiler commit，stage1 只允许 prepared receipt且尚无 commit。`p04-contract.mjs` 导出 exact `preStage1CaptureProjection(pre_stage1_capture_inputs)` 并明确排除只能在 stage1/worker 执行后取得的 `runtime_loaded_manifest`、`harness_runtime_loaded_receipts` 与 worker pairs；`pre_stage1_capture_bundle_sha256 = SHA256("neoloop:p04-pre-stage1-capture-bundle:v1\0" || canonical_json({snapshot_manifest_sha256,preStage1CaptureProjection,live_state_snapshot_sha256}))`。最终 verifier 从完整 `source_bindings.permission_instantiation_receipts` 选取同一 compiler pair 与 stage1 pair 的 prepared 子对象，并使用 `source_bindings.runtime_freeze_receipt` 重构 exact `pre_stage1_capture_inputs` 后复算；stage1 commit 及之后字段不得进入该 preimage。`stage0_to_stage1_receipt_sha256 = SHA256("neoloop:p04-stage0-to-stage1-receipt:v1\0" || canonical_json(receipt_without_receipt_sha256))`。该 receipt 与 runtime-freeze receipt digest随后作为 stage1 `spawn_invocation.invocation_payload` 的一部分进入 commit，不反向引用 stage1 commit receipt。

运行结束后 stage0 另生成 terminal receipt，exact 为 `{schema_version:p04_stage0_terminal_receipt.v1,stage0_to_stage1_receipt_sha256,runtime_loaded_sha256,harness_runtime_loaded_sha256,fixture_execution_receipt_bundle_sha256,parent_terminal_counter_snapshot,permission_instantiation_receipt_bundle_sha256,receipt_sha256}`；`stage0_terminal_receipt_sha256 = SHA256("neoloop:p04-stage0-terminal-receipt:v1\0" || canonical_json(receipt_without_receipt_sha256))`。pre-stage1 receipt 不反向包含 terminal 值。execution attestation 必须内嵌两份完整 receipt object并使同名 digest投影逐字相等，最终 verifier不能只收到裸 SHA。stage0 对每个 fixture 生成 32-byte dispatch nonce与连续 dispatch ordinal，请求 launcher启动 fixed worker entry 后再根据 IPC/target-call/seed ledger与 parent counter snapshot形成 execution receipt；stage1 与 worker均不能签发或自报 receipt。

`p04-contract.mjs` 固定四套符号 `process.execArgv` template：stage0=`--permission --allow-fs-read=<captured-snapshot> --allow-fs-write=<stage0-bookkeeping-root> --import=<captured-bootstrap>`；compiler=`--permission --allow-fs-read=<captured-compiler-inputs> --allow-fs-write=<launcher-compiler-work-root> --import=<captured-bootstrap>`；stage1=`--permission --allow-fs-read=<captured-runtime-tree> --allow-fs-read=<captured-stage1-harness-tree> --import=<captured-bootstrap>`；worker=`--permission --allow-fs-read=<captured-worker-runtime-tree> --allow-fs-read=<captured-worker-harness-tree> --import=<captured-bootstrap>`。四者都不授权 child、worker、addon、WASI 或 ambient env；stage1/worker 不授权 write，stage0 的唯一写 role 与 launcher-owned runtime tree不相交。Node 22.15 的 Permission Model 不支持 network permission，因此 profile 明确 `network_permission_scope=unsupported`，绝不把“不传 --allow-net”写成内核级拒网证明；网络闭包只由 builtin loader deny、fetch/WebSocket/EventSource sentinel、sanitized env、deny-port 和真实子进程负例共同建立。`p04-runtime-bootstrap.mjs` 只使用 Node >=22.15.0 的同步 `module.registerHooks()`，在同一线程的首个 dynamic import 前安装 exact loader；compiler/stage1/worker 入口自身除 bootstrap 外不得有静态业务 import。启动后用 `process.permission` 证明当前 Node 版本支持的 fs/child/worker/addon/WASI 权限并与 instantiated profile 一致；网络另按上述闭包证明。Node 不支持合同、flag 漂移或 capability 探针不一致时以 `permission_model` 失败，不得扩大权限或退回异步 loader/JS monkey patch。

scenario runtime 继续使用 capability allowlist：只允许 captured runtime tree 内相对模块及 `node:crypto`、`node:async_hooks` 两个固定内建；其他 `node:*`、bare package、`node:module/createRequire`、动态非相对 import、addon/worker/vm 一律在加载前失败。frozen minimal process facade 不提供 `getBuiltinModule`、`binding`、`_linkedBinding`、`dlopen`、`mainModule`、真实 env 或任意非 IPC stdio handle；`fetch`、`WebSocket`、`EventSource` 和网络 global 通过窄 sentinel 向 stage0 报告后拒绝。环境变量使用固定 allowlist，不继承 proxy/credential/loader/NODE_OPTIONS。静态 graph、Node permission、同步 loader、global/process facade 与真实子进程负例共同验证不存在 ambient bypass。

deny port 必须在真实依赖路径上。`src/neoloop/contracts/ports.ts` 增加 P04 readiness 专用 network、OpenAPI、formal business-write 与 fixture-seed IPC port；stage0 parent 每次收到请求先递增对应私有计数，前三类一律拒绝，seed 只在 measured window 前按 signed fixture 的 exact operation plan 允许。新增 readiness-only `P04InstrumentedW6FixtureRepository` adapter，包裹公开 W6 repository 入口，只接受 frozen synthetic fixture 和 parent broker ports；worker-private `InMemoryFrontHalfRepository` 的 fixture seed/receipt/security state 可存在，并通过 seed counter 与 manifest 守恒，但任何外部/formal Cases、Clusters、Improvements、归属、关系、状态或车辆字段持久化请求必须经过 formal business-write deny port。不得修改 W6 repository private guard；若 adapter 无法仅靠公开入口实现，停止并回到规格复核。

stage0 只能经 broker IPC 请求 launcher 以 `process.execPath + captured p04-compiler-runner.mjs`、本次 instantiated compiler profile、固定参数、sanitized env、限时限长执行 snapshot 编译；runner 通过 captured TypeScript compiler API + exact ParseConfigHost/CompilerHost 读取 source/compiler/lib/type/package inputs 并生成前述三段 read receipt，不调用 PATH 中的 `tsc`。launcher 在 spawn 前保存当前 umask、临时设为 `0o077`，spawn 后在 finally 恢复；未恢复也按失败清理。

launcher-owned 临时拓扑唯一为 `runtime_root/package.json` 与 `runtime_root/compiler_work_root/`，其中 package bytes 必须逐字等于第 12.1 节 P04 专属 exact package，compiler work root 在 compiler prepare 时已由 launcher 安全创建且目录枚举为 0，`runtime_root/compiler_work_root/outDir/` 此时必须不存在。compiler prepare 的 path roles 分别绑定 empty writable compiler work root 与 captured compiler inputs；snapshot `captured_compiler_inputs` 内的 P04 package metadata 与 `runtime_root/package.json` 是同 bytes、不同 descriptor/path-role 的两个对象：前者供 compiler 三段 read receipt，后者只作为未来 NodeNext runtime package boundary，compiler 无需读取。stage0 只有独立 bookkeeping write role，对 runtime root 始终无 fs-write。

compiler 只允许在 launcher-owned work root 内创建 outDir/emitted files。编译结束后 launcher 逐项 `lstat/open/fstat`，要求路径位于 work root、普通文件、无 symlink/hardlink、owner 正确、权限不宽于 0600、成员与 compiled-output manifest exact，并从已打开 descriptor 哈希；launcher 随后撤销 compiler 进程、关闭所有写 handle，把 package/output files 收紧为只读、runtime root/work/outDir 收紧为只读目录，再形成 signed runtime-metadata/directory-manifest result 经 authenticated broker IPC 交给 stage0复核。stage1 prepare 只能在这之后把完整 `runtime_root` 作为带实际 `directory_manifest` 的 readonly-directory path role捕获。stage0 从未持有该树写权限，因此不依赖 Node 运行时撤权；任何编译后写入、冻结后 identity/content/permission 变化或不在 manifest 的成员均失败。

`compiler_module_loaded_manifest`、`compiler_resolution_metadata_read_manifest`、`compiler_host_read_manifest` 三者的排序去重 union 必须与 compiler manifest 删除由 launcher prepared/commit receipt 单独绑定的 bootstrap entry 后 exact deep-equal，且只调用第 7.2 节同一 projection/helper。stage0 自建 receipt/bookkeeping 文件仍必须 O_EXCL/O_NOFOLLOW/0600；captured snapshot 与 runtime tree 只能由 launcher创建。任何预存 outDir、额外文件、identity/permission/package-boundary漂移、compiler 未声明读取或未读取 manifest 成员，以 `compiler_capture/compiled_output/runtime_loaded` 失败。

### 7.3 场景摘要

`scenario_summaries` 固定七项且顺序固定：

```text
n1_valid
n1_prompt_injection
n1_schema_failure_twice
n5_action_scoped_receipt
day7_closed_at_less_than_boundary
day7_closed_at_equal_boundary
n5_receipt_reused_for_n6
```

每项 exact shape：

```text
scenario_id
fixture_id
fixture_sha256
captured_fixture_object_sha256
execution_receipt_sha256
actual_object_sha256
status = passed | failed
ai_attempt_count: safe_count
ai_audit_count: safe_count
business_write_count: safe_count
fixture_seed_operation_count: safe_count
outcome_sha256: sha256
```

passed 的唯一计数矩阵为；seed 列中的 `signed fixture value` 表示必须等于对应 signed fixture-entry 的 exact safe count，且四个 W6/N5 fixture 均大于 0：

| scenario_id | AI attempt | AI audit | formal business write | fixture seed |
| --- | ---: | ---: | ---: | ---: |
| `n1_valid` | 1 | 1 | 0 | 0 |
| `n1_prompt_injection` | 1 | 1 | 0 | 0 |
| `n1_schema_failure_twice` | 2 | 2 | 0 | 0 |
| `n5_action_scoped_receipt` | 0 | 0 | 0 | signed fixture value |
| `day7_closed_at_less_than_boundary` | 0 | 0 | 0 | signed fixture value |
| `day7_closed_at_equal_boundary` | 0 | 0 | 0 | signed fixture value |
| `n5_receipt_reused_for_n6` | 0 | 0 | 0 | signed fixture value |

后四个 scenario（归属三类 W6/N5 语义）通过 `P04InstrumentedW6FixtureRepository` 使用预先验证的 synthetic envelope 与内存 receipt fixture，不调用 provider，所以 AI attempt/audit 固定为 0。每个 worker 启动 measured window 前，stage0 只允许一次由 signed fixture 定义的 composite in-memory seed transaction；transaction 内每个公开 repository seed/transition 调用都经 fixture-seed IPC 计数并与 fixture manifest 的 expected count 守恒。该 seed 仅构造 worker-private `InMemoryFrontHalfRepository` 合成前置状态，不是外部/formal persistence，不计入 `business_write_count`；任何 Cases/Clusters/Improvements/状态等正式或外部持久化端口调用仍计为 formal business write 并必须为 0。若仅靠公开 API 不能完成 exact seed，则停止实现并回到规格复核，不得调用 private guard。

每个 `fixture_id/fixture_sha256` 必须与 scenario fixture manifest 同序同值；worker 实际收到的 canonical object 重算值必须等于 `captured_fixture_object_sha256=fixture_sha256`。`actual_object_sha256` 必须等于对应 execution receipt 中对真实 allowlisted result object 的摘要。每个 `outcome_sha256` 固定为 `SHA256("neoloop:p04-scenario-outcome:v1\0" || canonical_json({scenario_id,fixture_id,fixture_sha256,captured_fixture_object_sha256,execution_receipt_sha256,actual_object_sha256,status,ai_attempt_count,ai_audit_count,business_write_count,fixture_seed_operation_count,normalized_outcome}))`；`normalized_outcome` 使用该场景 exact allowlist，不能包含日志、路径、资源 ID 或自由文本。

七个 `normalized_outcome` 的 exact shape 分别为：

```text
n1_valid = { envelope_key_count, envelope_key_set_digest, validation_valid, retry_count, final_status }
n1_prompt_injection = { treated_as_untrusted_text, instruction_executed, exposed_capability_count, forbidden_action_available }
n1_schema_failure_twice = { invalid_output_count, repair_retry_count, total_attempt_count, audit_record_count, final_status, downstream_continued }
n5_action_scoped_receipt = { expected_action, receipt_action, action_match, accepted }
day7_closed_at_less_than_boundary = { boundary_relation: less_than, reopen_allowed }
day7_closed_at_equal_boundary = { boundary_relation: equal, reopen_allowed }
n5_receipt_reused_for_n6 = { source_action: N5, target_action: N6, reuse_rejected }
```

其中 action、relation、status 都使用闭集枚举；所有计数/布尔由真实返回值重算。`expected_action/receipt_action` 只允许 N5/N6，不包含 receipt ID。

scenario `status=passed` 的 normalized outcome 唯一谓词为：

- `n1_valid`：count=14、key-set digest 等于第 6.6 节固定摘要、validation=true、retry=0、final=`ok`；
- `n1_prompt_injection`：untrusted=true、instruction=false、exposed count=0、forbidden=false；
- `n1_schema_failure_twice`：invalid=2、repair retry=1、total attempt=2、audit=2、final=`needs_human`、downstream=false；
- `n5_action_scoped_receipt`：expected=`N5`、receipt=`N5`、match=true、accepted=true；
- Day7 `<` 与 `==` 两项都要求 reopen=false；
- N5→N6 复用项固定 source=`N5`、target=`N6`、reuse_rejected=true。

任一值偏离时该 scenario 必须为 failed 并产生 `scenario_failure`；调用方不能保留 passed 再只修改 outcome digest。

`fixture_execution_receipts` 是 scenario、provider hardening、scope guard 与 live-validator fixture 的合同顺序并集，每个 fixture 精确一项：

```text
fixture_class: scenario | provider_hardening | scope_guard | live_validator
fixture_id
declared_fixture_sha256
captured_fixture_object: exact class-specific canonical fixture
captured_fixture_object_sha256
fixture_dispatch_ordinal: 1..256
fixture_dispatch_nonce_digest
worker_entry_sha256
worker_invocation_digest
permission_commit_receipt_sha256
target_entry_sha256
target_call_receipt: exact authenticated target-call receipt
target_call_receipt_sha256
seed_operation_receipts: ordered exact authenticated seed-operation receipt array
seed_operation_receipt_digest
actual_object: exact class-specific allowlisted result object
actual_object_sha256
worker_completion_digest
parent_counter_before: exact parent-counter snapshot
parent_counter_after: exact parent-counter snapshot
worker_exit_code: 0 | 1
receipt_sha256
```

`parent-counter snapshot` exact 为 `{deny_port_counts:{network,openapi,formal_business_write,permission_denial},ai_attempt_count,ai_audit_count,fixture_seed_operation_count,fixture_seed_operation_ledger_digest,target_call_count,target_call_ledger_digest}`，全部为 stage0 私有 safe count/digest。空 ledger 常量分别为 `SHA256("neoloop:p04-empty-seed-operation-ledger:v1\0")` 与 `SHA256("neoloop:p04-empty-target-call-ledger:v1\0")`。`fixture_dispatch_nonce_digest = SHA256("neoloop:p04-fixture-dispatch-nonce:v1\0" || raw_32_byte_nonce)`；`worker_invocation_digest = SHA256("neoloop:p04-worker-invocation:v1\0" || canonical_json({fixture_class,fixture_id,fixture_dispatch_ordinal,fixture_dispatch_nonce_digest,captured_fixture_object_sha256,worker_entry_sha256,target_entry_sha256,permission_profile_template_sha256,permission_prepared_receipt_sha256}))`。raw nonce 只经 child control FD 交付，不进入报告；worker 的 spawn invocation 先绑定 prepared receipt，实际返回的 fixture/child-load receipt 再绑定同 pair 的 commit receipt。

`captured_fixture_object_sha256 = SHA256(canonical_json(captured_fixture_object))` 且必须等于 manifest declared SHA。受控 loader 为每个 fixture 的唯一目标导出安装不向 worker 模块暴露的 wrapper capability；launcher另给 loader closure 一枚 raw 32-byte target-call capability nonce，worker只拿 dispatch nonce，不能取得前者。wrapper 必须直接接收 captured fixture input、调用真实目标并在 return/throw 边界把返回值规范化为 `{return_kind:returned|closed_error,actual_object:exact class-specific allowlisted result object,target_result_sha256}`；closed error 也先投影成该 class 的 exact error result object。`target_result_sha256 = SHA256("neoloop:p04-fixture-actual-object:v1\0" || canonical_json({fixture_class,fixture_id,actual_object}))`。stage0 只从此 authenticated wrapper exit 取得 `actual_object`，不接受 worker提供或改写结果摘要。

launcher 通过彼此隔离的 authenticated internal FD 把同一 target capability nonce交给 loader closure 与 stage0 verifier，不给 stage1/worker。每个 fixture 的 target 与 seed capability nonce 都必须新生成 32 bytes，它们的 `capability_nonce_digest = SHA256("neoloop:p04-capability-nonce:v1\0" || length_prefixed_utf8(capability_kind) || raw_capability_nonce_32_bytes)` 在全 run/跨 domain 两两不同。target `capability_proof_digest = HMAC_SHA256(key=raw_target_capability_nonce_32_bytes,data=UTF8("neoloop:p04-target-call-capability-proof:v1\0") || raw_dispatch_nonce_32_bytes || worker_invocation_digest_raw_32_bytes || canonical_json(event_without_capability_proof_digest_and_event_digest))`。seed adapter 使用另一枚 raw nonce与独立 `neoloop:p04-seed-operation-capability-proof:v1` domain，`seed capability_proof_digest = HMAC_SHA256(key=raw_seed_capability_nonce_32_bytes,data=UTF8("neoloop:p04-seed-operation-capability-proof:v1\0") || raw_dispatch_nonce_32_bytes || worker_invocation_digest_raw_32_bytes || canonical_json(seed_receipt_without_capability_proof_digest_and_event_digest))`。这两个 keyed preimage 分别覆盖 target 的 fixture/input/previous event/enter-or-exit/真实 result，以及 seed 的 ordinal/op/input/before/outcome/after/state-transition；不引用目标 proof/event digest，不形成摘要环。stage0 必须用私有 raw nonce 从完整 event/receipt 重算 proof；只比较调用方提供摘要、替换已认证 event 的 result/state payload、两种 capability 复用或 worker 获得任一 raw capability 均失败。

`target-call event` exact 为 `{event_ordinal,previous_event_digest,event_kind:enter|exit,fixture_dispatch_ordinal,fixture_dispatch_nonce_digest,capability_nonce_digest,target_entry_sha256,captured_fixture_object_sha256,target_result_sha256:null|sha256,capability_proof_digest,event_digest}`；`event_digest = SHA256("neoloop:p04-target-call-event:v1\0" || canonical_json(event_without_event_digest))`，第一项 previous=empty-target-ledger，之后逐项链接。每个 fixture 只能有 enter/exit 两项，exit 必须携带 result SHA。`target_call_receipt` exact 为 `{schema_version:p04_target_call_receipt.v1,fixture_id,worker_invocation_digest,permission_commit_receipt_sha256,ordered_events,target_result_sha256,final_ledger_digest,receipt_sha256}`；`final_ledger_digest` 等于末项 event digest，`receipt_sha256 = SHA256("neoloop:p04-target-call-receipt:v1\0" || canonical_json(receipt_without_receipt_sha256))`。`actual_object_sha256` 必须由 stage0 从 wrapper return 按同一公式重算并 exact 等于 `target_result_sha256`；worker 自发发送同形消息、保留旧 proof 却替换 result/state payload、真实调用后丢弃返回值再提交冻结 expected object、target未调用或调用两次均失败。

parent 全局 ledger 只按 fixture dispatch ordinal追加：`target_call_ledger_after = SHA256("neoloop:p04-parent-target-call-ledger-step:v1\0" || target_call_ledger_before_raw_32_bytes || target_call_receipt.receipt_sha256_raw_32_bytes)`；seed 对应为 `seed_operation_ledger_after = SHA256("neoloop:p04-parent-seed-operation-ledger-step:v1\0" || seed_operation_ledger_before_raw_32_bytes || seed_operation_receipt_digest_raw_32_bytes)`。execution receipt 的 parent before/after 必须满足这两条公式及count delta；没有target/seed事件时相应digest与count必须不变。完整 ordered receipt对象随fixture execution receipt输出，独立verifier不接受只有final裸SHA的账本。

四个 W6 fixture 的每个 seed 请求必须逐项等于 signed `seed_plan` 的 ordinal/public operation/input digest/expected outcome，stage0 在 measured window 前才允许。seed adapter 与 target wrapper 使用不同的隐藏 capability；每个真实 public repository operation 返回后直接形成 `seed-operation receipt`，exact 为 `{ordinal,previous_event_digest,public_operation_id,input_sha256,capability_nonce_digest,normalized_before_state,actual_outcome_code,normalized_after_state,state_transition_digest,capability_proof_digest,event_digest}`。before/after state是由`p04-contract.mjs`按operation导出的exact安全合成投影；`state_transition_digest = SHA256("neoloop:p04-seed-state-transition:v1\0" || canonical_json({public_operation_id,input_sha256,normalized_before_state,actual_outcome_code,normalized_after_state}))`。`event_digest = SHA256("neoloop:p04-seed-operation-event:v1\0" || canonical_json(receipt_without_event_digest))`，第一项 previous=empty-seed-ledger、后续链式相连。ordered receipts 必须逐项等于 signed plan 的 ordinal/op/input/expected outcome，`seed_operation_receipt_digest` 等于末项 event digest（空 plan 使用 empty-ledger 常量），count 与 plan exact 守恒。只发送正确 request/count而未实际调用公开 operation、保留 capability proof 却替换 actual outcome/before/after/transition、真实 outcome/state transition 不符或复用 capability 均失败。

`worker_completion_digest = SHA256("neoloop:p04-worker-completion:v1\0" || raw_dispatch_nonce_32_bytes || worker_invocation_digest_raw_32_bytes || target_result_sha256_raw_32_bytes)`，worker 终态 IPC 必须携带该值作为 liveness ack；stage0 用私有 raw nonce复核，但 `actual_object` 仍只取 authenticated target wrapper receipt。随后 stage0 形成 `receipt_sha256 = SHA256("neoloop:p04-fixture-execution-receipt:v1\0" || canonical_json(receipt_without_receipt_sha256))`。receipt 只能由 stage0 根据 dispatch nonce、完整 target-call/seed receipt对象、对应 prepared/commit pair 的 commit receipt、worker liveness IPC 与 parent counter snapshot生成；stage1/worker不能自报 parent counts、receipt或 actual-object digest。counter delta 必须逐 fixture等于 scenario/hardening/live-validator 的固定 attempt/audit/formal-write/seed/target-call期望。对应 scenario/case/live fixture summary必须携带同一 captured object SHA、authenticated actual object SHA/结果摘要和receipt SHA；缺actual object、未执行补默认值、manifest/worker对象错配或receipt复用均失败。

`fixture_execution_receipt_bundle_sha256 = SHA256("neoloop:p04-fixture-execution-receipt-bundle:v1\0" || canonical_json(按 dispatch ordinal 排序的 receipt_sha256 数组))`；数组必须覆盖 scenario、provider hardening、scope guard 与 live-validator manifest 的 exact 并集且无重复、缺项或额外项。

`hardening_results` 不冒充第八个业务场景，精确包含：

```text
provider_error_cases: ordered exact case-summary array
scope_guard_cases: ordered exact case-summary array
raw_provider_leak_count: safe_count
invoker_call_count_on_scope_failures: safe_count
audit_call_count_on_scope_failures: safe_count
repository_call_count_on_scope_failures: safe_count
hardening_results_sha256: sha256
```

provider error cases 固定顺序与唯一映射为：

| case_id | outcome_code | attempt / audit / leak |
| --- | --- | --- |
| `trusted_provider_unavailable` | `provider_unavailable` | `1 / 1 / 0` |
| `trusted_provider_timeout` | `provider_timeout` | `1 / 1 / 0` |
| `trusted_provider_refused` | `provider_refused` | `1 / 1 / 0` |
| `trusted_provider_protocol_error` | `provider_protocol_error` | `1 / 1 / 0` |
| `trusted_unknown_provider_error` | `unknown_provider_error` | `1 / 1 / 0` |
| `untrusted_thrown_value` | `unknown_provider_error` | `1 / 1 / 0` |

scope guard cases 固定顺序为 `enterprise_data`、`live_feishu`、`unknown_scope`，三项 `outcome_code=scope_rejected`，且 `attempt_count=0`、`audit_count=0`、`sensitive_leak_count=0`。每个 case summary exact 为 `{case_id,fixture_sha256,captured_fixture_object_sha256,execution_receipt_sha256,actual_object_sha256,status:passed|failed,outcome_code,attempt_count,audit_count,sensitive_leak_count}`，fixture SHA 必须与 hardening fixture manifest、captured actual fixture object 和对应 execution receipt 同序同值；`actual_object_sha256` 必须由 receipt 中真实 allowlisted result object 重算；`outcome_code` 的闭集仅为上表五个 provider code 与 `scope_rejected`。合法结果要求 9 项全 passed、raw leak=0，scope failure 均在 invoker/audit/repository 前拒绝且 parent-owned 三个全局调用计数均为 0。`hardening_results_sha256 = SHA256("neoloop:p04-hardening-results:v1\0" || canonical_json(hardening_results_without_digest))`。

`live_validator_results` exact 为：

```text
fixture_results: ordered exact fixture-result array
positive_fixture_count: safe_count
positive_pass_count: safe_count
mutation_fixture_count: safe_count
mutation_reject_count: safe_count
validator_call_count: safe_count
business_write_count: safe_count
live_validator_results_sha256: sha256
```

每个 fixture-result exact 为 `{fixture_id,fixture_sha256,captured_fixture_object_sha256,execution_receipt_sha256,expected_validation_status,observed_validation_status,expected_issue_codes_digest,observed_issue_codes_digest,actual_object_sha256}`，顺序和 `live_validator_fixture_manifest` exact deep-equal；issue digest 固定为 `SHA256("neoloop:p04-live-validator-issue-codes:v1\0" || canonical_json(sorted_unique_issue_codes))`。expected 值由 `p04-contract.mjs` 冻结，observed/actual object 来自本次 scenario worker 对 captured validator 的实际调用，execution receipt 由 stage0 根据 worker IPC 与 parent counter snapshot 形成。positive 全部 expected/observed=`passed` 且两侧绑定空 issue array 摘要，mutation 全部 expected/observed=`failed` 且 issue digest exact；validator call count 等于 fixture 数，business write固定 0。`live_validator_results_sha256 = SHA256("neoloop:p04-live-validator-results:v1\0" || canonical_json(live_validator_results_without_digest))`。缺 fixture/actual object/receipt、未执行而补默认值、重复调用、expected/observed 不等或 manifest 未绑定都失败。

`local_contract_results` exact booleans：

```text
dependency_contract_aligned
validator_freeze_chain_verified
typed_live_proof_ready
n1_structured_sample_verified
fourteen_field_envelope_verified
prompt_injection_boundary_verified
single_repair_retry_verified
second_failure_human_stop_verified
ai_audit_conservation_verified
n5_action_receipt_verified
day7_boundary_verified
n5_to_n6_reuse_rejected
upstream_error_redaction_verified
synthetic_scope_guard_verified
external_release_root_verified
external_launcher_control_verified
freeze_attestation_sidecars_verified
stage_isolation_verified
permission_profile_instantiation_verified
runtime_freeze_receipt_verified
parent_owned_counters_verified
fixture_execution_receipts_verified
fixture_target_calls_verified
p04_w6_fixture_adapter_verified
```

二十四个 boolean 由以下唯一谓词重算：

| 字段 | 唯一 derivation |
| --- | --- |
| `dependency_contract_aligned` | contract manifest 中 suite/acceptance/matrix 均冻结 P02+P03，且 P04 live minimum action 不含 N5/Day7 |
| `validator_freeze_chain_verified` | validator manifest 四成员 exact，且 Contract→Offline→Day-1→live-P04 的每条固定 SHA/attestation/schema edge 均从 captured bytes 重算一致 |
| `typed_live_proof_ready` | `live_validator_results` 与 live-validator fixture manifest 逐项绑定，全部 positive pass、全部 mutation reject、call count 守恒、business write=0 且 results digest 可复算 |
| `n1_structured_sample_verified` | `n1_valid` passed 且 normalized outcome `final_status=ok` |
| `fourteen_field_envelope_verified` | N1 `envelope_key_count=14`、`envelope_key_set_digest` 等于固定 key-set digest、`validation_valid=true` |
| `prompt_injection_boundary_verified` | injection scenario passed，instruction=false、capability=0、forbidden=false |
| `single_repair_retry_verified` | schema failure invalid=2、repair retry=1、AI attempt=2 |
| `second_failure_human_stop_verified` | schema failure final=`needs_human` 且 downstream=false |
| `ai_audit_conservation_verified` | N1 三场景 AI attempt/audit 分别 1/1、1/1、2/2 且总计 4/4 |
| `n5_action_receipt_verified` | N5 action-scoped receipt scenario passed 且 action match=true |
| `day7_boundary_verified` | `<` 与 `==` 两个 Day7 scenario 均 passed 且 reopen allowed=false |
| `n5_to_n6_reuse_rejected` | receipt reuse scenario passed 且 reuse rejected=true |
| `upstream_error_redaction_verified` | 6 个 provider hardening cases 全 passed、raw leak=0 |
| `synthetic_scope_guard_verified` | 3 个 scope cases 全 passed，invoker/audit/repository calls 均为 0 |
| `external_release_root_verified` | control receipt 声明的 approver fingerprint/有效期/spec/release-manifest/source/三类 fixture/compiler/stage0 entry/profile template/contract/validator/sidecar/launcher-contract pins 与 captured root 数学一致；它在 inner candidate 中只是被签声明，只有 outer verifier 用工作区外 anchor 复核后才建立外部信任 |
| `external_launcher_control_verified` | embedded launcher public key可验证 control receipt 数学签名，verifier challenge/audience/issued/expiry、key fingerprint、snapshot/release-manifest/stage0/profile template+stage0 instantiation 摘要与 captured bytes 一致；是否属于工作区外固定 launcher trust config、challenge 是否当前未消费只由 outer launcher/verifier判定，最终 passed 仍需外层 attestation验签并原子消费 challenge |
| `freeze_attestation_sidecars_verified` | 四份 sidecar exact、digest 可复算且分别绑定 validator bytes与单向上游 pins；signed root 单向绑定 sidecar bundle，不要求 sidecar 反向含 root |
| `stage_isolation_verified` | launcher→stage0→captured stage1→scenario worker receipt 全通过，Node permission/capability profile 与每次 launcher-normalized execArgv/permission probe 一致 |
| `permission_profile_instantiation_verified` | signed template、stage0 control instantiation 与按 spawn ordinal 排列的 compiler/stage1/worker signed prepared/commit pairs 全部可复算；每份 child/fixture receipt只绑定本次对应 commit digest，pre-spawn invocation 只绑定 prepared digest，terminal/run/outer绑定完整 pair bundle |
| `runtime_freeze_receipt_verified` | launcher-signed runtime-freeze receipt 的 control/session/compiler commit、metadata、完整逐成员 readonly tree、content digest 与签名可复算，且同一 digest进入 pre-stage1 projection、stage1 invocation、run summary与outer report；stage0只验签不重开或改写 runtime tree |
| `parent_owned_counters_verified` | deny/permission/attempt/audit/write/seed/target-call counters 与 ledger digest 由 stage0 parent 持有，所有 execution receipt 的 before/after snapshot 守恒 |
| `fixture_execution_receipts_verified` | 四类 fixture 的 captured object、受控 wrapper真实返回 actual object、dispatch nonce/ordinal、prepared/commit pair、parent counters 与 stage0 receipt 一一绑定且 digest 可复算 |
| `fixture_target_calls_verified` | 每个 fixture 的受控 target wrapper enter/exit exact=1，target entry/dispatch/capability/真实 return receipt 与 actual object SHA exact绑定；未调用、调用后丢弃真实返回补 expected object或重复调用均拒绝 |
| `p04_w6_fixture_adapter_verified` | 后四个 scenario（归属三类 W6/N5 语义）只经 `P04InstrumentedW6FixtureRepository` 公开入口和 signed synthetic seed 运行，formal write 请求只能到 parent deny port |

调用方提供的 boolean 数组必须与上述重算结果 exact deep-equal；不能仅靠测试文件存在或自报摘要标 true。

`onsite_gaps` exact booleans，当前全部为 false：

```text
feishu_ai_entry_verified
feishu_quota_allows_probe_verified
feishu_run_trace_verified
feishu_provider_adapter_ready
p04_completion_contract_verified
```

旧键 `onsite_p04_completed_verified` 一律视为 unknown key。五项当前全部固定为 false，表示现场合同尚未满足，而不是反向证明平台能力不存在。

本地结果只有在真实执行对应合成 fixture、七项 scenario summary 全部通过且所有 digest 绑定成立后才能为 true；不能只因源码或测试文件存在而标记通过。

### 7.4 digest

`report_digest` 固定为：

```text
SHA256(
  UTF8("neoloop:p04-readiness:v1\0")
  || canonical_json(report_without_report_digest)
)
```

canonical JSON 使用递归排序键、UTF-8、无额外空白；数组保持合同顺序。digest preimage 包含 `issue_codes`，但排除 `report_digest` 自身。serializer 必须重新计算并拒绝调用方提供的伪造 digest。

### 7.5 唯一通过谓词与生命周期

`issue_codes` 是按下列合同顺序排序、去重的闭集数组：

```text
input_transport
duplicate_json_key
invalid_json
contract_drift
validator_freeze_chain
freeze_attestation
release_manifest
release_root_signature
external_trust_anchor
external_launcher_attestation
launcher_control_receipt
verifier_challenge
live_state_drift
live_validator_execution
evidence_bundle
content_binding
capture_receipt_chain
pre_action_challenge
source_capture
fixture_capture
fixture_execution_receipt
fixture_seed_plan
target_call_receipt
compiler_capture
compiler_read_receipt
compiler_outdir
runtime_engine
permission_model
permission_profile_instantiation
stage_isolation
parent_counter
compiled_output
runtime_loaded
runtime_metadata
runtime_freeze_receipt
harness_runtime_loaded
snapshot_cleanup
scenario_failure
hardening_failure
attempt_conservation
audit_conservation
run_binding
artifact_ref
mutation_ledger
audit_query_receipt
fallback_result
alias_domain
w6_fixture_adapter
side_effect_port_called
capability_bypass
provider_error_leak
scope_violation
sensitive_value
run_summary_digest
report_digest
report_shape
serializer_pollution
cli_arguments_forbidden
```

inner report 的 `validation_status=passed` iff 同时满足；它仍只是 candidate，只有工作区外 launcher 生成并由外部 verifier 验证的 `p04_readiness_attestation.v1` 才是最终 passed evidence：

1. `issue_codes=[]`、`exit_code=0`、scenario count=7；
2. 七场景均 `status=passed` 且严格等于第 7.3 节计数矩阵；
3. 6 个 provider error 与 3 个 scope guard hardening cases 全部通过，全部 leak/call count 为 0；
4. live-validator fixture results 与 manifest 一一绑定，positive 全 pass、mutation 全 reject、调用守恒、业务写=0；
5. 二十四个 `local_contract_results` 全为 true；
6. 三个 deny-port 与 permission-denial count 全为 0，target-call/seed-operation/attempt/audit/formal-write parent counter 与每个 fixture exact 守恒；
7. source/三类 fixture/compiler/read-receipt/runtime-metadata/runtime-freeze-receipt/compiled-output/scenario-runtime-loaded/harness-runtime-loaded/contract/validator/sidecar/release-manifest/release-root/launcher-control/profile-template/profile-instantiation/live-state/fixture-receipt/stage0-terminal/run-summary/report digest 全部可复算且相等，approver 与 launcher Ed25519 signature 有效；
8. `p04_live_state` 精确为当前 `not_tested/null/proof absent/bundle absent/may_advance=false`；
9. 五个 `onsite_gaps` 全为 false；
10. serializer 输出 exact shape，且敏感扫描为零命中。

任一条件不满足时不得形成最终 attestation。control FD 只属于 launcher 直接启动的 stage0，绝不交给 report CLI。工作区内 `report-p04-readiness.mjs` 被直接执行时，无论是否存在伪造 FD/env/argv，都只输出独立 fixed failure envelope；candidate 仅能由 captured stage1 通过受控 IPC 交给 stage0，再由 launcher复核：

```text
schema_version = p04_readiness_failure.v1
scope = P04_local_readiness_only
fact_class = synthetic_experiment
validation_status = failed
issue_codes = sorted unique non-empty closed enum array
report_artifact_written = false
```

并以 exit 1 结束。serializer 从观察值重算状态和 issue，不接受调用方自报 passed/failed。不存在“部分通过”或 exit 2；failure envelope 没有 source/path/provider 文本或 digest 占位字段。inner candidate 通过但 launcher 外层复核/清理/签名失败时同样只输出 failure envelope，绝不泄露或降格输出未签 candidate。测试不得使用“report CLI 缺 control FD”作为 stage0 信任测试；应分别验证 direct report CLI 永远失败、stage0 缺专属 control FD 失败。

用户入口仍是 stdout-only：成功时由 trusted launcher 只输出一行 canonical signed attestation，失败时只输出 fixed failure envelope；工作区内 candidate CLI 的 stdout/pipe 不得直接交付。整条流程不在仓库、项目目录或证据目录创建、覆盖、移动或归档任何持久文件。运行期间只允许 launcher 创建的 0700 私有临时根内写一次性 source snapshot、compiler work root/outDir 与 loader bookkeeping。stage0 自建文件使用 O_EXCL/O_NOFOLLOW、普通文件且 0600；compiler-owned outDir/emitted files按第 7.2 节 post-compile identity/permission/manifest 规则验收，不虚假声称 O_EXCL。临时根必须在任何成功 stdout 之前完整清理并复核不存在；清理失败产生 `snapshot_cleanup`，只输出 failure envelope，绝不输出 attestation/candidate。readiness 是 P04 首动作前的一次性 preflight snapshot。只要 live P04 不再是 `not_tested/null` 或固定 bundle 不再是 absent，流程必须以 `live_state_drift` 失败，不输出新的 passed attestation。若调用方在独立交付流程中保存过旧 attestation，只能把它作为带签名与 digest 的历史本地合成证据归档，不能进入 live proof 或推导现场状态；该保存流程不属于本规格实施范围。

## 8. 错误脱敏与运行时边界

### 8.1 provider 错误

现有 runner 仍会把异常 `.message` 拼入 envelope/audit；实施阶段必须删除这一行为。修改后，上游异常只允许映射到以下固定闭集：

```text
provider_unavailable
provider_timeout
provider_refused
provider_protocol_error
unknown_provider_error
```

新增内部 `ProviderInvocationFailure` 合同。可信 adapter 只能通过模块内工厂创建闭集错误，code 存入私有 `WeakMap`；runner 使用 `WeakMap.has/get` 读取，不枚举 thrown value，也不读取任意异常的 `message`、`cause`、`code`、`name`、prototype 或 getter。任何非可信 thrown value 一律映射 `unknown_provider_error`。

provider exception 的 runner 输出固定为同一 14 字段 envelope 结构：

```text
status = error
payload = null
evidence_spans = []
missing_fields = []
confidence = null
validation = { valid: false, errors: [closed_provider_error_code] }
retry_count = current invocation retry ordinal (0 | 1)
human_revision.state = pending
```

其余 identity、node/mode/version、scope 与时间字段沿用本次受控 invocation 的安全值。首个 invocation 异常时 retry ordinal=0；若第一次 schema invalid 后唯一修复 invocation 再抛 provider exception，则保留真实 ordinal=1，并立即停止，不产生第三次调用。每个 provider exception 精确追加一条 audit，audit 的 closed error code、attempt number 与 envelope 完全相同；provider exception 本身不得再启动 schema repair retry。任何由非可信 thrown value 映射出的异常只产生 `unknown_provider_error`。serializer、audit sink 和 readiness summary 只读取 runner 产出的闭集 code，不再接触原 thrown value。

原始 message、cause、stack、request ID、URL、账号、资源 ID 和 provider payload 只允许在受控进程内短暂存在，不能进入返回值、audit、测试快照、readiness 报告或 live evidence。错误类不是从原始 message 猜测出来的。

### 8.2 合成范围

P04 离线 harness 固定 `synthetic_experiment`，CLI 无 scope 参数，调用方也不能覆盖 fact class。JS 绕过类型传入其他值时，必须在 invoker、audit、repository 或 deny-all port 调用前 fail-closed。任何企业数据、live Feishu、真实 provider 或未知 scope 输入均失败，且网络、OpenAPI 和业务写计数保持 0。

这项约束只保护离线 readiness 入口，不声称真实 provider adapter 已完成。未来 adapter 必须另行设计、审批和验收。

## 9. Live validator

新增 `validate-live-p04-evidence.mjs`，固定读取两份 live 脱敏 JSON、固定 live evidence bundle 和外部 release-root trust channel，不接受路径、bundle、key 或状态参数，不改写输入。not_tested 只接受 bundle absent 空态；blocked 先按第 6.1/6.2 节区分“合法 safe partial”与“已持久 invalid capture”，前者可得 validator passed 但 completion 固定 false，后者 validator fail-closed 并维持 blocked/null。completed 必须先完成 bundle actual-content、challenge/receipt、签名链和 release-root binding，再重算全部 typed proof 谓词，且 `completion_eligible` 必须为 true。

验证器职责：

1. 校验 results/on-site 的 P04 唯一性、状态映射和三方 evidence index 绑定；
2. `not_tested` 时要求所有实际字段、`actual_p04_proof_ref` 与 `actual_p04_proof` 为 null，bundle 精确为 absent 空态；
3. `blocked` 时先分类：contract-valid safe partial 要求首动作和 full-shape partial proof/ref 非空、`proof_stage=attempted`、`completion_eligible=false`；invalid capture 要求 proof/ref 均为 null、bundle 为 attempted 实际连续前缀、validator fixed failed，且不得继续动作。limitations、stop reason 与 fallback 只在 safe partial 中按实际观察和第 6.10 节谓词派生，不要求无事实的占位值；
4. `completed` 时要求 typed proof exact shape、所有规定动作、run/artifact binding、mutation ledger、逐 mode fallback、分类条件和清理闭环；
5. 校验 results proof ref、on-site canonical proof、parent evidence indexes、bundle actual bytes/content hashes、pre-action challenge/receipt、capture receipt signature chain、external release root、scenario digest、业务 before/after 与 mutation window 的完整绑定；
6. 阻止离线 readiness、unit test、内存 audit 或静态 manifest 被写成飞书现场证据；
7. 全文件扫描 URL、账号、凭证、飞书格式 App/Base/table/view/record/field ID、locator、二维码、provider raw、stack 和 cause；
8. 固定报告输出 `local_readiness_evidence_present_in_live=false`。live validator 永不读取 readiness 报告，也不从本地结果推导现场完成。

当前 live snapshot 的合法报告必须是：

```text
validation_status = passed
p04_state_not_tested_verified = true
p04_result_null_verified = true
p04_actual_proof_ref_null_verified = true
p04_actual_proof_null_verified = true
local_readiness_evidence_present_in_live = false
p04_completion_contract_verified = false
feishu_ai_capability_derived = false
observation_truth_machine_verified = false
business_write_count = null
live_bundle_absent_verified = true
external_release_root_verified = false
```

这里的 `passed` 只表示当前未测试状态被诚实保存。

readiness 与 live validator 使用两套 serializer：

- readiness serializer 永远要求 `may_advance_live_status=false`，不接受任何现场 completed/verified 字段；
- live serializer 根据实际 `not_tested/blocked/completed` 合同输出现场布尔；只有 actual bundle 内容、签名 receipt chain、external release root 和全部 typed completion 谓词通过时，未来合法 proof 才可输出 `p04_completion_contract_verified=true`。它不接受或推导 local readiness 结果；这仍只表示受签内容与合同一致，不把截图/平台观察外推为全自动事实证明，`observation_truth_machine_verified` 固定 false。

## 10. 安全读取与报告边界

readiness 与 live validator 均遵循：

- exact schema，未知键、缺键、重复键、非有限数和尾随内容均失败；
- UTF-8 fatal decode，固定大小上限；
- 从文件系统根到目标文件逐组件检查精确大小写、普通类型和 symlink；
- `O_NOFOLLOW`，打开前后复核父目录和文件 identity；
- CLI 不接受任意路径、URL、资源 ID 或状态参数；
- stdout 只输出固定键、计数、布尔、闭集 issue code 和 digest；
- 错误不得回显输入、路径 basename、provider 文本或敏感哨兵；
- readiness serializer 拒绝现场 completed/live verified、network/OpenAPI/write 为非零或额外字段；live serializer 按第 9 节状态谓词裁决，不复用 readiness serializer；
- credential key 使用 exact denylist；值扫描只识别 URL、邮箱/账号格式、token/secret 形态和飞书已知资源 ID 前缀/长度，不因普通单词 `record`、`field`、`view` 等误伤合成业务文本；
- report 与 live validator 共用一个 P04 内部安全 JSON/路径读取模块及同一敏感扫描器，不复制两套读取实现。

## 11. 测试矩阵

### 11.1 合同与依赖

- P04 缺 P02/P03 任一依赖、依赖顺序漂移或 validator 未冻结依赖；
- P03 未 completed 却允许 P04 首动作或 completed；
- N5/Day7 被重新写入 P04 live minimum action；
- runbook、matrix、template、result 和 manifest 的 P04 动作闭集不一致。

### 11.2 离线运行

- 合法 N1：14 字段、一次调用、一次 audit；
- 提示注入：零工具暴露、零指令执行；
- 两次 invalid：一次 repair、两次 audit、最终 `needs_human`、下游停止；
- N5 receipt action 绑定、Day7 `<`/`==` 边界拒绝、N5 receipt 用于 N6 被拒绝；
- 可信 provider error 五个闭集 code 正确映射；任意对象、Proxy、getter、字符串、Error、cause 或 stack 一律 `unknown_provider_error`，且属性 getter 不触发；
- 原始 provider message/cause/stack 和敏感哨兵不进入任何输出；
- 非 `synthetic_experiment`、网络调用、OpenAPI、业务写或未知 scope 全部失败；
- deny-all ports 的任意调用先计数再失败，零计数不能由调用方伪造；
- launcher→stage0→captured stage1→scenario worker 任一越层读取、未使用对应 prepared/commit Node permission pair、worker 自报/重置 parent counters 或 receipt 漂移均失败；
- 直接运行仓库 report CLI永远固定失败；stage0 专属 launcher control FD缺失、report CLI反而取得该FD、launcher/root key fingerprint被工作区/env/argv替换、入口load后再自校验、outer attestation缺失/伪造、未内嵌 exact release manifest/root/detached signature/snapshot manifest、verifier challenge未知/过期/受众漂移/已消费、整份旧 outer 重放，或只交付 inner candidate，均失败；
- sidecar 反向包含 release-root hash、release root 自含自身文件/signature hash、sidecar/root 双向 pin 或 digest preimage 含目标字段，均作为 hash-cycle 负例失败；
- `fetch/WebSocket/EventSource`、`http/https/http2/net/tls/dns/dgram/fs/child_process`、`process.getBuiltinModule/binding/_linkedBinding/dlopen`、CLI/OpenAPI client 或正式 repository 的 ambient bypass 均失败；
- Node `22.14.0` 或 malformed version 失败、`22.15.0` 与当前受支持版本通过；P04 专属 runtime package engine、registerHooks 可用性或实际 version 漂移失败；根 package/.nvmrc/Netlify/synthetic baseline 的 22.13 合同不得被本实现改写；
- stage0/compiler/stage1/worker 任一获得 child 权限、stage1/worker 获得 write/worker 能力、任一 child 暴露 network builtin/global/ambient channel、使用异步 loader worker、bootstrap 晚于业务静态 import、或 launcher 未成为唯一 spawn broker，均失败；
- permission template 根缺 role/多 role、path-role requirement 的 scope/kind/mode/排序/overlap 漂移，bootstrap 缺 `node:crypto|node:fs|node:module` 任一必需项、增加未知 builtin，或业务 graph/fixture取得 bootstrap raw builtin namespace/任意 path/FD API，均失败；
- stage0 对 launcher/compiler-owned runtime root 取得写权限、bookkeeping root 与 runtime root 重叠、compiler 退出后 runtime tree 仍可写、冻结后成员/identity/权限漂移，或 stage1/worker 缺少各自 signed readonly harness tree、harness tree 缺项/多项/路径角色互换，均失败；
- bootstrap-only FD 未消费关闭、process-lifetime IPC 被提前关闭、FD lifetime/方向/ordinal/role 漂移、未列 FD 存活或任一角色获得后代 spawn 能力均失败；不得以 Node 22.15 不可查询的 CLOEXEC 布尔替代上述可观察门；
- child/stage0 伪称可从未收到的 raw native identity/session nonce重算 child-start alias、signed alias为空/重复/跨 session复用、launcher signature或 committed-once门漂移，均失败；
- control receipt 预先包含尚未创建的 compiler/stage1/worker path identity、stage0 instantiation 漂移、launcher-session/prepare nonce 复用、prepare/commit request 未按 exact schema、requested path-role/fixture nullable IFF 漂移、sanitized env/FD role/stdio 多项少项或与 template/child 实际投影不一致、未 commit/重复 commit/跨 run-role-fixture commit/超时/乱序、invocation 前像或 path-role object-kind/directory manifest/normalized-argv/child-start alias 漂移、terminal/outer pair bundle不守恒，均失败；
- 七场景任一 attempt/audit/write 计数偏离固定矩阵、normalized outcome 漂移或 outcome digest 伪造均失败；
- 四个 W6/N5 scenario 未按 signed fixture seed plan 的 operation/input/outcome逐项预置、seed receipt/count/ledger 与 manifest/parent counter 不守恒、把 worker-private seed 算成 formal write、或把其他 public mutation伪装成同数量 seed，均失败；
- source/三类 fixture/compiler/compiled-output/scenario-runtime-loaded/harness-runtime-loaded/manifest/live snapshot/run digest 漂移、release-input union 缺项/多项/同路径不同SHA、fixture path/ID错配、捕获后源替换、重复运行不一致和报告伪造全部失败；
- runtime-metadata object缺失、root descriptor identity/path topology漂移、package.json不是outDir最近祖先、出现中间package boundary、只提交opaque runtime digest或child loaded_sha公式漂移，均失败；
- readonly member byte length 误用 `safe_count`、`safe_byte_length` 超 16 MiB/负数/非整数、普通文件 link count 不为 1，或目录 link count 不满足 `safe_link_count`，均失败；
- runtime-freeze receipt缺失、签名/session/control/compiler-commit/freeze ordinal/metadata/tree member identity-mode-link-count/content digest 任一漂移、stage0自签或重开改写 runtime tree、receipt 未进入 pre-stage1/stage1 invocation/run/outer，均失败；
- 任一 worker invocation 缺 runtime-freeze receipt digest，或其 `captured_worker_runtime_tree` 除固定 role 重命名外在 scope path/root identity/member manifest/content digest 任一项与 frozen tree 不等，均在 fixture dispatch 前失败；
- source/scenario fixture/hardening fixture/live-validator fixture/compiler/compiled-output/scenario-runtime-loaded/harness-runtime-loaded/contract manifest 缺项、多项、乱序、未知项或原路径二次读取均失败；
- validator/sidecar manifest 缺项或 Contract→Offline→Day-1→live-P04 任一 pin/attestation/schema edge 漂移均失败；四层同步漂移、仓库内替换 public key 或重签自建 root 在 external approver trust anchor 下仍失败；
- 三类 fixture bundle 的成员互换、case ID/outcome mapping 漂移、live-validator positive/mutation corpus 缺项或顺序漂移均失败；
- 三类 canonical fixture 目录缺文件、多文件、隐藏文件、路径大小写/ID 映射漂移、raw bytes 不等于 canonical JSON、BOM/缩进/尾随换行、普通文件以外类型或 symlink/hardlink/identity 替换，均在任何 fixture 执行前失败；
- scenario/case summary 未携带对应 captured fixture object/authenticated target return/execution receipt、manifest 与执行结果错配，worker 自报 parent count，target-call enter/exit不是exact一对、target/seed wrapper capability被伪造、capability nonce/digest跨fixture/domain复用、保留有效 proof 却替换 target result 或 seed before/outcome/after/transition payload、真实调用后丢弃返回值补 expected object、seed真实 outcome/state-transition与signed plan不符、worker completion nonce binding缺失，或 live-validator fixture 未实际调用却补默认通过值，均失败；
- compiler-owned private outDir 正例通过；runtime package/work/outDir 拓扑漂移、compiler prepare 时 work root 非空或 outDir 已存在、编译后未冻结只读树、预建 outDir、symlink/hardlink、额外 emitted file、宽权限或把 O_EXCL 虚假要求套到 compiler-owned output 均按精确 issue 失败；
- compiler module-loaded/resolution-metadata/host-read 三段 receipt 缺项、多项、交叉重复或 union漂移，bootstrap被伪装成hook观察、ambient `tsc`、source/type/package捕获后替换、umask未恢复、emitted JS缺captured `{type:"module"}` boundary或compiler实际读取未进入manifest，均失败；
- report/run/scenario/bundle digest 域分隔、自身排除、canonical key 排序及 issue code 闭集/顺序均有正负例；
- passed 与非零 exit、failed scenario、false local contract、非零 deny count、非空 issue 或现场 gap=true 的每种交叉伪造均失败；live P04 首动作后重跑 readiness 固定 `live_state_drift`。

### 11.3 Live proof

- `not_tested/blocked/completed` 必须分别与 `absent/attempted/complete`、safe-partial/invalid-capture proof/ref nullable 组、result 与 `completion_eligible=false/true` 按第 6.1 节 exact IFF；合法 safe-partial blocked 可 validator passed 但不得 completion，invalid-capture blocked 必须 proof/ref=null、持久停点且 validator fail-closed，completed 的 completion=false 或任一 bundle 字段串阶失败；
- P04 缺失、重复、状态/result 映射漂移；
- `not_tested` 带 proof/ref，safe-partial blocked/completed 缺 proof/ref，或 invalid-capture 带伪造 proof/ref；
- proof ref digest、bundle member actual bytes/content hash、capture receipt/signature chain、parent evidence ID、controlled slot、scenario digest、before/after/mutation-ledger/cleanup digest 任一漂移；
- proof 任一 exact key、nullable 规则、类型、计数、版本、动作或清理字段漂移；
- `attempted=false` 携带非空观察值，或 `attempted=true` 缺必填值；
- 全局 attempt/audit/run count 与分场景求和不守恒；
- probe-start AI run count、attempt array、first-action digest 任一不守恒；
- in-flight blocked 的唯一末项 `attempt_state=started + 三个 pending + outcome=null` 正例，以及 started 非末项、带终态 artifact/outcome、completed 仍有 started/pending 的逐项负例；
- 首动作发生时 P03 未完成、事后改成 completed 的“状态洗白”失败；as-of parent-state/current-state digest 或 sequence 任一不一致失败；
- attempt-start payload 反向包含 run binding造成 content-hash 自引用、配置首动作摘要自引用、AI-run 首动作与 attempt[0] 全 tuple alias、未共享唯一 run binding、before/after 不同 binding 却错误要求同 digest、cleanup/fallback-result把目标 digest 带回 preimage，均失败；
- P04 v2 index 的 source class、phase、actor、time、sequence 任一置换，或 proof tuple 与三份 canonical index 不一致，均失败；
- P04 v2 `redaction_checked=false`、空 phases、nullable evidence group 半空半满、probe-start 与 first-action/attempt 时间不一致，均失败；
- blocked 前置门的 false/null/未观察 subset 与 evidence 不一致，或 completed 未绑定四项 true precondition evidence，均失败；
- 三场景 node/mode/version/prompt-schema contract digest 不同却提交 same-version=true，或用随机相同 digest 替代权威合同摘要；
- attempt evidence ID、slot、bundle artifact ref、source class、summary、digest、run binding 或 outcome IFF 任一漂移；同一 attempt 三类 artifact invocation 不同、跨 attempt run binding 复用均失败；
- challenge/plan/batch token/逐attempt token/canonical input/native action record/run alias/native attempt alias/platform invocation/attempt identity任一漂移，首动作未原生回显本次 batch token、任一 attempt 未原生回显它自己的 attempt token、误要求后续 attempt 重复 batch echo、配置change-event correlation缺失、旧run用新nonce重封装、真实attempt在scenario/repair ordinal间置换、同一raw run被proof ordinal拆成多attempt、不同原生invocation拼接相同summary，或任一raw ID进入bundle/report，均失败；
- 14 字段不完整、key-set digest 伪造、版本变化、一般路径第二次失败后继续；`schema_repair_uncontrollable` 仅接受冻结三-attempt 模式，少于三次、多于三次或 retry_scheduled 漂移均失败；
- forbidden action、provider raw、敏感标识或未知业务写；
- config-only unavailable 无 attempt 的合法正例；structured/trace/audit unavailable 的 artifact 组合逐行正负例；
- limitation 原始观察、fallback modes、ordered fallback_results、逐 mode 独立 evidence/actual object/outcome 与 classification 的单向推导逐层 mutation；空 modes、跨 mode 复用或未 attempted 不得得到 verified=true；
- 每个 fallback mode 的 execution 与 participant confirmation 必须使用两个独立 JSON object/receipt、不同 signer purpose/key/role，并绑定本 mode 同一 trigger/token/native artifact identity/artifact/event/time/kind/transition；只凭全局布尔、管理员确认、同一signer/object/native artifact跨mode复用、旧 artifact 以新 nonce 重封装、artifact A 与无关 event B 拼接、event kind/状态迁移不符合 mode、无原生 token echo/创建 event/time、原生工件早于 trigger 或执行未确认/确认未绑定 execution 全部新鲜度字段，均失败；
- protected business entries 缺 alias、四 alias domain 交叉/前缀错误、长度少于 record count、before/after alias 集不同，或 owner/relation/status/automation 逐记录漂移均失败；
- completed 缺完整平台 mutation ledger、window 未覆盖 before→after、protected mutation 非零或发生写后恢复，即使 before/after 最终相等也失败；
- mutation ledger使用普通run log/participant目测、缺signed audit-query receipt、business-before/after native audit anchor未与query首尾exact相等、当前before/after metadata不在receipt、native首尾sequence/query filter不符、把另一静默窗口零事件链拼接到当前窗口、protected value首尾/相邻链断裂、缺coverage anchor/cursor/page chain、漏页/换页/事件序号漂移或zero event自报而无完整平台change-audit actual object，均失败；
- pre-action challenge 过期/发生在首动作后、parent source bytes 不匹配、receipt chain 断裂/乱序/错误 signer、release root 过期或 external trust anchor 缺失均失败；
- available/restricted/unavailable 任一 truth-table 交叉伪造；六种 completed/unavailable 与 `cleanup_incomplete` blocked 分别覆盖最短正例与逐字段负例；
- 受限/不可用缺 limitations、stop reason、fallback、零写基线或 cleanup；
- incident 被写成 completed；
- 离线 readiness 被塞进现场 evidence；
- URL、账号、token、资源 ID、locator、二维码、provider raw、duplicate key、symlink、inode replacement 和 serializer 污染；P04 bundle 中任意 PNG/二进制 member 即使内容扫描无命中也固定失败。
- 私有 snapshot/outDir 正常创建清理通过；仓库内写入、残留临时根、清理失败或 passed stdout 早于清理均以 `snapshot_cleanup`/对应 transport issue 失败。

## 12. 实施边界与顺序

### 12.1 预计文件范围

新增：

- `src/neoloop/ai/provider-error.ts`
- `src/neoloop/evidence/p04-readiness.ts`
- `src/neoloop/evidence/p04-instrumented-w6-fixture-repository.ts`
- `feishu/fixtures/p04/scenarios/<fixture_id>.json`，每个 scenario manifest ID 精确一份 canonical JSON，目录成员与 manifest exact deep-equal
- `feishu/fixtures/p04/hardening/<fixture_id>.json`，每个 provider-hardening/scope-guard manifest ID 精确一份 canonical JSON，目录成员与 manifest exact deep-equal
- `feishu/fixtures/p04/live-validator/<fixture_id>.json`，每个 live-validator positive/mutation manifest ID 精确一份 canonical JSON，目录成员与 manifest exact deep-equal
- `feishu/scripts/lib/p04-contract.mjs`
- `feishu/scripts/lib/p04-stage0-broker.mjs`
- `feishu/scripts/lib/p04-stage1-harness.mjs`
- `feishu/scripts/lib/p04-scenario-worker.mjs`
- `feishu/scripts/lib/p04-runtime-bootstrap.mjs`
- `feishu/scripts/lib/p04-compiler-runner.mjs`
- `feishu/scripts/lib/p04-redacted-io.mjs`
- `feishu/scripts/report-p04-readiness.mjs`
- `feishu/scripts/validate-live-p04-evidence.mjs`
- `feishu/runtime/p04/package.json`，exact 仅 `{private:true,type:"module",engines:{node:">=22.15.0"}}`，作为 P04 专属 captured runtime boundary，不发布也不替换根 package 合同
- `tests/core/p04-readiness-report.test.mjs`
- `tests/core/live-p04-evidence.test.mjs`
- `tsconfig.p04-readiness.json`
- `feishu/runbooks/p04-external-launcher-contract.md`
- `feishu/evidence/p04-live-evidence-bundle-schema.example.json`
- `feishu/evidence/live/p04-live-evidence-bundle/bundle-manifest.json`，当前只写 `bundle_stage=absent` 空态
- `feishu/attestations/p04-release-manifest.v1.json`
- `feishu/attestations/p04-release-root.v1.json`
- `feishu/attestations/p04-release-root.v1.sig`
- `feishu/scripts/validate-contract-alignment.mjs.FREEZE_ATTESTATION.json`
- `feishu/scripts/validate-offline-package.mjs.FREEZE_ATTESTATION.json`
- `feishu/scripts/validate-day-1-probe-package.mjs.FREEZE_ATTESTATION.json`
- `feishu/scripts/validate-live-p04-evidence.mjs.FREEZE_ATTESTATION.json`

修改：

- `src/neoloop/contracts/ports.ts`
- `src/neoloop/ai/runner.ts`
- `src/neoloop/ai/scripted-fake.ts`
- `tests/core/ai-runner.test.mjs`
- `feishu/manifests/day-1-probe-suite.v0.1.json`
- `feishu/evidence/day-1-probe-results.example.json`
- `feishu/evidence/on-site-evidence-template.json`
- 两份 live redacted JSON，仅加入空 proof/ref 与同步纠偏说明，不改变 P04 状态
- `feishu/runbooks/day-1-permission-acceptance.md`
- `feishu/runbooks/day-1-permission-matrix.md`
- `feishu/scripts/validate-contract-alignment.mjs`
- `feishu/scripts/validate-offline-package.mjs`
- `feishu/scripts/validate-day-1-probe-package.mjs`

工作区外 trusted launcher 的 executable、私钥与 trust config 不属于仓库文件范围；本仓库只交付 launcher invocation/attestation 合同。没有这项外部交付时可以实现并测试 candidate harness，但不能生成最终 passed attestation。

readiness 只通过 `P04InstrumentedW6FixtureRepository` adapter 调用 `workflows/repository.ts` 的既有公开入口，以 signed fixture plan 在 measured window 前构造 worker-private 合成 seed，再运行 N5/Day7 场景；不导出或直接调用 private guard。若实现发现必须修改 repository，先停下并回到规格复核。

如果实施审计发现必须扩大范围，先停止并更新规格或计划，不能顺手修改 P05、正式 Base、公开材料或其他 live 状态。

### 12.2 四阶段顺序

实施分四个原子阶段，每阶段独立 RED→GREEN 和复核：

1. **合同纠偏**：统一 P04 依赖、minimum action、runbook/matrix/template/result、bundle 空态、四层 validator sidecars 与 external release root；live P04 仍为 `not_tested/null`。
2. **错误与 scope 硬化**：固定 provider 错误类和离线 `synthetic_experiment` 入口，不实现真实 adapter。
3. **离线 readiness**：先实现 candidate harness，再由另行交付的 trusted external launcher 在执行前验证/capture并输出signed attestation；内部以launcher→stage0→captured stage1→worker、逐spawn签名permission receipts、parent-owned counters、signed fixture seed、authenticated target return与stage0 execution receipts运行合成N1/W6内核夹具；不写live evidence。没有external launcher时本阶段只能称candidate ready，不能称passed。
4. **live validator**：接受当前 `not_tested/null + bundle absent`，并为未来 blocked/completed 提供 actual-content/signature/typed-proof 门；不得先改 live 状态制造正例。

每阶段结束必须运行相关定向测试、local core、Contract、Offline、Day-1、live P01/P02/P03/P12/P13 validators、`node --check`、scoped ESLint、diff-check 和敏感扫描。报告只使用真实测试数和最终 SHA。

任何阶段都不得操作飞书。P03 未完成前，真实 P04 仍关闭。

## 13. 最终可用表述

工作区外 signed readiness attestation 验签通过后，只允许写：

> 石听 NeoLoop 已完成 P04 相关本地合成内核的可复验安全准备：结构化 envelope、提示注入隔离、单次修复、二次失败转人工，以及 N5/Day7 回执边界均有本地工程证据。赛事飞书 AI、额度、运行记录与现场 P04 尚未验证。

仍禁止写：

- “P04 已通过”或“飞书 AI 已接入”；
- “七个 AI 节点已在赛事租户运行”；
- “已接入新石器真实数据”；
- “本地测试证明了企业准确率、效率或 ROI”；
- “N5/Day7 本地回归就是飞书 AI 现场证据”。
