# P03 owner 基线与第二身份复验清单

> 适用范围：R10 现场 P03 `prebuild_gate`。本文件是执行辅助清单，不替代冻结的 probe suite、权限验收手册或规范证据索引。

## 1. 当前准备状态

以下内容均属于 `synthetic_experiment`，未使用企业真实数据：

- 临时 Base：P02 隔离测试 Base；
- 临时视图：`SYN_P03_ISOLATED_VIEW`；
- 精确筛选：`case_id = SYN-CASE-FORM-003`；
- 当前命中：1 条；
- 视图可见字段：`case_id`、`automation_result`、`fixture_marker`；
- `automation_result`：普通文本字段，当前为空；
- `fixture_marker`：普通文本字段，值为 `SYN-PERMISSION-TEST`；
- 原 `SYN_Cases` 视图：6 条记录；
- `SYN_P02_STATUS_PROBE`：关闭。

这些事实只证明 owner 侧准备完成。2026-08-08，owner 已将协作者管理权限从“可阅读用户”收窄为“可管理用户”并确认保存；这是 P03 prebuild 的首个权限动作。随后在同一 owner 会话中完成一轮共享边界收紧：Base 链接分享关闭为“仅协作者可访问”，外分享仅允许可管理权限用户，协作者管理限定为组织内用户，复制及创建副本/打印/下载限定为可管理用户，评论限定为可编辑用户，加密链接保持关闭。参赛者随后确认第二身份属于组织外账号；该分类目前只属于用户确认，尚未验证该身份与 owner 不同且没有管理员权限。

owner 尝试为 `SYN_P03_ISOLATED_VIEW` 开启独立视图分享。界面短暂显示已开启并生成分享入口，默认范围为组织内链接可读，复制关闭而返回原表开启；在收窄范围、复制或发送链接、邀请账号之前重新读取，独立视图分享已回退为关闭。未保存分享链接或资源标识，未邀请第二身份，也未建立外部访问。按停止门不重复开启，先保留脱敏失败事实并重新冻结 owner 基线。尚未打开无特权视图或尝试受保护修改，因此父 P03 当前必须保持：

```text
execution_status = blocked
result = null
evidence = non_empty_redacted_structured_index
actual_prebuild_proof = null
```

现场记录使用 `2026-08-08T11:26:07+08:00` 作为首个权限动作的脱敏证据落盘复核时间，不把它声称为后续每个 UI 动作的精确发生时间。独立分享回退后，owner 已重新核对隔离视图仍为 1 条/3 字段、`fixture_marker` 未变、`automation_result` 为空、原 `SYN_Cases` 仍为 6 条，自动化管理中已启用流程为 0。业务字段、反馈归属与关联关系仍待逐项完成脱敏等值复核；这些关键基线也不证明第二身份、五项可见性边界、受保护修改拒绝、撤权或清理已通过。

临时视图不计入正式 5 个业务视图，临时测试身份不计入正式 3 个逻辑角色。

## 2. 开始前 owner 冻结

在邀请第二身份前逐项复核，并仅保存脱敏结论：

- [ ] Base 仍为隔离临时范围，`enterprise_data_used=false`；
- [ ] 目标业务键仍是 `SYN-CASE-FORM-003`，不使用平台 record ID；
- [ ] 允许视图精确命中 1 条；
- [ ] `fixture_marker` 精确等于 `SYN-PERMISSION-TEST`；
- [ ] `automation_result` 类型仍为普通文本，前值为空；
- [ ] 原表记录数仍为 6；
- [ ] `feedback_text`、`status`、`risk_level`、`occurred_at`、`owner` 的前值已做脱敏等值证明；
- [ ] 反馈归属及全部关联字段的前值已做脱敏等值证明；
- [ ] 已确认版本历史或审计入口能够区分第二身份是否产生提交；若无法确认，后续不得把 `unauthorized_business_write_count` 记为 `0`；
- [ ] `SYN_P02_STATUS_PROBE` 仍关闭；
- [ ] 临时视图只显示 3 个测试所需字段；
- [ ] 没有共享正式 Base、正式业务视图或管理员配置入口；
- [ ] 已准备精确撤权与视图删除路径。

本节是 owner 的执行清单，不等同于已形成证据。开始权限动作前，以上前值必须实际冻结到脱敏证据索引；清单勾选不能替代版本记录、审计结果或前后等值证明。

不得把完整 Base URL、资源 ID、账号、平台 record ID、原始 provider 错误、OAuth 内容或凭证写入证据。

## 3. 第二身份硬门

只有同时满足以下条件才允许开始 P03 prebuild：

- 第二身份与 owner 为真实不同账号；
- 第二身份不是 Base 所有者，也不是租户或应用管理员；
- 第二身份使用独立会话；同账号无痕窗口不合格；
- owner 已确认只授予完成本次探针所需的最小临时访问；
- 受保护修改目标仅为非业务字段 `automation_result`；
- 自动化保持关闭，正式 Base、自动投影和业务写执行器保持关闭。

最小权限映射、临时分享或邀请中的最早一个配置动作，就是 P03 prebuild 的启动点。动作发生并被捕获后，必须立即把父 P03 转为 `blocked / result=null`，绑定非空脱敏规范证据；不能在动作前预写 `blocked`，也不能在动作发生后继续保留 `not_tested`。`actual_prebuild_proof` 在阶段未完整结束前仍为 `null`。

