# Owner-first N1 确定性证据绑定实施计划

日期：2026-08-09

状态：待参赛者批准

设计来源：`docs/superpowers/specs/2026-08-09-owner-first-n1-deterministic-evidence-binding-design.md`

## 1. 实施目标

新增一个与既有 draft.2 严格入口并存的 owner-first v2 路径：飞书模型只输出 `source_ref + quote`，本地纯函数从冻结 request 的 `input.original_text` 唯一逐字定位，生成 ECMAScript UTF-16 code-unit offset，再交给未修改的 `validateNodeCandidate` 与 `AuditedAiNodeRunner`。

本计划只完成离线实现与验证。全门通过后停在 `offline_candidate`；不修改飞书 Prompt、不运行新的 N1 预览、不启用 W2，也不调用飞书 CLI/OpenAPI。

## 2. 实施不变量

- 数据范围只使用 `synthetic_experiment` 与固定 `SYN-FEEDBACK-029`。
- 全局 N1 envelope 继续为 `N1-1.0.0-draft.2`；不修改 `validateNodeCandidate` 的接受语义。
- 既有 v1 CLI、Prompt、报告与 `exact_candidate_validated` 路径保持不变。
- v2 成功只能分类为 `candidate_validated_after_deterministic_binding`。
- 不做 trim、casefold、空白折叠、Unicode normalization、模糊匹配或语义纠错。
- quote 非唯一、来源不符、Unicode/边界不安全、span 重叠或完整 validator 失败时 fail closed。
- 适配层不增加模型调用；一次会话总尝试数仍为 2。
- 不保存 raw candidate、quote、原文、provider 文本、URL、账号或资源 ID。
- 工作树已有大量参赛者改动；只暂存本计划列出的文件，禁止 reset、checkout、清理或夹带无关文件。

## 3. 文件范围

新增：

- `src/neoloop/io/plain-json.ts`
- `src/neoloop/ai/owner-first-n1-evidence-binding.ts`
- `src/neoloop/ai/owner-first-n1-binding-preview.ts`
- `src/neoloop/cli/owner-first-n1-binding-preview.ts`
- `feishu/prompts/n1-owner-first-exact-5-bound.txt`
- `tests/core/plain-json.test.mjs`
- `tests/core/owner-first-n1-evidence-binding.test.mjs`
- `tests/core/owner-first-n1-binding-preview.test.mjs`
- `tests/core/owner-first-n1-binding-preview-cli.test.mjs`

最小修改：

- `src/neoloop/ai/runner.ts`：把现有 plain-JSON 安全快照实现迁移到共享模块，行为保持不变。
- `src/neoloop/ai/index.ts`：导出新 binder 与 v2 preview 接口。

明确不修改：

- `src/neoloop/ai/validation.ts`
- `src/neoloop/ai/definitions.ts`
- 既有 `src/neoloop/ai/owner-first-n1-preview.ts`
- 既有 `src/neoloop/cli/owner-first-n1-preview.ts`
- 既有 `feishu/prompts/n1-owner-first-exact-5.txt`
- `package.json`、`package-lock.json`
- live evidence、P04 规格、N2—N7、W1—W6 或飞书配置

如果实施证明必须修改上述明确禁止文件，先停止并回到设计审查，不就地扩大范围。

## 4. Step 0：冻结基线

1. 记录当前 HEAD、目标文件状态和设计规格 SHA；不读取或暂存无关 dirty 文件。
2. 串行复跑现有 owner-first v1、strict JSON sequence 与 exact-14 测试，确认旧入口为 GREEN。
3. 记录 `SYN-FEEDBACK-029` fixture 原文的 UTF-16 length=35、code-point count=35、UTF-8 bytes=71；这只作为事实基线，不作为 provider 口径结论。
4. 建立新增文件的 RED 提交前，不修改飞书或运行浏览器自动化。

## 5. Step 1：共享 plain-JSON 安全快照

### 5.1 先写 RED

在 `tests/core/plain-json.test.mjs` 覆盖：

- JSON null、boolean、finite number、string、dense array、普通 object 与 null-prototype object 正例；
- accessor、symbol key、函数、bigint、undefined、NaN/Infinity、循环引用、稀疏数组、额外数组属性、异常 prototype、深度 17 拒绝；
- getter 不被执行；异常 descriptor/proxy 统一安全失败且不回显原值；
- canonical JSON 对 object key 排序，保留 array 顺序；
- 相同 JSON 得到相同 SHA-256，不同 JSON 得到不同 SHA-256。

### 5.2 最小实现

新增 `src/neoloop/io/plain-json.ts`：

- 从 `runner.ts` 原样迁移 `snapshotPlainJsonData` 及其深度、descriptor、prototype、dense-array 防线；
- 导出 discriminated result，不抛出包含原始值的异常；
- 增加只接收安全 `JsonValue` 的 canonicalizer 与 domain-separated SHA-256 helper；
- 不读文件、不写文件、不发网络、不记录日志。

