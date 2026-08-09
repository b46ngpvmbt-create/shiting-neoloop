# Owner-first N1 candidate 预览实施计划

日期：2026-08-09

状态：已获参赛者批准，立即实施

设计来源：`docs/superpowers/specs/2026-08-09-owner-first-n1-candidate-preview-design.md`

## 1. 实施不变量

- 只处理 `synthetic_experiment` 与固定 `SYN-FEEDBACK-029`。
- 飞书现场只修改 N1 Prompt；W2 始终关闭，不运行 N2—N7，不写业务表、通知或 `ai_audit`。
- 最多两次 N1 单节点预览；第二次失败后停止，不执行第三次。
- 模型只生成 exact-5 candidate；权威 exact-14 envelope 只由现有 `AuditedAiNodeRunner` 生成。
- Safari 是唯一现场浏览器；只保留一个相关页面。
- 本轮不调用 CLI/OpenAPI，不改变分享、权限、scope 或真实数据接入。
- 工作树已有大量参赛者改动；禁止 reset、checkout 或夹带无关文件。

## 2. 文件范围

新增：

- `src/neoloop/io/strict-json-sequence.ts`
- `src/neoloop/ai/owner-first-n1-preview.ts`
- `src/neoloop/cli/owner-first-n1-preview.ts`
- `feishu/prompts/n1-owner-first-exact-5.txt`
- `tests/core/strict-json-sequence.test.mjs`
- `tests/core/owner-first-n1-preview.test.mjs`
- `tests/core/owner-first-n1-preview-cli.test.mjs`

最小修改：

- `src/neoloop/ai/definitions.ts`：导出权威 exact-5 字段常量。
- `src/neoloop/ai/validation.ts`：复用该常量，不改变校验语义。
- `src/neoloop/ai/index.ts`：导出 owner-first preview 纯接口。

不修改 `package.json`、`package-lock.json`、现有 live evidence、P04 规格、N2—N7 或工作流配置。

## 3. Step 1：严格 JSON Text Sequence

先在 `tests/core/strict-json-sequence.test.mjs` 建立 RED：

- `0x1E || JSON object || 0x0A` 单帧与多行 JSON 正例；
- RS、UTF-8 多字节、escape 和 LF 跨 chunk；
- 无 RS、空帧、缺 LF、尾随垃圾、Markdown、多个 JSON 值；
- 非 object 顶层；
- fatal UTF-8、BOM、恰好 `64 KiB` 与 `64 KiB + 1`；
- 深度 16/17；
- root/nested/Unicode/escaped slash/surrogate duplicate key；
- 两帧顺序与第三帧拒绝。

实现 `src/neoloop/io/strict-json-sequence.ts`：

- 字节级 framing FSM，不能用换行或 RS 简单 split；
- `TextDecoder("utf-8", { fatal: true })`；
- 单帧 JSON bytes 最大 65,536；
- 解码后、逐 object scope 的重复键检查；
- 深度上限 16；
- 不返回 key、offset、pointer 或原文诊断，只返回闭集 transport issue code。

验收：定向测试由 RED 收敛为 GREEN，`node --check`/TypeScript 严格编译通过。

## 4. Step 2：owner-first N1 纯会话

先在 `tests/core/owner-first-n1-preview.test.mjs` 建立 RED：

- canonical fixture ID、原文、渠道与 `data/canonical/tables/raw-feedback.json` 等值；
- exact-5 首次成功 → runner exact-14、1 次内存审计；
- 第一次失败、第二次成功 → 2 次 invocation/2 次内存审计、同 node/mode/version/input_hash；
- 两次失败 → `needs_human`、2 次审计、第三 candidate 未执行；
- wrapper → missing + extra 且不回显自造键；
- 六种 candidate issue code、固定顺序与唯一修复句；
- refused/error/needs_human candidate 不能标成成功；
- 报告不得含 W2、N2—N7、业务写、通知或 `ai_audit` 等现场真值字段；
- 未识别 validator error → `internal_validation_error` 并停止。

实现 `src/neoloop/ai/owner-first-n1-preview.ts`：

- 固定 request：N1/default/`N1-1.0.0-draft.2`/`SYN-FEEDBACK-029`；
- 第一次 candidate 用现有 `validateNodeCandidate` 形成安全分类；
- 成功时以一个 candidate 运行 `AuditedAiNodeRunner`；第二帧到达时以两个 candidate 运行同一 runner；
- 使用只存在于进程内存的 invoker、audit sink、clock 与 ID generator；
- invoker 忽略 runner 的自由文本 `repair_errors`，只按已提交 candidate 顺序返回；
- runner 返回后再次用公共 `validateAiNodeEnvelope` 验证；
- stdout/report 只含五个固定字段，issue code 按规格 rank 排序；
- dispose 时清空 candidate、audit 与队列引用。

不得复制 `makeEnvelope`、N1 业务校验或 exact-14 校验。

## 5. Step 3：极薄 CLI 与固定 Prompt

先在 `tests/core/owner-first-n1-preview-cli.test.mjs` 建立 RED：

