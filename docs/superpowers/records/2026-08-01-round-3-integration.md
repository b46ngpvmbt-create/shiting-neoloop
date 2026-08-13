# 第三轮主控集成记录

日期：2026-08-01
范围：T1 canonical public、T2 第一天现场探针离线包、T3 N4/N6/W3/W4 与 W3 R3.1 安全收口
结论：`已纠正`；第三轮本地集成通过，允许 T4 只读消费冻结 public 快照

## 1. 主控裁决

- 接受 T1-R3、T2-R3 与 T3-R3.1 的偏航记录和最终代码状态。
- `data/canonical/public` 作为 T4 唯一公开数据入口冻结；T4 不得读取 canonical 私有目录、旧 `data/demo-cases.json` 或自建第二套业务状态。
- T3 的下一项主链可进入 N7/W5，但必须另开轮次并继续保留人工回复、验证、回访与结案关口。
- T2 继续等待赛事租户现场权限；离线 213/213 不能替代 P01—P13、真实 Base、AI、自动化、CLI 或 OpenAPI 验收。
- Excel 原生格式门继续阻断。公开快照冻结不代表三份工作簿已经最终格式完成。

## 2. T1 数据与公开快照

- `node --test tests/data/*.test.mjs`：23/23 通过。
- canonical validator：30 反馈、20 案件、27 工单、10 问题簇、10 改进、8 车辆、12 配送任务、20 路由规则、4 知识索引、0 AI 审计；20 金标准、16 对抗样例、1 主故事、4 故障；0 errors、0 warnings。
- 原报名 Excel SHA-256：`9fe6fae6cb0f6cc4ca25695df57cc61b8a1a30c6f9f9d667ff7a8125a73f3be5`。
- canonical 契约投影 SHA-256：`3ff32e7eca534dbef1010fa13734aa31eb703ff303b485c397bf56f591430708`。
- public validator：snapshot `1.0.0-t1-r3-public.1`、schema `1.0.0-draft.2`、fixture `1.0.0-t1-r2`；14 个文件，30/20/27/10/10、1 主故事、4 故障、5 视图；0 policy failures、0 errors、0 warnings。
- public manifest SHA-256：`3fb3dbff876eb0619ed7037be65db862b30a52bdee76df70e57b425661e0cae3`。主控与独立复核均逐文件复算 12 个输入和 13 个输出哈希，零不匹配。
- 全部 public 与 canonical `data_scope` 均为 `synthetic_experiment`；正式实体、路由确认、7/30 天结果、人工结论和场景运行证据保持空值或未运行。

未关闭阻断：三份 Excel 共 26 张 sheet 尚未持久化冻结窗格，三个 workbook 没有打印区域。内容和预览验收不能代替原生格式验收。

## 3. T2 飞书第一天离线包

- `validate-contract-alignment.mjs`：80/80。
- `validate-offline-package.mjs`：152/152。
- `validate-day-1-probe-package.mjs`：213/213。
- cross-contract：4/4。
- P01—P13 为 13/13 `not_tested`，结果与证据均为 `null`。
- R3 共 70 条执行记录，70/70 `not_tested`、70/70 result `null`、70/70 evidence `null`。
- 41/41 现场 evidence 单元为 untested，`actual_result`、截图与运行记录为空。
- 48/48 R3 resource 字段与 300/300 资源映射叶值为 `null`；3/3 逻辑角色未映射。
- 7 个 AI 节点与 6 条工作流全部 `not_configured_untested`；10 表、5 视图、7 节点、6 工作流只表示 expected/import/evidence 单元。
- 真实飞书操作、lark-cli 安装/登录与 OpenAPI 调用均为 0。

## 4. T3 工程内核

- `node tests/core/run-core-tests.mjs --local-only`：100/100。
- `node tests/core/run-core-tests.mjs --cross-only`：4/4。
- `node tests/core/run-core-tests.mjs`：104/104。
- `npm run lint`：退出码 0。
- W3 顶层测试 46 项；R3.1 封闭清单内 P0=0、P1=0。

R3.1 公开纠正了旧绿灯没有覆盖的边界：运行时 action/字段闭集、可信目标级授权、失败和人工停点重放保真、AI envelope 二次绑定、同 case 单飞、冲突决定、审计失败后提交、opaque capability、provenance receipt、public Map 校验—提交 TOCTOU、W6 candidate/check 绑定、prototype/own-key/getter/Proxy 输入边界，以及 W4 接单/改派后的 W3 receipt 兼容。

事实边界不变：N4/N6 只生成候选；正式实体和责任路由保留两个独立人工关口；不判责、不定赔偿、不承诺恢复时间、不输出最终根因、不执行车辆控制。当前 receipt、锁、事件账本和 outbox 语义只由单进程 in-memory fake 验证，生产持久化、水平扩展、企业 IAM 与真实网络仍未验证。

## 5. 发布与仓库安全门

- `npm run check:release`：退出码 0；lint、页面渲染 2/2、两次 vinext build 与 Netlify 静态导出通过。
- `git diff --check`：退出码 0。
- `check:release` 本身不包含 core、data 或三组 Feishu validator；本记录只能把前述专项命令与发布命令合并称为第三轮完整本地验收，不能单独把 `check:release` 写成全套门。
- `.gitignore` 已增加 `/.codex/`、`/feishu/config/*.local.json`、`/feishu/.local/`；`git check-ignore -v` 对桥文件、本地资源映射和现场结果副本均命中。
- 生成器、workbook catalog 与历史技术记录中的本机绝对路径已改为相对路径或 `<workspace-root>`；排除 `.codex` 后，仓库候选文件的本机用户目录绝对路径扫描为 0。
- 密钥扫描只命中校验器故意设置的 Bearer 负向自测；未发现真实密钥、非空平台资源 ID、真实客户数据或正向“已接入、已上线、已提交、已获得权限、企业实际提升”声明。
- 既有用户修改未被回退；未推送 GitHub，未创建 Netlify 预览或生产部署。

构建保留两个非阻断提示：Node `module.register()` 弃用提示，以及 vinext 对动态 API 路由无法静态分类的提示。两者没有造成测试或构建失败。

## 6. 剩余阻断与下一轮

1. Excel 冻结窗格与打印区域仍未完成原生持久化。
2. P01—P13、真实 Base、无特权访问、匿名文档、AI、自动化、机器人、妙搭、Aily、lark-cli 与 Base OpenAPI 均待现场验证。
3. 企业身份、责任矩阵、SLA/升级路径、通知到达与平台并发语义均为待企业验证。
4. 生产适配器需要数据库事务、唯一约束、跨进程锁、durable outbox 和可信 IAM；当前本地证据不能替代这些能力。
5. T4 可只读消费 public 快照；T3 可另开 N7/W5 轮次；T2 在获得现场权限前保持离线状态。
6. 当前不满足最终提交标准，也不启动“三次九轮协议”。该协议只在 8 月 15 日正常验收接近完成时提醒用户是否启动。

## 7. 偏航检查

- 完成项：第三轮 T1/T2/T3 独立复核、主控全门、公开仓库安全修正与主计划快照更新。
- 越界修改：无业务越界；主控只增加发布忽略规则、移除本机绝对路径、更新主计划并写本记录。
- 契约与状态：schema、10 表、五组状态、AI envelope、事实分类和工作流顺序未改变。
- 发布状态：未推送、未部署、未接入真实数据、未获得现场验收结论。
- 纠正项：关闭 `.codex`/飞书本地文件未忽略、硬编码本机路径和“把 check:release 单独当全套门”三项发布假绿。

结论：`已纠正`。
