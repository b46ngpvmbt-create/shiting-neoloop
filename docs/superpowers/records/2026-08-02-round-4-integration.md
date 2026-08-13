# 第四轮主控集成记录

日期：2026-08-02
范围：T3 N7/W5 单案闭环安全收口、T4 公开体验与评委材料、发布依赖修正
结论：`已纠正`；第四轮本地候选通过，允许进入 W6 改进闭环与 Excel 原生格式收口

## 1. 主控裁决

- 接受 N7 三模式、W5 验证回访和 `SYN-CASE-017` 单案闭环的最终实现。授权能力和并发边界经过新增失败用例纠正后，独立复审为 P0=0、P1=0。
- 接受只读公开站候选、评委文稿、视频脚本和视觉附录。它们只消费冻结 public 快照，不把赛事飞书、真实数据或企业成效写成既成事实。
- 接受 Next 补丁升级及限定在 Next 依赖树内的 PostCSS、sharp 覆盖。生产依赖审计为 0，但开发/构建依赖仍有告警，另列风险，不写成“全依赖零漏洞”。
- T2 继续停在离线验收状态；P01—P13、真实 Base、AI、自动化、CLI 登录和 OpenAPI 都没有现场运行证据。
- 本轮未推送 GitHub、未部署新版、未提交作品，也没有接入新石器真实数据。

## 2. T3：N7、W5 与单案闭环

- N7 共用 `N7-1.0.0-draft.2`，只提供客户回复、知识草稿、洞察摘要三种未发布草稿。
- W5 保留处置证据、回复审核、回访和关单四组人工关口；没有自动发送、知识发布、车辆控制、判责、赔偿、恢复时间或最终根因动作。
- 命令在授权前形成权威深拷贝；一次性不透明 grant 绑定 workflow、event、case、work order、action、目标与命令指纹、principal 和 policy。
- repository 直写绕过、授权等待期间外部改写和 W4×W5 丢更新均先由确定性失败用例暴露，再以最小修改关闭。
- `node tests/core/run-core-tests.mjs --local-only`：126/126。
- `node tests/core/run-core-tests.mjs --cross-only`：4/4。
- `node tests/core/run-core-tests.mjs`：130/130；主控在系统 Node 26.5.0 与精确 Node 22.13.0 下各复跑一次，均为 0 失败、0 跳过。

这些结果只证明单进程 JavaScript、in-memory repository、scripted fake、合成数据和测试时钟成立。它们不是数据库事务、跨进程锁、企业 IAM、真实送达或生产并发证据。

## 3. T1 与 T2 回归

- `node --test tests/data/*.test.mjs`：23/23。
- canonical validator：30 条反馈、20 个案件、27 张工单、10 个问题簇、10 个改进项目；0 errors、0 warnings；原报名 Excel 哈希匹配。
- public validator：14 个文件、5 个视图；0 errors、0 warnings；manifest SHA-256 为 `3fb3dbff876eb0619ed7037be65db862b30a52bdee76df70e57b425661e0cae3`。
- 飞书 contract、offline、day-1 分别为 80/80、152/152、213/213。
- P01—P13 仍全部为 `not_tested`；真实操作、CLI 登录和 OpenAPI 调用次数均为 0。

三份 Excel 的 26 张 sheet 内容仍可通过数据回归，但冻结窗格和打印区域没有持久化，原生格式门继续阻断。

## 4. T4：公开体验与评委材料

- 网站只从 `data/canonical/public` 的冻结快照投影数据；五个页签、默认 8 行、展开/收起、键盘焦点和边界文案均有契约测试。
- `node --test tests/web/*.test.mjs`：3/3。
- SSR 渲染测试：2/2。
- `npm run check:release` 在系统 Node 26.5.0 与精确 Node 22.13.0 下均通过；lint、两次 Vinext build 和 Netlify 静态导出退出码均为 0。
- 页面保留队名、成员、学校专业、授权邮箱、GitHub 个人主页和仓库入口，并明确“参赛成员不等于演示中的企业角色”。
- 评委 Markdown、4 分 40 秒视频脚本和证据清单使用同一事实分类与运行计数。
- 视觉附录为 10 页 A4 横版，大小 3,791,671 bytes，SHA-256 为 `8c8e94f40305c3a8e8e013006490a5552f2453d98e245b17ef3c3e8120a52b38`。
- PDF 抽取文本含 local 126/126、cross 4/4、full 130/130、`not_run` 和 `not_tested`，不含旧 125/129；5 个注释链接均为 HTTPS，无 localhost。
- 联系表 SHA-256 为 `96c2b670351f110802278425d50724836a9a095697d210d9275f425f621393f1`，10 页无可见裁切、重叠或溢出。