- 每帧恰好一行 compact UTF-8 JSON；五键顺序固定；stderr 空；
- 正常、第一次失败后第二次成功、两次失败、fatal transport 与第三帧；
- stdout/stderr 不含原文、quote、自造键、URL、资源 ID、token/cookie/account；
- 静态 import graph 不含 `fs`、`child_process`、网络模块、数据库或日志模块；
- 在 Node permission 模式且不授予 fs-write、net、child、worker 时，预编译 CLI 正例仍通过；
- 运行前后隔离 cwd 文件清单与摘要不变。

实现 `src/neoloop/cli/owner-first-n1-preview.ts`：

- 只消费 stdin bytes、调用严格分帧与 preview session、写 stdout；
- 不接受参数、路径、URL、request 或现场状态字段；
- 预期失败只输出固定报告，异常不打印 message/stack；
- 成功 exit 0，`needs_human`/transport/internal exit 1。

新增 `feishu/prompts/n1-owner-first-exact-5.txt`：

- 顶层 exact 5 键；
- `payload` exact 4 键，必须包含 `request_evidence_span_index`；
- 固定 fixture、证据半开区间、注入隔离、禁止确定性 envelope 字段；
- 文件末尾固定 `修复区：`，第一次失败时只追加规格中唯一修复句。

## 6. Step 4：离线总门

串行执行：

1. 新增三组定向测试；
2. `node tests/core/run-core-tests.mjs --local-only`；
3. `node tests/core/run-core-tests.mjs --cross-only`；
4. Contract、Offline、Day-1；
5. P01、P03 partial、P12/P13 本地只读 evidence validators；
6. scoped ESLint、`node --check`、`git diff --check`、敏感文本扫描。

禁止运行真实 P12 probe、CLI/OpenAPI、网络或飞书写操作。任何门失败先修复并全量复跑，不进入 Safari。

## 7. Step 5：准备只读临时运行时

- 在 Safari 操作前，用仓库已固定的 TypeScript 编译器把 `src/neoloop` 编译到 `mkdtemp` 私有目录；此阶段尚未接收 candidate。
- 编译完成后写入 ESM package boundary，复核输出清单，再将运行树设为只读。
- 只启动预编译 `owner-first-n1-preview.js`，Node 进程只获读取该运行树的权限；不授予文件写、网络、child、worker 权限。
- 当前实跑 Node 版本如为 26，只记录为本地 owner-preview 证据，不替代 Node 22.13 正式发布资格。
- validator 进程句柄与 Safari 控制都保存在同一个 `node_repl` 会话；candidate raw 不回显到对话。

## 8. Step 6：Safari 串行现场

1. Safari 去重，只保留一个目标 Base 页面；如重复页有未保存内容则停止。
2. 只读确认六条工作流均关闭，尤其 W2；记录当前 N1 Prompt 的内存回滚快照和可见运行/表/AI 审计基线。
3. 若只能测试整条工作流、不能明确单节点预览，则停止，不保存 Prompt。
4. 保存 fixed exact-5 Prompt；退出并重开 N1，复核 Prompt 与 W2。
5. 选择现有 `SYN-FEEDBACK-029`，逐字确认渠道和原文，不改记录状态。
6. 执行第一次且仅一次 N1 单节点预览。
7. `node_repl` 在不输出 candidate 的前提下，从剪贴板取得实际 bytes、加 RS/LF 后写入 validator stdin，并立即用固定内容覆盖剪贴板。
8. 成功则停止；fatal transport/internal 则停止；可修复 candidate error 只追加唯一固定修复句，重开复核后执行第二次且最后一次预览。
9. 第二次失败即 `needs_human`，不得第三次。

Computer Use 行为确认：用户已明确授权修改 N1 Prompt并运行合成单节点预览；不涉及凭据、扩权、分享、法律/财务或不可恢复删除，因此无需额外确认。若出现登录、权限或安全提示，按 Computer Use 规则在动作时停下。

## 9. Step 7：收口与证据

- 结束 validator，清理只读临时运行树；复核没有 candidate 原始文件。
- Safari 独立复核 W2/W1—W6 状态、N1 新增预览数、N2—N7 可见运行、10 表记录数、AI 审计记录数与整工作流运行历史。
- UI 无法观察的事实写“无法建立”，不得硬写 0。
- 只保存：synthetic scope、fixture ID、预览次数、成功时固定五键集合、闭集 issue code、最终分类和各现场观察来源。
- 不前移 P03/P04/P05/P12/P13，不写正式上线或企业效果。
- 更新 `.codex/PROJECT_UPDATE.md`，checkpoint 预览/应用，最终 handoff 预览/应用。

## 10. 回滚

- W2 意外开启：立即关闭并停止。
- Prompt 保存失败或漂移：恢复写前内存快照，不预览。
- 修复超出固定模板：恢复最近已验证 exact-5 Prompt；无法确认则恢复写前 Prompt。
- 业务写、通知或持续触发：关闭 W2，保全脱敏失败证据，不删除历史、不写回“未发生”。
- 合法 exact-5 Prompt 即使预览失败也可保留为 `configured_disabled_unverified`；不得恢复旧的模型直出 14 键路径并冒充修复。
