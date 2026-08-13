# 石听 NeoLoop 飞书工作台插件

独立、合成数据优先的飞书多维表格工作台前端候选。它把 6 个页内标签、10 张 Base 表入口、连接器管理、手工备用录入、来源证据、AI 审计和四角色按钮策略放在一个页面中。

## 本地运行

```bash
cd feishu/workbench-plugin
npm install
npm run check
npm test
npm run dev
```

仓库根目录已经具备同版本 Vite/TypeScript 时，也可不安装嵌套依赖，直接运行：

```bash
../../node_modules/.bin/tsc -p tsconfig.json --noEmit
../../node_modules/.bin/vite build
```

`npm run build` 生成相对资源路径的 `dist/`。当前生产静态入口已发布到
`https://shiting-neoloop-w2-edge.netlify.app/`；将该 HTTPS 地址填入飞书应用模式
自定义插件后，才算完成飞书宿主内嵌。直接在普通浏览器打开时不会回退到 mock 数据。

## SDK 边界

UI 只依赖 `WorkbenchBaseAdapter`。生产构建直接从稳定版
`@lark-base-open/js-sdk@1.0.2` 导入 `bitable`，通过
`createOfficialLarkBaseAdapter` 调用 `base.getTableMetaList()`、
`base.getTableById()`、`table.getRecordsByPage()` 和
`ui.switchToTable()`。`createLarkBaseAdapter` 保留为可机验的 host adapter
边界，便于用最小兼容对象做合同测试。

合成 mock 仅在 `npm run dev` 的 localhost/127.0.0.1 页面启用。
生产 bundle 始终连接飞书 SDK；若不在飞书宿主内，初始化必须显式失败，
不会默默切换为 mock。当前飞书帮助中允许应用模式自定义组件直接填写
HTTPS 服务地址；`opdev` 壳只作为需要上传打包时的可选方案，不是本方案的
绝对 P0。

## 连接器会话

真实连接器管理默认关闭。只有认证后端向当前页面注入短期、会话内的请求证明回调时，前端才会创建 `HttpConnectorClient`：

```ts
window.__NEOLOOP_CONNECTOR_SESSION__ = {
  baseUrl: "https://private-worker.example/",
  requestProof: async () => authenticatedSession.getRequestProof(),
};
```

生产页没有该会话时，列表为空且所有管理写入明确失败；仅本地
Vite 开发预览使用纯内存合成 mock。包内没有 Owner 控制凭据，
不读取构建环境中的秘密，不使用浏览器持久存储。连接器密钥只由后端创建，
前端显示一次；关闭对话框后从页状态清除。

## 权限与数据边界

- `owner`：连接器管理、手工补录、安全业务更新、审核与知识发布。
- `operations`：手工补录与案件/工单安全字段；不能管理连接器或审核。
- `reviewer`：审核与知识发布；不能接入数据。
- `judge`：只读。
- 未列出的动作全部拒绝；任何角色都没有车辆控制动作。
- 默认且唯一允许的演示数据范围是 `synthetic_experiment`。
- 具体平台卡片全部显示“未配置”，不得据此宣称真实平台已经接入。

## 现场接入前分级门

- P0：配置可访问的 HTTPS 服务地址，确认官方 SDK 宿主连接；由认证后端提供短期请求证明并校验 Worker 白名单、CORS 和角色声明；用真实服务端读回表、字段和记录统计。
- P1：在飞书后台申请并确认最小 Base 权限，把专用应用加入目标 Base；验证 Owner 的列表、详情、连接器和手工备用路径。
- P2：如选择上传型扩展点，再用 `opdev` 脚手架承载本包；补测运营、审核、只读评委。当前第二身份验收仍为 `waived_not_completed`。