临时视图只显示 3 个字段只是 owner 侧的准备事实，不构成无特权安全边界证明。第二身份还必须验证无法看到其他视图、其他记录、管理入口、直接表面或 raw JSON；若平台无法把临时访问限制到该范围，按实际结果停止，不得扩大权限。

## 4. 串行执行顺序

1. owner 记录邀请前基线。
2. owner 只配置最小临时访问，不扩大到正式资源；首个权限动作完成后立即按第 3 节转换父 P03 状态并绑定启动证据。
3. 第二身份在独立会话核对：无 owner 权限、无管理员权限、无管理配置入口，也无法进入其他视图、其他记录、直接表面或 raw JSON。
4. 第二身份尝试打开 `SYN_P03_ISOLATED_VIEW`。
5. 第二身份核对只能看到 1 条合成记录和 3 个允许字段。
6. 只有允许视图已打开，且非隔离视图、非目标记录、直接表、raw JSON、管理配置五项边界全部安全时，第二身份才只对 `automation_result` 发起一次修改尝试；允许视图打不开或任一边界不安全时，`protected_mutation_attempted` 与 `protected_mutation_rejected` 必须同时保持 `false`，禁止继续写入探针。
7. owner 复核修改是否被拒绝，结合版本历史或审计核对第二身份提交次数，并核对业务状态、关系、记录数和自动化状态未变。若修改意外成功，先保存失败证据，再由 owner 把 `automation_result` 精确恢复为空并重新完成等值复核。
8. owner 撤销临时访问。
9. 第二身份刷新并重新登录，确认无法继续访问。
10. owner 再次按第 2 节清单复核，并按固定 22 键合同形成阶段观察。

## 5. 22 键闭集

`actual_prebuild_proof` 完成态只允许以下键，并保持顺序：

1. `data_scope`
2. `fixture_marker`
3. `test_scope`
4. `enterprise_data_used`
5. `actor_class`
6. `actor_distinct_from_owner_verified`
7. `owner_privileges_absent`
8. `administrator_privileges_absent`
9. `independent_session_verified`
10. `allowed_isolated_view_open_attempted`
11. `allowed_isolated_view_opened`
12. `non_isolated_views_hidden`
13. `non_target_records_hidden`
14. `direct_table_access_denied`
15. `raw_json_hidden`
16. `management_configuration_hidden`
17. `protected_mutation_attempted`
18. `protected_mutation_rejected`
19. `unauthorized_business_write_count`
20. `business_state_unchanged`
21. `temporary_access_revoked`
22. `cleanup_reverified`

静态值固定为：

```text
data_scope = synthetic_experiment
fixture_marker = SYN-PERMISSION-TEST
test_scope = isolated_temporary_base
enterprise_data_used = false
actor_class = ordinary_non_owner
```

五个 visibility 字段均为正向安全布尔，只有 `true` 才表示对应边界安全：`non_isolated_views_hidden`、`non_target_records_hidden`、`direct_table_access_denied`、`raw_json_hidden`、`management_configuration_hidden`。

保护修改遵守条件门：允许视图打开且五项 visibility 全为 `true` 时，`protected_mutation_attempted` 必须为 `true`，并按真实结果记录 `protected_mutation_rejected`；允许视图未打开或任一 visibility 为 `false` 时，两项必须保持 `false/false`，不得为了补齐证据继续尝试写入。

完整观察、撤权和清理复验后，prebuild 只按机器事实分类：允许视图打开、五项 visibility 安全、保护修改已尝试且被拒绝、越权业务写入为 0、业务状态未变，且没有其他限制时为“可用”；同样安全但存在非硬性限制、父记录限制非空且保底已验证时为“受限”；允许视图未打开、任一 visibility 不安全、已尝试的保护修改未被拒绝、越权业务写入大于 0 或业务状态变化时为“不可用”。“不可用”也必须先完成撤权、清理和复验；prebuild 无论结果为何都不能单独完成父 P03。

`automation_result` 未变化不能单独证明 `unauthorized_business_write_count=0`；必须结合 owner 前后基线和平台可用的版本/审计证据。

## 6. 立即停止条件

出现任一情况立即停止，不扩大权限，也不进入正式建设：

- 第二身份实际拥有 owner 或管理员权限；
- 无法证明第二身份与 owner 不同；
- 允许视图暴露了非最小字段、其他记录、管理员配置或 raw JSON；
- 受保护修改实际写入，或任何业务字段/关系发生变化；
- 自动化被意外启用；
- 无法精确撤销临时访问；
- 证据必须依赖账号、URL、资源 ID、token 或原始错误才能解释；
- 临时分享无法稳定保持目标最小范围，或保存后回退为关闭/未知状态；
- owner 前后基线无法等值复核。

## 7. 回滚

1. 撤销第二身份临时访问并完成刷新、重登复验。
2. 若 `automation_result` 意外写入，先保存失败证据，再由 owner 将其精确恢复为空；恢复后重新核对记录数、业务字段、反馈归属、关系和自动化关闭状态。
3. 保留原 `SYN_Cases` 与 `Cases_Form_Probe`。临时 P03 视图是否删除，由总控在证据收口后单独决定。
4. 不把清空 `fixture_marker` 或删除该字段作为普通 P03 回滚。只有确认字段专属于本探针、且没有证据、视图或其他记录引用后，才可经独立清理决定执行。
5. 不删除 `SYN-CASE-FORM-003`，除非另有独立、已复核的 P02 清理决定。
6. 复核原表记录数、业务字段、反馈归属、关系和自动化关闭状态。
7. 只保存脱敏证据索引；不保存 Base URL、记录 ID、账号或凭证。
