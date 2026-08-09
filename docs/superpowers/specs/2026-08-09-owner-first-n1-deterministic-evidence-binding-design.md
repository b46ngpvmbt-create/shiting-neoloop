# Owner-first N1 确定性证据绑定设计

日期：2026-08-09

状态：已获参赛者确认，待实施计划

范围：飞书所有者身份下的 N1 合成预览前置适配层

## 1. 决策

飞书模型不再生成 `start_offset` 或 `end_offset`。模型只提交证据来源与原文 quote，本地确定性适配层从冻结的权威输入中做逐字、唯一定位，再补出 ECMAScript UTF-16 code-unit 半开区间。

本设计采用独立 adapter 合同 `owner_first_n1_candidate_binding.v1`，算法固定为 `utf16_exact_unique_v1`。权威 N1 envelope 版本仍为 `N1-1.0.0-draft.2`；本设计不修改全局 N1 envelope、P04 合同或现有严格 validator 的语义。

成功分类必须为 `candidate_validated_after_deterministic_binding`，不得写成 `exact_candidate_validated`，因为模型原始 candidate 没有提供 offset。

## 2. 事实纠正

固定合成原文 `DEMO-X3-205 昨天的历史视频一直没有通过站点Wi-Fi回传。` 的 ECMAScript UTF-16 code-unit 长度与 Unicode scalar 数都为 35；去掉末尾句号的 quote 两者都为 34。该文本没有 astral character，因此本次观测不能区分 provider 使用 UTF-16、Unicode code point 或其他计数口径。

已观测的 `end_offset=24` 只是与当前 JavaScript `slice` 合同不一致的错误数值，不构成 provider offset 口径证据。本设计只声明本地适配层按 ECMAScript UTF-16 code unit 计算，不对 provider 的内部计数方式作推断。

## 3. 与既有合同的关系

### 3.1 保持不变

- `validateNodeCandidate` 继续作为绑定后的权威 candidate validator；不得放宽、复制或绕过。
- `AuditedAiNodeRunner` 继续负责生成 exact 14-key envelope、`run_id`、`input_hash`、`validation`、`retry_count` 与 `human_revision`。
- 既有 draft.2 严格路径继续接受模型已经正确提供的完整 evidence span，并使用分类 `exact_candidate_validated`。
- W2 保持关闭；N2—N7、业务表、通知和飞书 `ai_audit` 都不运行或写入。
- 一次执行最多两次模型预览；适配层本身不消耗、不增加模型调用次数，也不能产生第三次预览。

### 3.2 被本设计覆盖的 owner-first 路径

`2026-08-09-owner-first-n1-candidate-preview-design.md` 中“模型生成原文半开区间”和“不得自动纠正 offset”的规则，只在新的 owner-first adapter 路径中被本设计覆盖：模型不再生成 offset，本地层从权威原文新增 offset。其他 exact-5、注入隔离、一次修复、脱敏和零写规则继续有效。

历史两次失败预览没有冻结完整 raw candidate，不得回填、重放或声称经本适配层后已经通过。

## 4. 两阶段 candidate 合同

### 4.1 模型输出：pre-binding candidate

模型顶层仍必须严格等于五键：

1. `payload`
2. `evidence_spans`
3. `missing_fields`
4. `confidence`
5. `status`

`payload`、标量、引用关系和注入边界继续服从现有 N1 candidate 合同。

每个 `evidence_spans` item 必须是普通 JSON object，且键严格等于：

1. `source_ref`
2. `quote`

模型输出 `start_offset`、`end_offset` 或任何其他 evidence-span 键时，适配层必须拒绝；不得删除模型多余键后继续。

### 4.2 本地输出：bound candidate

适配层对每个 evidence span 只新增：

- `start_offset`
- `end_offset`

bound candidate 的其他值、数组顺序和对象结构必须与 pre-binding candidate canonical deep-equal。移除所有新增 offset 后，必须逐字还原原 candidate 的 canonical JSON。

bound candidate 随后必须通过未修改的 `validateNodeCandidate`，才可交给 `AuditedAiNodeRunner`。适配层自身不能生成 envelope，也不能把局部绑定成功当作 N1 candidate 成功。

## 5. 权威输入与纯函数边界

新增纯函数只接受：

- 冻结 request；
- 一个不可信 pre-binding candidate。

函数不得接收调用方另传的 `source_text`、offset、搜索结果或 provider 诊断。证据原文只能从 request 中按 `source_ref` 找到的权威字段读取；当前 owner-first v1 只允许 `source_ref === request.object_ref.object_id`，并只使用该 request 的 `input.original_text`。