修改 `runner.ts` 只改为导入共享 helper，删除原私有副本。先跑原 runner 测试，证明行为未漂移，再跑新测试到 GREEN。

## 6. Step 2：纯确定性 evidence binder

### 6.1 API

在 `src/neoloop/ai/owner-first-n1-evidence-binding.ts` 导出：

- 固定 `OWNER_FIRST_N1_BINDING_CONTRACT_VERSION`；
- 固定 `OWNER_FIRST_N1_BINDING_ALGORITHM`；
- 排序、去重 reason-code 闭集；
- `bindOwnerFirstN1Evidence(request, candidate)` 纯函数；
- `bound|refused` discriminated result；成功才携带 bound candidate，失败永远为 `candidate=null`。

API 不接受 source text、offset、回调、hook、provider 诊断或外部 clock。不得原地修改输入。

### 6.2 先写 RED

在 `tests/core/owner-first-n1-evidence-binding.test.mjs` 依次建立：

- 固定全句生成 `[0,35)`；去句号 quote 生成 `[0,34)`；
- astral emoji 证明 UTF-16 offset 与 code point/UTF-8 byte 不同；
- 多 span 唯一、互不重叠时原子成功；
- 移除新增 offset 后与 pre-binding candidate canonical deep-equal；
- bound candidate 再跑公共 `validateNodeCandidate` 为 valid；
- 模型预带 offset、额外 span 键、别名、accessor/prototype、空 quote、全空白 quote、source mismatch；
- request/source snapshot 漂移、quote 0 次、普通多次与重叠多次出现；
- trim/casefold/空白折叠/NFC 等“变换后才匹配”全部拒绝；
- 孤立 surrogate、surrogate 边界、combining mark 与 ZWJ grapheme 边界拒绝；
- span 重叠与重复拒绝，且没有部分 candidate；
- payload、scalar、missing/extra、引用和 injection 错误保留既有 outer issue 分类，不被粗化；
- 输入对象、输出对象与 reason code 都不包含 raw quote、原文、offset 或自由文本诊断。

### 6.3 GREEN 实现顺序

1. 用共享 plain-JSON helper 对 request/candidate 做一次安全快照并计算 before digest。
2. 检查顶层 exact-5 与每个 evidence item exact-2。
3. 在无 offset candidate 上先调用未修改的 `validateNodeCandidate`，复用既有 `classifyOwnerFirstN1ValidationErrors` 保留非 offset 错误分类。
4. 从 request 内部取得唯一权威 original text；不接受第二来源。
5. 校验 well-formed UTF-16，并用 `Intl.Segmenter('und', { granularity:'grapheme' })` 建立边界集合；无法建立时拒绝。
6. 用 ECMAScript code-unit 索引统计所有重叠出现；只接受恰好一次。
7. 一次性生成所有 offset，排序检查区间互不重叠/重复。
8. 重新调用 `validateNodeCandidate`；失败保留真实 outer 分类并附 `binding_post_validation_failed`。
9. 复核 request snapshot digest 未漂移；生成 after digest并返回深拷贝。

## 7. Step 3：v2 preview 会话与报告

### 7.1 先写 RED

在 `tests/core/owner-first-n1-binding-preview.test.mjs` 覆盖：

- v2 报告顶层 exact 7 keys，`binding` exact 10 keys；未知键、缺键、错误 nullability 全拒绝；
- 第一次绑定成功 → 分类 `candidate_validated_after_deterministic_binding`、exact14=true、1 次 invocation/1 条内存 audit；
- 第一次拒绝、第二次成功 → 总 attempt=2，但 runner/provider 只调用 1 次；适配层不制造模型调用；
- 两次拒绝 → `needs_human`、exact14=false、0 次 runner invocation、第三次拒绝；
- bound 成功报告三个摘要齐全、reason/issue 为空；refused 报告 after digest=null、reason/issue 非空；
- non-offset 错误保留 payload/scalar/injection 等现有 issue code；
- 既有 v1 session 仍只输出五键报告及 `exact_candidate_validated|needs_human`；两版本成功分类不能交叉；
- dispose 后 candidate/audit 引用为 0，不回显 raw candidate。

### 7.2 最小实现

新增 `src/neoloop/ai/owner-first-n1-binding-preview.ts`：

- v2 wrapper 自己只追踪最多两次提交与脱敏 binding evidence；
- 每次先调用纯 binder；拒绝时不调用 v1 session/runner；
- binder 成功后才创建既有 `createOwnerFirstN1PreviewSession()`，提交一次 bound candidate；
- 只接受 v1 返回的 `exact_candidate_validated + exact_14_generated=true` 作为内部成功，再转换成 v2 binding 成功分类；
- v1 内部任何其他结果都 fail closed 为 v2 `needs_human`；
- 复用既有修复指令选择器，不复制 runner、envelope 或 N1 业务校验；
- 序列化报告前再次校验 exact shape 与 IFF。

