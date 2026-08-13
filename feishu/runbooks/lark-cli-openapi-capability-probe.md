# lark-cli 与 Base OpenAPI 现场能力探测手册

版本：`0.1.8`
事实分类：`solution_design`
当前现场记录（2026-08-10）：P11、P12、P13 均已收口为 `completed / 受限` 并绑定脱敏证据；P12 已完成 Wiki 解析、目标表元数据与 40 字段读取，以及一条合成测试记录的写前零命中、创建、精确读回、删除和删后零命中；P13 已完成专用 CLI profile、用户身份认证、9 项精确 scope 检查与同一应用绑定核验。P03 仍为 `not_tested / result=null`。
适用探针：P11、P12、P13

本机已从官方 npm 包安装 `@larksuite/cli 1.0.84`。项目唯一专用自建应用“石听 NeoLoop”的线上版本已发布启用并由用户重新授权。2026-08-10 的增量现场验证中，当前用户身份精确具备 9 项已批准 scope；`auth status --verify`、9 项逐项 `auth check`、Wiki 解析、目标表元数据读取、字段读取和一条合成测试记录的完整可逆闭环均成功。测试记录已删除，按同一标记复查为 0；仓库证据不保存 token、授权 URL、设备码、账号标识或飞书资源坐标。

本次结论严格为 `completed / 受限`：只证明当前租户、当前用户身份、当前专用 profile 和正式合成 Base 中“反馈案件”表的单条记录路径；未验证记录更新、批量并发、限流、未知提交状态、bot/tenant 身份、结构写入、视图写入、工作流控制、企业真实数据或生产长期稳定性。2026-08-08 的首次 Wiki 入口失败及 `blocked / result=null` 证据继续保留为历史事件，不再代表 P12/P13 当前状态。

当前状态的两份绑定证据与机器验收入口：

- `feishu/evidence/live/2026-08-10-p12-p13-completion.redacted.json`
- `feishu/evidence/live/2026-08-10-p12-p13-onsite.redacted.json`
- `node feishu/scripts/validate-live-p12-p13-completion.mjs`

历史失败证据继续由 `node feishu/scripts/validate-live-p13-evidence.mjs` 验证；两个校验器分别证明“历史失败没有被改写”和“后续受限闭环已经完成”，不得互相覆盖。

## 1. 官方依据与边界