函数必须先快照并摘要权威 request，绑定完成后再次核对摘要。request 或权威原文在同次调用中发生漂移时拒绝。函数不得原地修改 request 或 candidate。

## 6. 唯一精确定位算法

对每条 evidence span 严格按以下顺序处理：

1. 确认 candidate、span 均为普通 JSON object，键集合准确，无 accessor、prototype 或别名键。
2. 确认 `source_ref` 精确等于 request object ID。
3. 确认 `quote` 是非空字符串，且不只包含空白。
4. 在没有 offset 的原 candidate 上先运行未修改的 `validateNodeCandidate`。现有 validator 允许 offset 缺省，故该轮负责拒绝 payload、标量、引用、来源、quote 不在原文、注入及其他非 offset 错误；其原始错误分类必须保留，不能被统一改写为 evidence-binding 错误。
5. 确认权威原文和 quote 都是 well-formed UTF-16；不得包含孤立 high/low surrogate。
6. 不做 trim、大小写折叠、空白折叠、NFC/NFD/NFKC/NFKD、同义替换、模糊匹配或任何语义改写。
7. 用 ECMAScript 字符串索引对 quote 做逐字搜索，重叠出现也分别计数。
8. 出现次数必须恰好为 1；0 次或多次都拒绝。
9. `start_offset` 为唯一出现位置；`end_offset = start_offset + quote.length`，两者均为 0-based UTF-16 code-unit 半开区间。
10. 两端不得切开 surrogate pair；并使用 `Intl.Segmenter('und', { granularity: 'grapheme' })` 验证两端都是原文 grapheme boundary。运行时无法建立该验证时 fail closed。
11. 多个 span 的派生区间必须互不重叠、互不重复；任一冲突都原子拒绝整个 candidate。
12. 新增 offset 后再次运行完整 `validateNodeCandidate`；只有其返回 valid 才成功。

任何一步失败时不得输出部分修改 candidate。一个 candidate 的所有 span 要么全部绑定并通过权威 validator，要么全部拒绝。

## 7. 分类与错误闭集

既有严格入口与报告 v1 保持不变，其分类仍为 `exact_candidate_validated|needs_human`。新 adapter 使用独立报告 `owner_first_n1_preview_report.v2`，分类严格二选一：

- `candidate_validated_after_deterministic_binding`：pre-binding candidate 经本适配层补 offset 后通过完整权威 validator。
- `needs_human`：输入、绑定、完整校验或两次模型预览中的任何最终失败。

因此两个成功分类在不同报告版本中互斥；v2 不得输出 `exact_candidate_validated`，v1 也不得输出新的 binding 成功分类。

适配层内部 reason code 为排序、去重闭集：

1. `binding_input_invalid`
2. `binding_span_shape_invalid`
3. `binding_empty_quote`
4. `binding_source_ref_mismatch`
5. `binding_source_snapshot_mismatch`
6. `binding_quote_not_found`
7. `binding_quote_ambiguous`
8. `binding_unicode_invalid`
9. `binding_grapheme_boundary_invalid`
10. `binding_span_overlap`
11. `binding_post_validation_failed`
12. `binding_internal_error`

对外仍只输出闭集 reason code，不回显 path、quote、原文、offset、模型自造键名或 provider 文本。所有失败的最终分类统一为 `needs_human`。outer `issue_codes` 继续使用既有闭集：

- 第一次、无 offset 的 `validateNodeCandidate` 失败时，复用既有分类器保留 payload、scalar、injection、missing/extra 或 evidence 的真实类别；
- pre-binding shape、唯一性、Unicode、grapheme 或 overlap 绑定失败投影为 `candidate_invalid_evidence_binding`；
- 第二次完整 validator 若出现非 offset 错误，按其真实类别输出并附 `binding_post_validation_failed`；
- 内部异常投影为 `internal_validation_error`。

详细绑定原因只能存在于 `binding.reason_codes`，不得替代 outer 分类。

首次绑定失败可以沿用既有、冻结的唯一模型修复轮，但修复提示只能要求重新给出可由当前权威原文逐字且唯一定位的 `source_ref + quote`；不得把本地计算的 offset 发回模型，不得自动选择重复 quote 中的某一次。第二次仍失败即停止。

## 8. 脱敏报告 v2

`owner_first_n1_preview_report.v2` 顶层严格等于：

1. `schema_version`
2. `classification`
3. `attempt_count`
4. `candidate_top_level_keys`
5. `exact_14_generated`
6. `issue_codes`
7. `binding`