当前执行环境访问 GitHub 个人主页曾出现连接超时，链接值与 PDF 注释正确，但在线可达性仍须在最终发布验收时重试。新版页面和材料都没有推送或部署。

## 5. 依赖与发布安全门

- Next 与 eslint-config-next：16.2.12。
- Next 依赖树内 PostCSS：8.5.25；sharp：0.35.3。
- Miniflare 开发链仍包含 sharp 0.34.5，不属于本轮已清零的生产依赖范围。
- `npm audit --omit=dev --audit-level=high`：退出码 0，0 vulnerabilities。
- 完整 `npm audit --audit-level=high`：退出码 1，共 45 个节点级告警，其中 3 low、7 moderate、35 high；集中在 ESLint、Babel、Vite、Wrangler、Miniflare、Vinext 和其他开发/构建链。该结果作为下一轮独立升级任务，不用 `npm audit fix --force` 冒险覆盖。
- `git diff --check`：退出码 0。
- 密钥与本机路径扫描只命中一个故意设置的 Bearer 负向自测和 `layout.tsx` 的本地开发 host fallback；未发现真实密钥或本机用户目录绝对路径。

构建保留 Vinext 路由静态分类提示；Node 26 保留 `module.register()` 弃用提示，Node 22 保留 `punycode` 与 experimental glob 提示。它们没有造成测试或构建失败。

## 6. 冻结入口

- 主计划：`6d926c4991c8d1156b3456d33b57c717f08ce882ce8a625b5af94710a4e9145f`
- A+ 规格：`35f4e83d7f7839a368c515af015d3d7d7d18ac3e36313f1323aca69b561440f3`
- canonical manifest：`3e3ebc6a8aaf1f0692db39b0c763b081df2ef5f9db6f6d8da9f3a0ab8edbe8b7`
- public manifest：`3fb3dbff876eb0619ed7037be65db862b30a52bdee76df70e57b425661e0cae3`
- T2 logical manifest：`f2d7fe2d0d71fd88a4532b7c2245b1585d9f41e7a5082165c714d1a3ef5ac2a0`
- `package.json`：`85983a5b4558118f2d2f5f5cc8a2f351f0062b72b28e572a5d24ba7c018eef79`
- `package-lock.json`：`c817a8ab55f34f494a8b2aa0389b763e0f9759e9c32707438f42a2583700c167`

## 7. 剩余阻断与下一轮

1. 修复三份 Excel 的冻结窗格和打印区域，并做 26 张 sheet 的重导入、公式、筛选、验证、视觉和打印验收。
2. 实现 N5 跨事件聚类、N6 根因假设、问题簇、改进项目、7/30 天测试时钟、复发重开与知识审核，完成 W6 改进闭环。
3. 单独审查并升级开发/构建工具链；生产审计为 0 不能替代该任务。
4. 现场权限到位后才执行 P01—P13、真实 Base、AI、自动化、无特权访问、CLI 登录和 OpenAPI smoke。
5. 后续仍需 D0 四类故障、20 案合成流程对照、CLI/CI/覆盖率、妙搭、Aily、视频成片、匿名访问和最终发布。

## 8. 偏航检查

- 完成项：主计划 8 月 6 日 N7、W5 和单案闭环，以及 T4 本地公开体验和评委材料候选。
- 越界修改：依赖补丁只处理正式审计发现的发布风险；没有改变数据契约、状态枚举、工作流顺序或飞书现场状态。
- 事实与权限：四类事实继续分开；人工关口没有削弱；没有把合成证据写成企业事实。
- 发布状态：未提交、未推送、未部署、未获得赛事飞书现场验收结论。
- 计划回读：主控在授权、并发边界变化时追加回读，并在本轮集成完成后逐段读完 507 行主计划。当前主链仍是 W6 改进闭环、Excel 原生格式和开发工具链收口。

结论：`已纠正`。