- 官方 CLI 项目与命令说明：[Lark CLI](https://github.com/larksuite/cli)。现场使用前先核对赛事规则、安装版本和该版本 `--help`，不以离线文案猜测参数。
- Base OpenAPI 的身份与资源边界、写请求串行等约束：[多维表格概述](https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview?lang=zh-CN)。使用 `tenant_access_token` 时，应用必须是目标 Base 的所有者或协作者；当前 `user_access_token / --as user` 路径跟随授权用户本人的可访问范围，不得为了满足流程形式额外将应用添加为 Base 协作者。
- 平台频控分类与重试依据：[OpenAPI 频控](https://open.feishu.cn/document/server-docs/api-call-guide/frequency-control?lang=zh-CN)。
- `services/openapi-ingest/` 是石听 NeoLoop 自有入站接口骨架；P12 是赛事租户的 Base 出站能力探测。两者不是同一接口，也不能互相充当证据。
- CLI 或 OpenAPI 结果不能替代 P01 文档匿名访问、P02 Base 核心能力、P03 Base 无特权访问、七节点或六工作流的现场证据。
- Base 正式字段合同来自 `feishu/manifests/neoloop-logical-manifest.v0.1.json`。现场探测不得增加 helper/formula 字段，不得改变 `1.0.0-draft.2`。

## 2. 必须先满足的人工前置

按下列顺序逐项记录，不满足即停止；尚未开始的下游探针保持 `not_tested`，已经发生创建动作但尚未闭环的 P11 必须立即按状态合同转为 `blocked + result=null` 并补齐非空脱敏证据：

1. 参赛者本人确认赛事规则明确允许企业自建应用、OAuth、CLI 和 OpenAPI 探测。
2. 参赛者本人确认本项目只使用唯一专用自建应用“石听 NeoLoop”；到 CLI 绑定阶段时，由本人在受控终端通过 stdin 输入 App Secret、核对 OAuth scope 和完成设备确认，他人不得代输或复制这些材料。
3. 记录管理员对专用应用“石听 NeoLoop”首版上线、发布和审核的实际决定，并确认后续只运行用户身份最小 scope 和经批准的最小可逆写入。当前 `user_access_token / --as user` 路径仅核验授权用户本人对隔离 Base 的现有访问边界，不增加应用协作者；只有主控另行批准 `tenant_access_token` 路径后，才可按官方要求单独审批应用所有者/协作者关系。专用应用保持单实例：不得切回 `lunar`，不得通过后台或 CLI 再创建本项目的第二个应用。
4. P11 实际结果允许继续；只有看到入口、公开文档支持或其他租户可用，都不能放行 P12/P13。
5. P02 的实际范围允许创建隔离测试表或使用管理员指定的隔离资源。不得在正式业务表试写。
6. 现场负责人创建仓库外或被 Git 忽略的本地资源映射副本，并执行 `git check-ignore -q <local-mapping-path>`。若退出码不是 0，立即停止，不写入任何资源值。
7. 本地结果文件同样必须通过 `git check-ignore -q <local-result-path>`；模板文件 `.example.json` 不能直接承接真实结果。

需要管理员批准的动作：专用应用“石听 NeoLoop”的上线、发布和审核，批准 scope、最小可逆写入、开放产品或外链策略；只有已批准的 `tenant_access_token` 路径才包含应用协作者变更。需要参赛者本人完成的动作：登录、OAuth 同意、设备确认、授权范围确认与凭证保管。

## 3. 统一证据与脱敏规则

现场只把下列脱敏摘要写入被忽略的结果副本：

- 实际动作、时间、执行人代号和逻辑/平台角色；
- CLI 版本、命令名称、退出码和删去敏感字段后的结构化结果；
- scope 名称与 `auth check` 布尔结论；
- HTTP 方法、抽象资源类别、状态码、平台错误码、请求索引、延迟区间和重试决定；
- 最小写入的合成业务键、创建/查询/清理是否一致，以及复验人；
- 限制、失败分类、回退动作与清理回执。

不得保存 access token、refresh token、app secret、授权 URL、设备码、cookie、完整账号标识、真实 `app_token/table_id/field_id/view_id/role_id` 或完整飞书资源链接。终端原始输出如含上述内容，只在受控终端查看，不复制到仓库。

## 4. P11 后共享 CLI 准备（不提前完成 P13）

本节只为 P12 准备参赛者身份、最小 OAuth 和只读 CLI 通道。共享认证门即使完整成功，也不形成 P13 的最终结果；P13 必须在 P12 之后按第 6 节最后收口。规定动作已开始但 P12 尚未形成只读结果时，关联运行记录保持 `blocked + result=null`，不得提前把 P13 写成 `completed`。

### 4.1 预检（零写入）

| 步骤 | 现场动作 | 写入 | 最小通过条件 | 失败停点 | 证据 |
| --- | --- | --- | --- | --- | --- |
| CLI-00 | 核对第 2 节全部前置；确认本地映射和结果副本均被 Git 忽略 | 否 | 许可、本人同意、管理员条件和忽略检查均有记录 | 任一缺失即停止；共享准备保持 `not_tested` | 共享准备前置摘要 |
| CLI-01 | 打开官方仓库与本机包说明，核对已安装的 `1.0.84`、来源和 checksum | 否 | 版本与官方来源可追溯 | 版本或来源无法核实时停止 | 版本与官方来源索引 |
| CLI-02 | 先查看现场版本的帮助，确认 `config`、`auth status`、`auth scopes`、`auth check`、输出格式、schema 与 dry-run 的实际语法 | 否 | 后续命令与现场帮助一致 | 子命令或参数不存在时分类为版本/能力差异，不猜替代参数 | 帮助摘要，不保存用户信息 |

### 4.2 绑定唯一专用应用与本人最小授权（前置满足后才可执行）

以下是固定命令模板；真实执行结果只写入脱敏 live evidence，不用本手册冒充运行记录。使用命名 profile，避免覆盖参赛者的其他 CLI 配置：

```bash
lark-cli config init \
  --name "neoloop-r10-probe" \
  --app-id "<APP_ID>" \
  --app-secret-stdin \
  --brand feishu

lark-cli --profile "neoloop-r10-probe" auth login \
  --scope "bitable:app:readonly" \
  --no-wait \
  --json

# 参赛者完成浏览器授权并明确告知总控后，另一步恢复轮询：
lark-cli --profile "neoloop-r10-probe" auth login --device-code "<DEVICE_CODE>"
lark-cli --profile "neoloop-r10-probe" auth status --json --verify
lark-cli --profile "neoloop-r10-probe" auth check --scope "bitable:app:readonly" --json
```

执行约束：

1. 不使用 `config init --new`：只把 profile 绑定到唯一专用应用“石听 NeoLoop”，禁止创建第二个项目应用，也不得绑定 `lunar`。App Secret 只能由参赛者本人通过 stdin 输入，不放在命令参数、环境变量、聊天、仓库或证据中。
2. `--name` 只创建隔离 profile；后续每条命令都显式使用 `--profile "neoloop-r10-probe"`，避免身份串用。
3. 不使用 `auth login --recommend`。第一阶段只申请 `bitable:app:readonly`；OAuth URL、二维码与 device code 只临时交给参赛者本人，不进入证据。
4. `auth status --verify` 与目标 `auth check --scope ...` 是用户只读 scope 门的必须机器证据。`auth scopes` 只用于当前已批准权限内的受限诊断，不是硬门；若它需要 `application:application:self_manage`，直接跳过，不得为诊断扩权。
5. `bitable:app` 写权限属于后续独立批准门；只有管理员允许最小可逆写入时才另行增量授权，不与本次只读登录混用。
6. CLI 返回的结构化错误只保留脱敏后的错误类别和平台码；原始 provider message、cause、stack、用户/租户信息和资源坐标不得写入证据。
7. 运行真实 URL、Base token、表 ID 或 device code 前，参赛者必须在受控终端关闭 shell history、命令回显录制和自动截图；不得把含这些值的命令复制到聊天、仓库、证据或终端日志。

### 4.3 CLI 只读优先与最小写入

顺序固定：

1. `auth status`；未登录或状态未知则停止。
2. 对 `bitable:app:readonly` 执行精确 `auth check`；失败只记录缺失或拒绝，不扩大 scope 绕过。
3. `auth scopes` 仅在无需新增权限时作受限诊断；不可用不影响上述两项精确结果，不阻断认证门，也不允许申请 `application:application:self_manage`。
4. 首轮只用 `+url-resolve` 解析管理员批准的直接 Base URL，并只在受控终端读取坐标；解析成功不等于有记录读取权限。Wiki 或记录分享 URL 可能需要额外资源域权限，本轮不自动扩大 scope。
5. 用 `+record-list --filter-json` 做业务键精确等值查询，投影仅包含业务键，`limit=2`，显式 `--as user`。
6. 仅当 P12 的只读 Base 元数据和记录查询均有成功证据后，才进入第 5 节的一条最小可逆写入。

不得用 CLI 创建正式 Base、批量导入、开启自动化、变更权限或执行车辆控制。

本轮现场停点：三份计划先均为 `plan_ready` 且计数为 0；随后只对 cases 执行一次 explicit live。版本、status 和目标 scope 精确检查按顺序完成后，唯一 `+url-resolve` Wiki 入口命令非零退出，记录 `failure_stage=wiki_url_resolve_command_failed`、`classification=projection_dependency_failure`、`issue_codes=[command_failed]`。未进入 `record-list`，未重试，也未运行 `auth scopes` 或扩大权限。该闭集只描述命令级停止位置，不证明请求到达 provider，不归因于授权、资源、网络或产品内部原因。

只读命令模板：

```bash
lark-cli --profile "neoloop-r10-probe" base +url-resolve \
  --url "<APPROVED_DIRECT_BASE_URL>" \
  --as user \
  --format json

lark-cli --profile "neoloop-r10-probe" base +record-list \
  --base-token "<BASE_TOKEN>" \
  --table-id "<TABLE_NAME_OR_ID>" \
  --field-id "<SYNTHETIC_BUSINESS_KEY_FIELD>" \
  --filter-json '{"logic":"and","conditions":[["<SYNTHETIC_BUSINESS_KEY_FIELD>","==","<SYNTHETIC_BUSINESS_KEY>"]]}' \
  --limit 2 \
  --as user \
  --format json

lark-cli --profile "neoloop-r10-probe" base +record-search \
  --base-token "<BASE_TOKEN>" \
  --table-id "<TABLE_NAME_OR_ID>" \
  --keyword "<SYNTHETIC_KEYWORD>" \
  --search-field "<SYNTHETIC_BUSINESS_KEY_FIELD>" \
  --field-id "<SYNTHETIC_BUSINESS_KEY_FIELD>" \
  --limit 2 \
  --as user \
  --format json
```

`+record-search --json` 是完整请求体参数，不是 JSON 输出开关；输出格式使用 `--format json`。resolver 的 0/1/多命中判定应使用结构化等值过滤与 `limit=2`，不能用关键词搜索冒充精确业务键查询。

## 5. P12：Base OpenAPI 探测顺序

### 5.1 本地占位与请求边界

路径示意只使用运行时占位符，不在本仓库填值：

```text
GET  /open-apis/bitable/v1/apps/:app_token/tables
GET  /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records
POST /open-apis/bitable/v1/apps/:app_token/tables/:table_id/records
```

- `:app_token`、`:table_id` 只从通过 Git 忽略检查的本地映射读取。
- 使用管理员指定的隔离临时表。当前 `user_access_token / --as user` 路径只能访问授权用户本人已有权限的资源，禁止为了流程闭环额外把应用添加为 Base 协作者。只有未来另行批准 `tenant_access_token` 路径时，应用才必须是目标 Base 的所有者或协作者。
- 单 Base 写请求并发固定为 1。批量上限不从离线文档推断；导入包使用 25 的保守计划值，并以现场观察到的更小限制为准。
- 每个请求设置有限连接/响应超时并记录实际值；未知提交状态先按合成业务键精确回读，再决定是否重试。

### 5.2 只读探测

| 步骤 | 现场动作 | 写入 | 最小通过条件 | 失败停点 | 证据 |
| --- | --- | --- | --- | --- | --- |
| API-00 | 核对 P11、P02、赛事许可、最小 scope、与调用身份一致的资源访问边界和本地忽略门 | 否 | 全部有实际前置证据 | 任一缺失即停止；P12 保持 `not_tested` | P12 前置摘要 |
| API-01 | 读取可访问表清单或管理员指定表元数据 | 否 | 请求可鉴权且只返回批准范围 | 401/403、资源未授权或范围越界即停止 | 脱敏请求/响应索引 |
| API-02 | 读取隔离表中不存在的合成业务键 | 否 | 结果明确为空且无越权数据 | 返回非隔离数据、权限边界不明或超时即停止 | 空查询与范围摘要 |

### 5.3 一条最小可逆写入

只有 API-00—02 均满足后才执行；管理员禁止写入时保持 P12 对写能力的结果为空，不把只读结果外推为完整能力结论。

1. 生成现场运行标记 `SYN-PERMISSION-TEST-<approved-run-id>`，字段只含合成标记、schema 版本和测试用途；不含客户、车辆控制或真实账号数据。
2. 先按该业务键查询为 0；非 0 即停止，禁止覆盖。
3. 串行创建恰好 1 条记录，保存脱敏请求索引和响应状态，不保存资源 ID。
4. 立即按业务键查询，要求恰好 1 条且内容等于请求；重复创建测试只能在管理员另行批准时执行。
5. 清理时只定位该业务键及本次请求索引对应记录；删除或归档前由第二人复核。
6. 再次查询为 0，并记录清理回执。若清理失败，停止全部后续写入并由管理员处理，不扩大权限。

## 6. P13：在 P12 之后最终确认 CLI 能力

P12 完成 OpenAPI 只读探测或形成真实受限/不可用结论后，才汇总 P13：核对官方 CLI 安装来源与版本、唯一专用应用“石听 NeoLoop”的绑定、本人登录、`auth status --verify`、目标 scope 的精确 `auth check` 和批准范围内的只读 Base 结果。`auth scopes` 如可在现有权限内安全运行，只记为附加诊断；它不是完成门，也不允许为此增加 `application:application:self_manage`。共享准备期间的单项成功不能提前完成 P13；未执行保持 `not_tested + result=null`，已尝试但链路未闭合为 `blocked + result=null`，只有完成规定动作后才允许 `completed + 可用/受限/不可用`。

P13 只总结 CLI 在本租户、本身份和本次批准范围内的实际能力，不反推 P12 写能力，不替代 P02/P03，也不扩大 OAuth scope。

## 7. 错误分类、重试与停止

| 类别 | 观察信号 | 处理 | 是否自动重试 |
| --- | --- | --- | --- |
| AUTHENTICATION | 未登录、OAuth 未完成、401 或凭证无效 | 停止；由参赛者本人检查授权，不输出凭证 | 否 |
| AUTHORIZATION | `auth check` 失败、403、scope 被拒绝 | 停止；记录最小 scope 与审批状态，不申请宽权限绕过 | 否 |
| RESOURCE_ACCESS | `user_access_token` 代表的用户无权访问目标 Base，或已批准的 `tenant_access_token` 路径中应用不是 Base 所有者/协作者，或出现 404/资源级错误 | 停止；核对调用身份和精确资源边界，不为用户身份路径额外增加应用协作者 | 否 |
| RATE_LIMIT | HTTP 429、平台通用码 `99991400` 或 Base 码 `1254290` | 记录服务端返回的等待提示；降低速率，串行等待后只重试同一幂等动作 | 最多一次人工确认后的重试 |
| WRITE_CONFLICT | Base 码 `1254291` 或同键异内容 | 精确回读业务键；保留现状，转人工裁决 | 否 |
| TIMEOUT_UNKNOWN_COMMIT | HTTP 504、Base 码 `1255040`、客户端超时 | 先精确回读合成业务键；存在则视为未知提交后的读回，不再创建 | 仅确认未提交后一次 |
| INPUT_OR_SCHEMA | 400、字段/类型/枚举/关系不匹配 | 停止；对照冻结 manifest，不现场改约 | 否 |
| UPSTREAM_OR_NETWORK | 5xx、DNS/TLS/代理故障 | 保留原状态和请求索引；待环境恢复后重新从只读探测开始 | 否，另开复验 |

任一写入结果未知、边界泄露、scope 超出批准范围、第二次 schema 错误或清理失败，立即停止该链及依赖动作。不得把失败重标成成功，不得删除正式证据、重置 SLA 起点或继续批量导入。

## 8. P11/P12/P13 状态判定

机器记录必须先判执行进度，再判能力结果：

- 前置不全且规定动作尚未开始：`not_tested + result=null + evidence=null`。
- 任一规定动作已经开始，但最小动作、边界动作、清理、复验或证据尚未闭环：`blocked + result=null + 非空脱敏证据`。
- 只有完整执行后才允许 `completed`；此时 `result` 只能是 `可用 / 受限 / 不可用`。
- 前置完整后，赛事、租户、管理员或产品以完整证据明确拒绝目标能力：`completed + 不可用`。
- 只有部分目标成立且限制和保底路径均有实测证据：`completed + 受限`。
- 全部规定动作、权限边界、失败路径、清理与复验都有证据：`completed + 可用`。

已开始的探针不得因后续前置不足、上线等待或证据未闭环而退回 `not_tested`。

当前工具事实为：CLI 已安装；唯一专用应用“石听 NeoLoop”首版 `1.0.0` 已发布启用并通过审核；P11 已记录为 `completed + 受限 + 非空脱敏证据`。共享 CLI 认证准备也已实际执行：专用应用绑定仅在内存等值比较后为 machine verified，同一新交易 completion 成功，`auth status --verify` 和 `auth check --scope bitable:app:readonly` 的精确脱敏结果均满足用户只读 scope 门。`auth scopes` 未运行，仅作受限诊断，不申请 `application:application:self_manage`。P12 随后开始一次 cases 只读入口动作，但在 `+url-resolve` Wiki 入口命令级失败后立即停止：`base_read_command_attempt_count=1`、`record_list_command_count=0`、业务写入数为 0；未重试或扩权，也不推断 provider HTTP/OpenAPI 是否实际到达。因此 P12 与 P13 均保持 `blocked + result=null`，P03 保持 `not_tested + result=null`。现场结果只写入脱敏 live 工作副本；不得修改 `.example.json` 模板来伪装运行记录。

## 9. 回退与保底

- CLI：停止后续命令，由参赛者本人撤销本次 OAuth/配置；不删除原有 CLI 配置。安装清理按锁定版本官方说明执行，未经本人确认不移除任何软件。
- 自建应用：唯一专用应用“石听 NeoLoop”不作为普通回退对象删除。由管理员只撤销本轮临时 scope 和授权；仅在另行批准的 `tenant_access_token` 路径确实新增了应用协作者时，才精确撤销该关系。保留审批结论与撤销回执，不保存凭证；若后续授权受阻则停止，不得改用 `lunar` 或新建第二个项目应用绕过。
- OpenAPI：停止写入，精确回读未知提交；只清理 `SYN-PERMISSION-TEST-<approved-run-id>`，不使用通配符或清空表。
- 无 OpenAPI：保底为表单、人工导入和飞书原生自动化；P12/P13 不能替代 D0，也不能阻塞继续完成离线设计。
- 无安全隔离或无法确认 Git 忽略：不加载真实映射、不执行请求，相关能力保持 `未测试`。