`schema_version` 固定为 `owner_first_n1_preview_report.v2`。`binding` 严格等于：

1. `contract_version`
2. `algorithm`
3. `offset_unit`
4. `normalization`
5. `status`
6. `span_count`
7. `source_sha256`
8. `candidate_before_sha256`
9. `candidate_after_sha256`
10. `reason_codes`

固定值为：

- `contract_version=owner_first_n1_candidate_binding.v1`
- `algorithm=utf16_exact_unique_v1`
- `offset_unit=ecmascript_utf16_code_unit`
- `normalization=none`
- `status=bound|refused`

`bound` 当且仅当 `classification=candidate_validated_after_deterministic_binding`、`exact_14_generated=true`、`issue_codes=[]`、`span_count` 为正安全整数、三个摘要均为 64 位小写十六进制且 `reason_codes=[]`。

`refused` 当且仅当 `classification=needs_human`、`exact_14_generated=false`、`issue_codes` 为非空既有闭集、`candidate_after_sha256=null`、`reason_codes` 为非空绑定闭集。`span_count`、`source_sha256` 与 `candidate_before_sha256` 只有在对应完整对象已安全验证并摘要时才可非空，否则为 `null`；不得为填满报告而推断。

禁止保存或输出 raw quote、权威原文、provider 原文、浏览器 URL、账号、token、Base/table/view/record/app/field ID。现场 candidate 仍只经剪贴板与一次性进程内存传递，不落盘。

## 9. 失败与回滚

- quote 不存在、重复、来源不符、Unicode 非法、边界不安全、span 重叠或完整 validator 失败：返回 `needs_human`，不生成 envelope。
- 任何非 offset 相关错误不得被本适配层掩盖；适配层不能重命名键、补 payload、改事实、改实体线索、改 status/confidence 或清理额外字段。
- 第一次失败后的模型修复仍计为唯一第二次预览；适配层不能以“本地重试”名义再次调用模型。
- W2 意外开启、出现业务写入、通知、下游运行或现场状态不明：立即停止并按既有 owner-first 回滚合同处理；不得以最终值恢复冒充零写。
- 新实现离线全绿前，不修改飞书 Prompt、不重新预览 N1。

## 10. 测试要求

### 10.1 正例

- 固定 `SYN-FEEDBACK-029` 全句 quote 唯一出现，派生 `[0,35)`，完整 validator 通过。
- 不含句号的 quote 唯一出现，派生 `[0,34)`，完整 validator 通过。
- 含 astral emoji 的权威原文证明 offset 按 UTF-16 code unit，而非 code point 或 UTF-8 byte。
- 多个互不重叠且各自唯一的 span 原子绑定成功。
- 成功后除新增 offset 外，candidate canonical deep-equal。

### 10.2 必拒负例

- 模型预先输出 offset、额外 span 键、别名键或非普通 JSON object。
- 空 quote、全空白 quote、source mismatch、request/source snapshot 漂移。
- quote 0 次、2 次及重叠多次出现，例如 `aaaa` 中的 `aa`。
- 只有 trim、casefold、空白折叠或 Unicode normalization 后才匹配。
- 孤立 surrogate、切开 surrogate pair、combining sequence 或 ZWJ grapheme 边界。
- 两个 span 派生为重叠或重复区间。
- payload、标量、引用、注入或其他非 offset 校验失败。
- 第二次模型预览仍失败、第三次 candidate、任何本地自动选择歧义位置。
- 报告或 stderr 泄漏 quote、原文、offset、资源标识或 provider 文本。

### 10.3 回归门

- 既有 draft.2 `exact_candidate_validated` 路径保持不变。
- exact 14-key envelope、两次失败、严格 JSON sequence、CLI permission-mode 与 core local/cross 全部通过。
- Contract、Offline、Day-1 与现有 live evidence validators 继续通过。
- 测试不得调用网络、飞书 CLI/OpenAPI 或写入飞书；不得运行新的 Safari 预览。

## 11. 验收边界

离线实现通过只证明：对冻结合成 request，本地代码能从模型 quote 唯一、逐字、可复算地生成 UTF-16 code-unit offset，并在未放宽权威 validator 的前提下生成合法 owner-preview N1 envelope。

它不证明模型原始 offset 正确、provider 使用 UTF-16、P04/P03 完成、W2 或 N2—N7 可运行、CLI/OpenAPI 现场能力、正式上线、真实企业数据或业务效果。

现场再次预览必须在离线实现与全门验证完成后单独决定；本设计批准本身不授权飞书写操作或第三次历史预览。