修改 `src/neoloop/ai/index.ts` 只增加新模块导出。

## 8. Step 4：独立 v2 CLI 与 Prompt

### 8.1 先写 RED

在 `tests/core/owner-first-n1-binding-preview-cli.test.mjs` 覆盖：

- 复用既有 strict JSON Text Sequence framing、UTF-8/64 KiB/两帧上限；
- 每帧只输出一行 compact v2 JSON，键顺序固定，stderr 空；
- bound success exit 0；refused/transport/internal exit 1；
- 第一次拒绝后第二次成功、两次拒绝、fatal transport、第三帧；
- stdout/stderr 不含 quote、原文、offset、未知键、URL、资源 ID、token/cookie/account；
- 静态 import graph 无 fs-write、child、network、database、log；
- Node permission-mode 不授予 fs-write/net/child/worker 时，预编译 v2 CLI 正例通过；
- 隔离 cwd 运行前后文件清单与摘要不变；
- 旧 v1 CLI/Prompt tests 原样通过。

### 8.2 实现

新增 `src/neoloop/cli/owner-first-n1-binding-preview.ts`：

- 只读 stdin、复用 strict parser、调用 v2 session、写固定 stdout；
- 不接受 argv、路径、URL、request、source text 或现场状态；
- 异常不输出 message/stack，统一 `binding_internal_error` + `internal_validation_error`。

新增 `feishu/prompts/n1-owner-first-exact-5-bound.txt`：

- 顶层 exact 5；payload 沿用现有 N1 exact shape；
- evidence item exact 2 keys：`source_ref`、`quote`；明确禁止 offset；
- quote 必须来自冻结 original text 的逐字连续片段，不能改写、归一化或概括；
- 固定修复区仍只允许一次，不包含本地 offset、provider 文本或自由诊断；
- UTF-8、单 LF、末尾 newline、固定 SHA 测试。

旧 prompt 文件保留不改，作为 v1 回归合同；不得覆盖后再让 v1 tests 跟着新语义漂移。

## 9. Step 5：离线总门

严格串行执行并保存仅计数/摘要结果：

1. 新增四组定向测试；
2. `node tests/core/run-core-tests.mjs --local-only`；
3. `node tests/core/run-core-tests.mjs --cross-only`；
4. `node feishu/scripts/validate-contract-alignment.mjs`；
5. `node feishu/scripts/validate-offline-package.mjs`；
6. `node feishu/scripts/validate-day-1-probe-package.mjs`；
7. `node feishu/scripts/validate-live-p01-evidence.mjs`；
8. `node feishu/scripts/validate-live-p03-partial-blocked-evidence.mjs`；
9. `node feishu/scripts/validate-live-p13-evidence.mjs`；
10. 两个新 production 文件、两个新 CLI/共享文件的 `node --check` 对应编译产物；
11. scoped ESLint、`git diff --check`、尾随空白与敏感字符串扫描；
12. 静态依赖图证明无 fs-write、网络、child、数据库或外部日志路径。

任一门失败先修复并从定向测试重新串行复跑。不得把并行工作树瞬态当作本任务 GREEN；若发现无关并发失败，先单独复现并记录来源。

## 10. Step 6：交付与停止点

- 只提交本计划列出的实现、测试和新 Prompt 文件；提交前逐文件核对 staged diff。
- 记录 RED→GREEN 证据、最终测试计数、文件 SHA、P0/P1/P2 与 dirty/untracked 基线。
- 更新 `.codex/PROJECT_UPDATE.md`，checkpoint 与 handoff 均先预览再应用。
- 最终状态只写 `offline_candidate`；不写“飞书预览通过”“P04 完成”“CLI/OpenAPI 已验证”或“正式上线”。
- 在本实施任务结束时停下，另行给出是否值得再次运行 N1 Safari 预览的证据化建议；没有新的明确授权，不进入浏览器现场。

## 11. 回滚

- Step 1 行为漂移：恢复 runner 使用原快照逻辑，保留 RED 证据，不继续 binder。
- Binder 任一不确定匹配：返回 refused；不得引入配置开关放宽唯一性。
- v2 report 与 v1 混淆：删除 v2 调用接线，保留 v1 原入口，不修改 v1 分类。
- CLI 出现路径、原文或自由错误泄漏：停止并只保留固定 failure envelope，先修复脱敏测试。
- Prompt 与本地合同 SHA 不一致：不用于现场；旧 v1 Prompt 和现场当前配置均不改。
- 任何实现需要修改飞书/live evidence/P04/validation 语义：停止并重新获得设计批准。
