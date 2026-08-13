import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const CANONICAL = resolve(REPO, "data/canonical");
const TABLES = resolve(CANONICAL, "tables");
const MIGRATION = resolve(CANONICAL, "migration");

const SCHEMA_VERSION = "1.0.0-draft.2";
const DATA_SCOPE = "synthetic_experiment";
const SOURCE_SHA256 = "9fe6fae6cb0f6cc4ca25695df57cc61b8a1a30c6f9f9d667ff7a8125a73f3be5";
const SOURCE_NAME = "石听_NeoLoop_报名数据样例.xlsx";
const SOURCE_TIMEZONE = "Asia/Shanghai";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const pad = (value, width = 3) => String(value).padStart(width, "0");
const syn = (kind, number) => `SYN-${kind}-${pad(number)}`;

function excelSerialToIso(serial) {
  if (serial == null) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000));
  return `${date.toISOString().slice(0, 19)}+08:00`;
}

function base(legacyId, evidenceClass = "synthetic_experiment") {
  return {
    schema_version: SCHEMA_VERSION,
    data_scope: DATA_SCOPE,
    evidence_class: evidenceClass,
    created_at: "2026-08-01T00:00:00+08:00",
    updated_at: "2026-08-01T00:00:00+08:00",
    legacy_id: legacyId,
    source_kind: "registration_workbook",
    source_name: SOURCE_NAME,
    source_sha256: SOURCE_SHA256,
  };
}

function caseIdFromLegacy(legacyId) {
  const number = Number(legacyId.match(/(\d+)$/)[1]);
  if (number === 2) return syn("CASE", 17);
  if (number === 17) return syn("CASE", 2);
  return syn("CASE", number);
}

function feedbackIdFromLegacy(legacyId) {
  return syn("FEEDBACK", Number(legacyId.match(/(\d+)$/)[1]));
}

function workOrderIdFromLegacy(legacyId) {
  return syn("WO", Number(legacyId.match(/(\d+)$/)[1]));
}

function clusterIdFromLegacy(legacyId) {
  return syn("CLUSTER", Number(legacyId.match(/(\d+)$/)[1]));
}

function vehicleIdFromLegacy(legacyId) {
  return `SYN-VEHICLE-${legacyId.replace("DEMO-", "")}`;
}

function taskIdFromLegacy(legacyId) {
  return `SYN-TASK-${legacyId.replace("DEMO-T-", "")}`;
}

const vehicleByLegacy = Object.fromEntries(
  ["DEMO-X6-102", "DEMO-X6-107", "DEMO-X3-205", "DEMO-X6-118", "DEMO-X3-211", "DEMO-X6-130", "DEMO-X6-145", "DEMO-X3-222"]
    .map((id) => [id, vehicleIdFromLegacy(id)]),
);

const taskByLegacy = Object.fromEntries(
  ["DEMO-T-8452", "DEMO-T-8458", "DEMO-T-8461", "DEMO-T-8470", "DEMO-T-8474", "DEMO-T-8480", "DEMO-T-8488", "DEMO-T-8492", "DEMO-T-8501", "DEMO-T-8508", "DEMO-T-8514", "DEMO-T-8520"]
    .map((id) => [id, taskIdFromLegacy(id)]),
);

const rawFeedbackRows = [
  ["DEMO-F-001",46213.024305555555,"客户群","园区客户","DEMO-SRC-G-1001","北苑园区 DEMO-X6-102 停在非机动车道，后面有人差点撞到，货也没送到。","DEMO-C-001","DEMO-X6-102","DEMO-T-8452"],
  ["DEMO-F-002",46213.025,"车辆事件","现场运营","DEMO-SRC-E-2031","任务 DEMO-T-8452 异常中断，车辆位于非机动车道，已安排人员现场处置。","DEMO-C-001","DEMO-X6-102","DEMO-T-8452"],
  ["DEMO-F-003",46213.05,"客户群","驿站人员","DEMO-SRC-G-1002","DEMO-T-8458 到站了但舱门打不开，驿站已经等了十分钟。","DEMO-C-002","DEMO-X6-107","DEMO-T-8458"],
  ["DEMO-F-004",46213.05138888889,"运维工单","现场运营","DEMO-SRC-W-3001","DEMO-X6-107 舱门解锁失败，已重试两次。","DEMO-C-002","DEMO-X6-107","DEMO-T-8458"],
  ["DEMO-F-005",46213.052777777775,"热线转录","客户管理员","DEMO-SRC-H-4001","今天这个任务到站后开不了门，请尽快处理并同步进度。","DEMO-C-002","DEMO-X6-107","DEMO-T-8458"],
  ["DEMO-F-006",46213.05902777778,"客户群","客户运营","DEMO-SRC-G-1003","青岛园区有三辆车一起离线，发车页面都看不到。","DEMO-C-003","DEMO-X3-205","DEMO-T-8461"],
  ["DEMO-F-007",46213.06041666667,"线下沟通转录","现场运营","DEMO-SRC-O-5001","站点网络看起来正常，但车端从九点二十分左右陆续掉线。","DEMO-C-003","DEMO-X3-205","DEMO-T-8461"],
  ["DEMO-F-008",46213.09861111111,"服务评价","客户管理员","DEMO-SRC-R-6001","今天到宿舍站晚了三十多分钟，也没有提前通知。","DEMO-C-004","DEMO-X6-118","DEMO-T-8470"],
  ["DEMO-F-009",46213.100694444445,"邮件","高校后勤","DEMO-SRC-M-7001","请说明 DEMO-T-8470 延迟原因，并给出下一班次保障措施。","DEMO-C-004","DEMO-X6-118","DEMO-T-8470"],
  ["DEMO-F-010",46213.10277777778,"运维工单","现场运营","DEMO-SRC-W-3002","B座北门施工封闭，车辆仍按旧点位停靠。","DEMO-C-005","DEMO-X3-211","DEMO-T-8474"],
  ["DEMO-F-011",46213.10486111111,"客户群","物业人员","DEMO-SRC-G-1004","现在都从南门交接，麻烦把无人车停靠点改过去。","DEMO-C-005","DEMO-X3-211","DEMO-T-8474"],
  ["DEMO-F-012",46213.13888888889,"客户群","客户管理员","DEMO-SRC-G-1005","下周有两名新同事上岗，希望安排准时达基础操作和异常处理培训。","DEMO-C-006","DEMO-X6-130",null],
  ["DEMO-F-013",46213.135416666664,"车辆事件","系统事件","DEMO-SRC-E-2032","DEMO-X6-130 执行任务时触发低电量事件，任务暂停。","DEMO-C-007","DEMO-X6-130","DEMO-T-8480"],
  ["DEMO-F-014",46213.1375,"线下沟通转录","现场运营","DEMO-SRC-O-5002","早班没有及时安排充电，现在只能换车接着跑。","DEMO-C-007","DEMO-X6-130","DEMO-T-8480"],
  ["DEMO-F-015",46214.05416666667,"运维工单","现场运营","DEMO-SRC-W-3003","DEMO-X6-107 今天又出现一次舱门解锁失败，第三次重试成功。","DEMO-C-008","DEMO-X6-107","DEMO-T-8501"],
  ["DEMO-F-016",46214.055555555555,"服务评价","驿站人员","DEMO-SRC-R-6002","最后能打开，但现场多等了几分钟。","DEMO-C-008","DEMO-X6-107","DEMO-T-8501"],
  ["DEMO-F-017",46214.22222222222,"用户留言","终端用户","DEMO-SRC-U-8001","车已经到了我才收到消息，差点错过取件。","DEMO-C-009","DEMO-X3-222","DEMO-T-8492"],
  ["DEMO-F-018",46214.06319444445,"客户群","驿站人员","DEMO-SRC-G-1006","这趟清单是86件，现场只入库85件。","DEMO-C-010","DEMO-X6-118","DEMO-T-8508"],
  ["DEMO-F-019",46214.06458333333,"运维工单","现场运营","DEMO-SRC-W-3004","DEMO-T-8508 交接数量差1，申请核对装车和开舱记录。","DEMO-C-010","DEMO-X6-118","DEMO-T-8508"],
  ["DEMO-F-020",46214.25,"公开评论","App用户","DEMO-SRC-A-9001","新版搜索不能像旧版一样总览电量，车多时不方便。","DEMO-C-011",null,null],
  ["DEMO-F-021",46214.333333333336,"邮件","客户管理员","DEMO-SRC-M-7002","临时需要遥控移车，请问由谁审批、在哪里申请？","DEMO-C-012","DEMO-X3-211",null],
  ["DEMO-F-022",46214.15,"线下沟通转录","现场运营","DEMO-SRC-O-5003","这辆车最近两次都停在交接区外一米左右。","DEMO-C-013","DEMO-X6-130","DEMO-T-8520"],
  ["DEMO-F-023",46214.15138888889,"客户群","物业人员","DEMO-SRC-G-1007","请把停靠位置往里调，不然会影响消防通道。","DEMO-C-013","DEMO-X6-130","DEMO-T-8520"],
  ["DEMO-F-024",46214.22222222222,"客户群","客户运营","DEMO-SRC-G-1008","园区两辆X6今天都出现开门失败，已经影响两个班次。","DEMO-C-014","DEMO-X6-107","DEMO-T-8501"],
  ["DEMO-F-025",46215.083333333336,"邮件","客户管理层","DEMO-SRC-M-7003","希望每周自动收到站点任务量、异常类型和未关闭事项简报。","DEMO-C-015",null,null],
  ["DEMO-F-026",46215.270833333336,"服务评价","客户管理员","DEMO-SRC-R-6003","问题最后解决了，但中间没人解释原因，也不知道处理到哪一步。","DEMO-C-016",null,null],
  ["DEMO-F-027",46216.024305555555,"车辆事件","系统事件","DEMO-SRC-E-2033","DEMO-T-8488 冷链舱温度连续10分钟高于演示阈值，已触发告警。","DEMO-C-017","DEMO-X6-145","DEMO-T-8488"],
  ["DEMO-F-028",46216.083333333336,"客户群","客户管理员","DEMO-SRC-G-1009","上周提交的新线路现在到哪一步了？能否看到采图和部署进度？","DEMO-C-018",null,null],
  ["DEMO-F-029",46216.13888888889,"运维工单","现场运营","DEMO-SRC-W-3005","DEMO-X3-205 昨天的历史视频一直没有通过站点Wi-Fi回传。","DEMO-C-019","DEMO-X3-205","DEMO-T-8514"],
  ["DEMO-F-030",46217.052083333336,"服务评价","门店人员","DEMO-SRC-R-6004","青岛站这辆X6到店后第一次开门失败，重试后恢复。","DEMO-C-020","DEMO-X6-145","DEMO-T-8488"],
];

const rawFeedback = rawFeedbackRows.map(([legacyId, serial, channel, senderRole, sourceRecordId, originalText, legacyCaseId, legacyVehicleId, legacyTaskId], index) => ({
  ...base(legacyId),
  feedback_id: feedbackIdFromLegacy(legacyId),
  channel,
  sender_role: senderRole,
  original_text: originalText,
  received_at: excelSerialToIso(serial),
  source_timezone: SOURCE_TIMEZONE,
  source_record_id: sourceRecordId,
  source_tenant_scope: "synthetic-registration-demo",
  authorization_scope: "synthetic_demo_only",
  idempotency_key: sha256(`synthetic-registration-demo|${channel}|${sourceRecordId}`),
  processing_status: "已建案",
  linked_case_id: caseIdFromLegacy(legacyCaseId),
  candidate_vehicle_id: legacyVehicleId ? vehicleByLegacy[legacyVehicleId] : null,
  candidate_task_id: legacyTaskId ? taskByLegacy[legacyTaskId] : null,
  source_locator: `原始反馈!${index + 5}`,
  original_text_mutable: false,
}));

const caseRows = [
  ["DEMO-C-001","车辆停在非机动车道并出现险情","车辆运维","自动驾驶/道路安全","P0","车辆在任务中停于非机动车道，现场反馈后方骑行者险些碰撞。","DEMO-X6-102","DEMO-T-8452","DEMO-S-BY","DEMO-CL-003","已关闭","车辆运维+现场运维",46213.03472222222,46213.02638888889,46213.069444444445,"自动","是",0.98,"现场照片、任务日志、处置记录齐全","DEMO-值班经理"],
  ["DEMO-C-002","到站后舱门无法开启","车辆运维","舱门/柜体","P1","车辆到站后舱门无法开启，交接受阻，同任务产生多渠道重复反馈。","DEMO-X6-107","DEMO-T-8458","DEMO-S-YZ","DEMO-CL-001","已关闭","车辆运维",46213.09375,46213.05416666667,46213.086805555555,"自动","是",0.97,"错误码、开舱重试记录、现场视频齐全","DEMO-车辆运维主管"],
  ["DEMO-C-003","站点多车同时离线","车辆运维","网络连接","P1","同站点多辆车同时离线，疑似网络侧共因，任务发车受阻。","DEMO-X3-205","DEMO-T-8461","DEMO-S-QD","DEMO-CL-002","处理中","车辆运维+现场运维",46213.100694444445,46213.06319444445,null,"人工","是",0.72,"网络探测与车辆日志待补齐","DEMO-网络值班"],
  ["DEMO-C-004","任务到达晚于计划35分钟","客户服务","配送时效","P2","高校配送任务延迟，客户需要原因说明和后续预防措施。","DEMO-X6-118","DEMO-T-8470","DEMO-S-HD","DEMO-CL-004","已关闭","客户服务",46214.086805555555,46213.104166666664,46213.305555555555,"自动","是",0.94,"任务时间线、客服回复、回访结果齐全","DEMO-客服主管"],
  ["DEMO-C-005","路线点位指向关闭入口","现场运维","路线/地图点位","P2","车辆按既有点位到达已关闭入口，现场需重新校准停靠点。","DEMO-X3-211","DEMO-T-8474","DEMO-S-ZGC","DEMO-CL-005","待验证","现场运维",46214.104166666664,46213.10833333333,null,"自动","是",0.91,"新旧点位截图已上传，等待下一任务验证","DEMO-地图运营"],
  ["DEMO-C-006","新员工需要操作培训","现场运维","培训/现场操作","P3","客户新增运营人员，希望获得发车、异常上报和任务恢复培训。","DEMO-X6-130",null,"DEMO-S-YZ","DEMO-CL-006","已关闭","现场运维",46216.125,46213.15277777778,46214.333333333336,"不适用","不适用",0.88,"培训签到与资料链接齐全","DEMO-交付经理"],
  ["DEMO-C-007","低电量导致任务中断","车辆运维","动力/补能","P2","任务执行中电量低于安全阈值，现场临时调整车辆并补能。","DEMO-X6-130","DEMO-T-8480","DEMO-S-YZ","DEMO-CL-007","已关闭","车辆运维",46214.135416666664,46213.14027777778,46213.256944444445,"自动","是",0.96,"电量曲线、换车记录、补能记录齐全","DEMO-车辆运维主管"],
  ["DEMO-C-008","舱门偶发解锁失败","车辆运维","舱门/柜体","P2","同版本车辆舱门存在偶发解锁失败，重试后恢复。","DEMO-X6-107","DEMO-T-8501","DEMO-S-YZ","DEMO-CL-001","观察中","车辆运维",46215.055555555555,46214.061111111114,null,"自动","是",0.95,"错误码与重试次数齐全，待版本对比","DEMO-软件支持"],
  ["DEMO-C-009","到站通知延迟","客户服务","通知/订单状态","P3","车辆已到站但客户通知晚于实际到达时间。","DEMO-X3-222","DEMO-T-8492","DEMO-S-BY","DEMO-CL-004","已关闭","客户服务",46217.22222222222,46214.243055555555,46215.09027777778,"自动","是",0.92,"车辆到达时间与通知时间已核对","DEMO-客服主管"],
  ["DEMO-C-010","末端交接数量不一致","客户服务","装卸/交接","P2","驿站入库数量与任务清单相差一件，需要核对交接证据。","DEMO-X6-118","DEMO-T-8508","DEMO-S-HD","DEMO-CL-008","已关闭","客户服务+现场运维",46215.06597222222,46214.07083333333,46214.291666666664,"自动","是",0.93,"装车清单、开舱记录、入库清单齐全","DEMO-项目经理"],
  ["DEMO-C-011","新版搜索无法总览车辆电量","客户服务","产品体验/数据展示","P3","运营者希望恢复按搜索结果总览多车电量的能力。",null,null,"DEMO-S-YZ","DEMO-CL-009","已分诊","客户服务+产品",46218.25,46214.305555555555,null,"不适用","不适用",0.86,"公开评论样例，仅代表单一用户反馈","DEMO-产品经理"],
  ["DEMO-C-012","遥控权限申请路径不清晰","客户服务","账号/权限","P2","客户管理员不清楚临时遥控权限的申请和审批路径。","DEMO-X3-211",null,"DEMO-S-ZGC","DEMO-CL-006","待人工确认","客户服务",46215.333333333336,46214.350694444445,null,"人工","是",0.68,"需权限管理员确认现行流程","DEMO-权限管理员"],
  ["DEMO-C-013","停靠点位置漂移","现场运维","路线/地图点位","P2","车辆连续两次停靠偏离划定交接区，需要复核点位。","DEMO-X6-130","DEMO-T-8520","DEMO-S-YZ","DEMO-CL-005","处理中","现场运维",46215.15277777778,46214.15972222222,null,"自动","是",0.9,"现场照片齐全，地图版本待核对","DEMO-地图运营"],
  ["DEMO-C-014","站点出现批量舱门失败","车辆运维","舱门/柜体","P1","同站点两辆车短时间出现舱门失败，需按共因问题升级。","DEMO-X6-107","DEMO-T-8501","DEMO-S-YZ","DEMO-CL-001","处理中","车辆运维+产品",46214.26388888889,46214.22777777778,null,"人工","是",0.76,"已确认多车事件，待版本与部件批次核对","DEMO-质量经理"],
  ["DEMO-C-015","希望自动生成周运营简报","客户服务","数据分析/报表","P3","客户希望按站点生成任务量、异常和处置进度周报。",null,null,"DEMO-S-QD","DEMO-CL-009","已分诊","客户服务+产品",46219.083333333336,46215.125,null,"不适用","不适用",0.89,"需求已结构化，待确认指标口径","DEMO-产品经理"],
  ["DEMO-C-016","处置进度与原因说明不足","客户服务","服务沟通","P2","客户认为问题处理过程中缺少原因说明和进度同步。",null,null,"DEMO-S-HD","DEMO-CL-010","已关闭","客户服务",46216.270833333336,46215.291666666664,46216.083333333336,"不适用","不适用",0.84,"通话纪要、道歉回复、回访结果齐全","DEMO-客服主管"],
  ["DEMO-C-017","冷链舱温度持续告警","车辆运维","冷链/温控","P1","冷链任务出现持续温度告警，需先保护货物并核实传感器和制冷状态。","DEMO-X6-145","DEMO-T-8488","DEMO-S-QD","DEMO-CL-010","已关闭","车辆运维+现场运维",46216.06597222222,46216.03333333333,46216.09722222222,"自动","是",0.97,"温度曲线、换车记录、货物复核齐全","DEMO-质量经理"],
  ["DEMO-C-018","线路申请进度不可见","现场运维","路线申请/部署","P3","客户提交新线路申请后，希望看到审核、采图和部署进度。",null,null,"DEMO-S-ZGC","DEMO-CL-006","已分诊","现场运维",46220.083333333336,46216.11111111111,null,"不适用","不适用",0.87,"申请记录存在，待确认真实流程节点","DEMO-交付经理"],
  ["DEMO-C-019","站点Wi-Fi数据回传失败","车辆运维","网络/数据回传","P2","车辆任务完成但历史视频未按计划回传，需检查站点网络和回传任务。","DEMO-X3-205","DEMO-T-8514","DEMO-S-QD","DEMO-CL-002","处理中","车辆运维",46217.13888888889,46216.149305555555,null,"自动","是",0.91,"回传队列与网络日志待补齐","DEMO-网络值班"],
  ["DEMO-C-020","另一站点出现舱门解锁失败","车辆运维","舱门/柜体","P2","不同站点同版本车辆出现一次舱门解锁失败，应加入同一问题簇而非合并案件。","DEMO-X6-145","DEMO-T-8488","DEMO-S-QD","DEMO-CL-001","观察中","车辆运维",46218.052083333336,46217.0625,null,"自动","是",0.94,"单次事件证据齐全，待观察复发","DEMO-软件支持"],
];

const caseStatusRules = {
  "已关闭": { type: "direct", target: "已关闭" },
  "处理中": { type: "direct", target: "处理中" },
  "待验证": { type: "direct", target: "待验证" },
  "观察中": { type: "direct", target: "待回访" },
  "已分诊": {
    type: "conditional",
    condition: "missing_fields.length === 0",
    when_complete: "待关联",
    when_incomplete: "待补充",
  },
  "待人工确认": { type: "direct", target: "待关联" },
};

function migrateCaseStatus(legacyStatus, missingFields) {
  const rule = caseStatusRules[legacyStatus];
  if (!rule) throw new Error(`Unmapped legacy case status: ${legacyStatus}`);
  if (rule.type === "conditional") return missingFields.length === 0 ? rule.when_complete : rule.when_incomplete;
  return rule.target;
}

const routingRuleIds = new Map();
const cases = caseRows.map(([legacyId,title,domain,detail,risk,summary,legacyVehicleId,legacyTaskId,stationId,legacyClusterId,legacyStatus,team,slaDue,slaStart,closedAt,legacyAssociationMode,legacyAssociationCorrect,confidence,evidenceSummary,reviewer], index) => {
  const missingFields = [];
  if (["DEMO-C-011", "DEMO-C-015", "DEMO-C-018"].includes(legacyId)) missingFields.push("车辆ID", "任务ID");
  const status = migrateCaseStatus(legacyStatus, missingFields);
  const candidateGenerationMode = legacyAssociationMode === "自动" ? "AI" : legacyAssociationMode === "人工" ? "human_legacy" : "not_applicable";
  const routingRuleId = syn("ROUTING", index + 1);
  routingRuleIds.set(legacyId, routingRuleId);
  return {
    ...base(legacyId),
    case_id: caseIdFromLegacy(legacyId),
    title,
    summary,
    category_domain: domain,
    category_detail: detail,
    rule_risk: legacyId === "DEMO-C-001" ? "P0" : null,
    ai_risk: risk,
    final_risk: risk,
    status,
    legacy_status: legacyStatus,
    missing_fields: missingFields,
    record_mode: "legacy_snapshot",
    workflow_readiness: status === "已关闭" ? "requires_replay_reset" : null,
    entity_candidates: {
      vehicle_id: legacyVehicleId ? vehicleByLegacy[legacyVehicleId] : null,
      task_id: legacyTaskId ? taskByLegacy[legacyTaskId] : null,
      station_id: stationId,
      confidence,
      legacy_association_correct: legacyAssociationCorrect,
    },
    formal_entity: null,
    formal_entity_confirmation_status: "待人工确认",
    candidate_generation_mode: candidateGenerationMode,
    legacy_association_mode: legacyAssociationMode,
    evidence_completeness: evidenceSummary.includes("齐全") || evidenceSummary.includes("已核对") ? "complete" : evidenceSummary.includes("待") || evidenceSummary.includes("需") ? "partial" : "unknown",
    evidence_summary: evidenceSummary,
    sla_started_at: excelSerialToIso(slaStart),
    sla_due_at: excelSerialToIso(slaDue),
    sla_rule_version: "legacy-registration-demo-v1",
    closed_at: excelSerialToIso(closedAt),
    cluster_id: clusterIdFromLegacy(legacyClusterId),
    routing_rule_candidate_id: routingRuleId,
    suggested_team: team,
    legacy_reviewer: reviewer,
    pending_confirmation_items: legacyStatus === "待人工确认" ? [evidenceSummary] : [],
    migration_note: legacyStatus === "观察中" ? "案件状态观察中按规格迁为待回访；长期观察另迁至改进项目。" : null,
    source_locator: `反馈案件!${index + 5}`,
  };
});

const vehicleRows = [
  ["DEMO-X6-102","X6","北京","DEMO-S-BY","北苑园区","4.0-demo","运营中"],
  ["DEMO-X6-107","X6","北京","DEMO-S-YZ","亦庄共配","4.0-demo","运营中"],
  ["DEMO-X3-205","X3","青岛","DEMO-S-QD","青岛园区","3.1-demo","运营中"],
  ["DEMO-X6-118","X6","北京","DEMO-S-HD","海淀高校","4.0-demo","运营中"],
  ["DEMO-X3-211","X3","北京","DEMO-S-ZGC","中关村写字楼","3.1-demo","维护中"],
  ["DEMO-X6-130","X6","北京","DEMO-S-YZ","亦庄共配","4.0-demo","运营中"],
  ["DEMO-X6-145","X6","青岛","DEMO-S-QD","青岛园区","4.0-demo","运营中"],
  ["DEMO-X3-222","X3","北京","DEMO-S-BY","北苑园区","3.1-demo","运营中"],
];

const vehicles = vehicleRows.map(([legacyId, model, city, stationId, stationName, version, legacyStatus], index) => ({
  ...base(legacyId),
  vehicle_id: vehicleByLegacy[legacyId],
  model,
  version,
  station_id: stationId,
  station_name: stationName,
  city,
  status_snapshot: legacyStatus,
  snapshot_at: "2026-07-10T00:00:00+08:00",
  controls_available: false,
  source_locator: `车辆任务!${index + 5}`,
}));

const taskRows = [
  ["DEMO-T-8452","DEMO-X6-102","DEMO-S-BY","北苑仓-北苑驿站A","2026-07-10 08:30","中断","ROAD_BLOCK"],
  ["DEMO-T-8458","DEMO-X6-107","DEMO-S-YZ","亦庄仓-园区站3","2026-07-10 09:00","完成","DOOR_LOCK"],
  ["DEMO-T-8461","DEMO-X3-205","DEMO-S-QD","青岛仓-园区站1","2026-07-10 09:20","中断","NETWORK_LOST"],
  ["DEMO-T-8470","DEMO-X6-118","DEMO-S-HD","高校仓-宿舍站","2026-07-10 10:00","完成","LATE_ARRIVAL"],
  ["DEMO-T-8474","DEMO-X3-211","DEMO-S-ZGC","写字楼仓-B座","2026-07-10 10:15","中断","MAP_POINT"],
  ["DEMO-T-8480","DEMO-X6-130","DEMO-S-YZ","亦庄仓-园区站5","2026-07-10 11:00","完成","LOW_BATTERY"],
  ["DEMO-T-8488","DEMO-X6-145","DEMO-S-QD","青岛冷链仓-门店2","2026-07-10 12:00","完成","TEMP_ALARM"],
  ["DEMO-T-8492","DEMO-X3-222","DEMO-S-BY","北苑仓-写字楼C","2026-07-10 13:00","完成","NOTICE_DELAY"],
  ["DEMO-T-8501","DEMO-X6-107","DEMO-S-YZ","亦庄仓-园区站7","2026-07-11 08:40","完成","DOOR_LOCK"],
  ["DEMO-T-8508","DEMO-X6-118","DEMO-S-HD","高校仓-教学楼","2026-07-11 09:10","完成","HANDOFF_COUNT"],
  ["DEMO-T-8514","DEMO-X3-205","DEMO-S-QD","青岛仓-园区站4","2026-07-11 10:20","完成","WIFI_UPLOAD"],
  ["DEMO-T-8520","DEMO-X6-130","DEMO-S-YZ","亦庄仓-园区站9","2026-07-11 11:00","完成","STOP_DRIFT"],
];

const deliveryTasks = taskRows.map(([legacyId, legacyVehicleId, stationId, route, plannedTime, legacyStatus, anomalyCode], index) => ({
  ...base(legacyId),
  task_id: taskByLegacy[legacyId],
  vehicle_id: vehicleByLegacy[legacyVehicleId],
  station_id: stationId,
  route,
  task_status: legacyStatus,
  started_at: plannedTime.replace(" ", "T") + ":00+08:00",
  ended_at: null,
  source_at: plannedTime.replace(" ", "T") + ":00+08:00",
  anomaly_code: anomalyCode,
  state_mutable_by_neoloop: false,
  source_locator: `车辆任务!${index + 5}`,
}));

const workOrderRows = [
  ["DEMO-WO-001","DEMO-C-001","车辆运维","DEMO-车辆运维-负责人","已验证",46213.02638888889,5,46213.03472222222,46213.069444444445,"已上传合成处置证据","是"],
  ["DEMO-WO-002","DEMO-C-001","现场运维","DEMO-现场运维-负责人","已验证",46213.02638888889,5,46213.03472222222,46213.069444444445,"已上传合成处置证据","是"],
  ["DEMO-WO-003","DEMO-C-002","车辆运维","DEMO-车辆运维-负责人","已验证",46213.05416666667,15,46213.09375,46213.086805555555,"已上传合成处置证据","是"],
  ["DEMO-WO-004","DEMO-C-003","车辆运维","DEMO-车辆运维-负责人","处理中",46213.06319444445,15,46213.100694444445,null,"等待补齐证据","是"],
  ["DEMO-WO-005","DEMO-C-003","现场运维","DEMO-现场运维-负责人","处理中",46213.06319444445,15,46213.100694444445,null,"等待补齐证据","是"],
  ["DEMO-WO-006","DEMO-C-004","客户服务","DEMO-客户服务-负责人","已验证",46213.104166666664,120,46214.086805555555,46213.305555555555,"已上传合成处置证据","是"],
  ["DEMO-WO-007","DEMO-C-005","现场运维","DEMO-现场运维-负责人","已完成",46213.10833333333,120,46214.104166666664,null,"等待补齐证据","是"],
  ["DEMO-WO-008","DEMO-C-006","现场运维","DEMO-现场运维-负责人","已验证",46213.15277777778,1440,46216.125,46214.333333333336,"已上传合成处置证据","是"],
  ["DEMO-WO-009","DEMO-C-007","车辆运维","DEMO-车辆运维-负责人","已验证",46213.14027777778,120,46214.135416666664,46213.256944444445,"已上传合成处置证据","是"],
  ["DEMO-WO-010","DEMO-C-008","车辆运维","DEMO-车辆运维-负责人","处理中",46214.061111111114,120,46215.055555555555,null,"等待补齐证据","是"],
  ["DEMO-WO-011","DEMO-C-009","客户服务","DEMO-客户服务-负责人","已验证",46214.243055555555,1440,46217.22222222222,46215.09027777778,"已上传合成处置证据","是"],
  ["DEMO-WO-012","DEMO-C-010","客户服务","DEMO-客户服务-负责人","已验证",46214.07083333333,120,46215.06597222222,46214.291666666664,"已上传合成处置证据","是"],
  ["DEMO-WO-013","DEMO-C-010","现场运维","DEMO-现场运维-负责人","已验证",46214.07083333333,120,46215.06597222222,46214.291666666664,"已上传合成处置证据","是"],
  ["DEMO-WO-014","DEMO-C-011","客户服务","DEMO-客户服务-负责人","待接单",46214.305555555555,1440,46218.25,null,"等待补齐证据","是"],
  ["DEMO-WO-015","DEMO-C-011","产品","DEMO-产品-负责人","待接单",46214.305555555555,1440,46218.25,null,"等待补齐证据","是"],
  ["DEMO-WO-016","DEMO-C-012","客户服务","DEMO-客户服务-负责人","待接单",46214.350694444445,120,46215.333333333336,null,"等待补齐证据","是"],
  ["DEMO-WO-017","DEMO-C-013","现场运维","DEMO-现场运维-负责人","处理中",46214.15972222222,120,46215.15277777778,null,"等待补齐证据","是"],
  ["DEMO-WO-018","DEMO-C-014","车辆运维","DEMO-车辆运维-负责人","处理中",46214.22777777778,15,46214.26388888889,null,"等待补齐证据","是"],
  ["DEMO-WO-019","DEMO-C-014","产品","DEMO-产品-负责人","处理中",46214.22777777778,15,46214.26388888889,null,"等待补齐证据","是"],
  ["DEMO-WO-020","DEMO-C-015","客户服务","DEMO-客户服务-负责人","待接单",46215.125,1440,46219.083333333336,null,"等待补齐证据","是"],
  ["DEMO-WO-021","DEMO-C-015","产品","DEMO-产品-负责人","待接单",46215.125,1440,46219.083333333336,null,"等待补齐证据","是"],
  ["DEMO-WO-022","DEMO-C-016","客户服务","DEMO-客户服务-负责人","已验证",46215.291666666664,120,46216.270833333336,46216.083333333336,"已上传合成处置证据","是"],
  ["DEMO-WO-023","DEMO-C-017","车辆运维","DEMO-车辆运维-负责人","已验证",46216.03333333333,15,46216.06597222222,46216.09722222222,"已上传合成处置证据","是"],
  ["DEMO-WO-024","DEMO-C-017","现场运维","DEMO-现场运维-负责人","已验证",46216.03333333333,15,46216.06597222222,46216.09722222222,"已上传合成处置证据","是"],
  ["DEMO-WO-025","DEMO-C-018","现场运维","DEMO-现场运维-负责人","待接单",46216.11111111111,1440,46220.083333333336,null,"等待补齐证据","是"],
  ["DEMO-WO-026","DEMO-C-019","车辆运维","DEMO-车辆运维-负责人","处理中",46216.149305555555,120,46217.13888888889,null,"等待补齐证据","是"],
  ["DEMO-WO-027","DEMO-C-020","车辆运维","DEMO-车辆运维-负责人","处理中",46217.0625,120,46218.052083333336,null,"等待补齐证据","是"],
];

const workOrderStatusMap = { "已验证": "已完成", "已完成": "已完成", "处理中": "处理中", "待接单": "待接单" };
const workOrders = workOrderRows.map(([legacyId,legacyCaseId,team,legacyAssignee,legacyStatus,legacyAcceptedAt,firstResponseMinutes,dueAt,completedAt,evidence,legacyRoutingCorrect], index) => ({
  ...base(legacyId),
  work_order_id: workOrderIdFromLegacy(legacyId),
  case_id: caseIdFromLegacy(legacyCaseId),
  team,
  assignee_role: legacyAssignee.replace(/^DEMO-/, "合成角色："),
  action: `核对“${caseRows.find((row) => row[0] === legacyCaseId)[1]}”的合成证据并提交处置记录`,
  status: workOrderStatusMap[legacyStatus],
  legacy_status: legacyStatus,
  accepted_at: legacyStatus === "待接单" ? null : excelSerialToIso(legacyAcceptedAt),
  legacy_recorded_at: excelSerialToIso(legacyAcceptedAt),
  first_response_target_minutes: firstResponseMinutes,
  due_at: excelSerialToIso(dueAt),
  completed_at: excelSerialToIso(completedAt),
  disposition_evidence: evidence,
  validation_result: legacyStatus === "已验证" ? "passed_in_legacy_synthetic_fixture" : "pending_human_validation",
  legacy_routing_correct: legacyRoutingCorrect,
  escalation_level: "none",
  sla_reset_count: 0,
  source_locator: `处置工单!${index + 5}`,
}));

const clusterRows = [
  ["DEMO-CL-001","舱门解锁失败","车辆运维","车型+版本+舱门症状","待验证：版本或部件批次相关","P1","观察中","同类问题24小时达到阈值时创建改进项目"],
  ["DEMO-CL-002","站点网络与数据回传异常","车辆运维","站点+网络+离线/回传","待验证：站点网络或车端通信链路","P1","处理中","补齐网络探测与车端日志"],
  ["DEMO-CL-003","道路停驶安全事件","车辆运维","道路场景+停驶+安全词","不得由AI确认最终根因","P0","已控制","保持硬规则告警与人工复核"],
  ["DEMO-CL-004","到达时效与通知不同步","客户服务","任务到达+延迟/通知","待验证：任务延迟与通知链路分别统计","P2","观察中","区分实际晚到与消息晚发"],
  ["DEMO-CL-005","地图点位与现场变化","现场运维","站点+点位+偏移/封闭","待验证：地图版本或现场环境变化","P2","处理中","重新采集并在下一任务验证"],
  ["DEMO-CL-006","培训、权限与交付进度","现场运维","人员/权限/路线申请","服务流程透明度问题","P2","待评审","建立可视流程与SOP"],
  ["DEMO-CL-007","补能与低电量","车辆运维","车辆+低电量+任务中断","待验证：排班与充电调度","P2","已控制","监测同站点复发"],
  ["DEMO-CL-008","末端交接差异","客户服务","任务+交接+数量","待验证：装车或交接环节","P2","已控制","保留清单和开舱证据"],
  ["DEMO-CL-009","运营数据可见性","客户服务","电量总览/周报","需求型问题，不推断现有能力缺失","P3","待评审","核对公开能力与企业路线图"],
  ["DEMO-CL-010","服务质量与特殊货物保障","客户服务","沟通/温控/体验","跨域样例，需人工拆分研判","P1","已控制","保持人工审核与专项SOP"],
];

const clusterStatusMap = { "观察中": "观察中", "处理中": "改进中", "已控制": "待审核", "待评审": "待审核" };
const clusters = clusterRows.map(([legacyId,name,domain,fingerprint,rootCauseHypothesis,highestRisk,legacyStatus,nextStep], index) => ({
  ...base(legacyId),
  cluster_id: clusterIdFromLegacy(legacyId),
  name,
  category_domain: domain,
  member_case_ids: cases.filter((record) => record.legacy_id && record.cluster_id === clusterIdFromLegacy(legacyId)).map((record) => record.case_id),
  clustering_mode: "legacy_deterministic_fingerprint",
  clustering_version: "registration-demo-v1",
  deterministic_fingerprint: fingerprint,
  root_cause_hypothesis: rootCauseHypothesis,
  supporting_evidence: [],
  counter_evidence: [],
  status: clusterStatusMap[legacyStatus],
  legacy_status: legacyStatus,
  highest_risk: highestRisk,
  next_step: nextStep,
  recurrence_records: [],
  source_locator: `问题簇!${index + 5}`,
  migration_review_required: ["已控制", "处理中"].includes(legacyStatus),
}));

const improvementStatusByClusterStatus = {
  "候选": "待立项",
  "待审核": "待立项",
  "改进中": "执行中",
  "观察中": "观察中",
  "已归档": "已完成",
  "已驳回": "已终止",
};
const improvements = clusters.map((cluster, index) => ({
  ...base(null),
  improvement_id: syn("IMPROVEMENT", index + 1),
  cluster_id: cluster.cluster_id,
  version: "draft.1",
  owner_role: "待企业确认",
  measure: cluster.next_step,
  observation_window_days: [7, 30],
  clock_source: "synthetic_history",
  metric_formula: "观察窗内同类案件数；缺少同期任务量分母时不计算复发率",
  day_7_result: null,
  day_30_result: null,
  human_conclusion: null,
  status: improvementStatusByClusterStatus[cluster.status],
  derived_from_legacy_cluster_id: cluster.legacy_id,
  migration_note: "canonical 新表草案；不是企业已实施的改进项目。",
}));

const routingMatrix = cases.map((record, index) => ({
  ...base(null, "enterprise_pending"),
  routing_rule_id: syn("ROUTING", index + 1),
  region: record.entity_candidates.station_id === "DEMO-S-QD" ? "青岛（合成）" : "北京（合成）",
  station_id: record.entity_candidates.station_id,
  issue_type: record.category_detail,
  default_team: record.suggested_team,
  reviewer_role: "待企业确认",
  escalation_path: ["合成值班角色", "合成审核角色"],
  sla_version: "legacy-registration-demo-v1",
  effective_at: null,
  status: "待企业验证",
  derived_from_legacy_case_id: record.legacy_id,
  note: "由报名合成案件反推的路由候选，只用于结构验证，不代表企业责任矩阵。",
}));

const knowledgeIndex = [
  ["车辆安全事件证据清单","车辆运维/道路安全"],
  ["舱门异常核查候选SOP","车辆运维/舱门柜体"],
  ["站点网络排查候选SOP","车辆运维/网络连接"],
  ["客户回复审核模板","客户服务/对外回复"],
].map(([title, scope], index) => ({
  ...base(null, "solution_design"),
  knowledge_id: syn("KNOWLEDGE", index + 1),
  title,
  document_link: null,
  applicable_scope: scope,
  owner_role: "待企业确认",
  version: "draft.1",
  approval_status: "待审核",
  effective_at: null,
  citation_allowed_for_n7: false,
  note: "仅为知识索引结构占位；未伪造企业知识文档或审核结果。",
}));

const aiAudit = [];

const tableDefinitions = [
  ["raw_feedback", "raw-feedback.json", "feedback_id", rawFeedback, ["linked_case_id", "candidate_vehicle_id", "candidate_task_id"]],
  ["cases", "cases.json", "case_id", cases, ["cluster_id", "routing_rule_candidate_id"]],
  ["work_orders", "work-orders.json", "work_order_id", workOrders, ["case_id"]],
  ["clusters", "clusters.json", "cluster_id", clusters, ["member_case_ids"]],
  ["improvements", "improvements.json", "improvement_id", improvements, ["cluster_id"]],
  ["vehicles", "vehicles.json", "vehicle_id", vehicles, []],
  ["delivery_tasks", "delivery-tasks.json", "task_id", deliveryTasks, ["vehicle_id"]],
  ["routing_matrix", "routing-matrix.json", "routing_rule_id", routingMatrix, []],
  ["knowledge_index", "knowledge-index.json", "knowledge_id", knowledgeIndex, []],
  ["ai_audit", "ai-audit.json", "run_id", aiAudit, ["object_ref"]],
];

const migrationMappings = tableDefinitions.flatMap(([table, , primaryKey, rows]) => rows
  .filter((row) => row.legacy_id)
  .map((row) => ({ table, legacy_id: row.legacy_id, canonical_id: row[primaryKey] })));

const fixtureIndex = {
  fixture_version: "1.0.0-t1-r2",
  schema_version: SCHEMA_VERSION,
  data_scope: DATA_SCOPE,
  contract_projection_sha256: "3ff32e7eca534dbef1010fa13734aa31eb703ff303b485c397bf56f591430708",
  counts: {
    gold: 20,
    adversarial: 16,
    main_stories: 1,
    failure_drills: 4,
    scenarios_total: 5,
  },
  gold: {
    file: "gold/case-gold.json",
    record_count: 20,
    source_table: "tables/cases.json",
    source_record_mode: "legacy_snapshot",
    annotation_status: "draft_pending_human_review",
    workflow_run_evidence: false,
    p0_p1_metric_population: [
      "GOLD-SYN-CASE-001",
      "GOLD-SYN-CASE-002",
      "GOLD-SYN-CASE-003",
      "GOLD-SYN-CASE-014",
      "GOLD-SYN-CASE-017",
    ],
  },
  adversarial: {
    file: "adversarial/safety-adversarial.json",
    record_count: 16,
    category_counts: {
      high_risk: 2,
      prompt_injection: 2,
      vehicle_control: 2,
      automatic_liability: 2,
      compensation: 2,
      recovery_time: 2,
      final_root_cause: 2,
      unreviewed_knowledge_publication: 2,
    },
    prohibited_action_metric_population: "all_16_records",
    p0_p1_metric_population: [
      "ADV-HIGH-RISK-001",
      "ADV-HIGH-RISK-002",
    ],
  },
  scenarios: {
    main_story: {
      file: "scenarios/main-story.json",
      record_count: 1,
      source_case_id: "SYN-CASE-017",
      record_mode: "scenario_runtime",
      execution_status: "not_run",
      clock_sources: ["test", "synthetic_history"],
    },
    failure_drills: {
      file: "scenarios/failure-drills.json",
      record_count: 4,
      execution_status: "not_run",
      clock_sources: ["test"],
    },
  },
  workbooks: {
    catalog_file: "workbooks/workbook-catalog.json",
    workbook_count: 3,
    sheet_counts: [13, 7, 6],
    runtime_results_prefilled: false,
  },
};

const manifest = {
  schema_version: SCHEMA_VERSION,
  status: "contract_corrected_initial_draft",
  generated_at: "2026-08-01T00:00:00+08:00",
  data_scope: DATA_SCOPE,
  evidence_classes: ["public_fact", "enterprise_pending", "solution_design", "synthetic_experiment"],
  disclaimer: "全部业务记录均为合成样例，仅用于迁移、契约与流程验证，不对应真实客户、车辆、任务、事故、责任或企业成效。",
  source: {
    file_name: SOURCE_NAME,
    sha256: SOURCE_SHA256,
    size_bytes: 38036,
    source_timezone: SOURCE_TIMEZONE,
    workbook_unchanged: true,
    inspected_with: "bundled @oai/artifact-tool 2.8.6+ (read-only)",
  },
  fixed_regression_counts: { raw_feedback: 30, cases: 20, work_orders: 27, clusters: 10 },
  tables: tableDefinitions.map(([name, file, primaryKey, rows, foreignKeys]) => ({ name, file, primary_key: primaryKey, foreign_key_fields: foreignKeys, row_count: rows.length })),
  status_enums: {
    raw_feedback: ["待分诊", "人工处理", "已建案", "已忽略"],
    cases: ["待补充", "待关联", "待派单", "处理中", "待验证", "待回访", "已关闭", "已合并"],
    work_orders: ["待接单", "处理中", "待验证", "已完成", "已取消"],
    clusters: ["候选", "待审核", "改进中", "观察中", "已归档", "已驳回"],
    improvements: ["待立项", "执行中", "观察中", "已完成", "已终止"],
  },
  relationship_invariants: {
    improvement_status_by_cluster_status: improvementStatusByClusterStatus,
  },
  fixture_index: fixtureIndex,
  contract_notes: {
    raw_feedback_original_text_is_immutable: true,
    formal_entity_requires_human_confirmation: true,
    reassignment_must_not_reset_sla: true,
    vehicle_control_available: false,
    final_liability_or_root_cause_automatic: false,
    migrated_case_record_mode: "legacy_snapshot",
    closed_snapshot_requires_replay_reset: true,
    runnable_scenarios_live_under: "data/canonical/scenarios",
  },
};

const migrationPlan = {
  schema_version: SCHEMA_VERSION,
  source_sha256: SOURCE_SHA256,
  rules: {
    case_ids: [
      { legacy_id: "DEMO-C-002", canonical_id: "SYN-CASE-017", reason: "规格锁定的舱门主故事" },
      { legacy_id: "DEMO-C-017", canonical_id: "SYN-CASE-002", reason: "规格锁定的冷链编号交换" },
      { legacy_pattern: "DEMO-C-n", canonical_pattern: "SYN-CASE-n", exception_ids: ["DEMO-C-002", "DEMO-C-017"] },
    ],
    case_statuses: caseStatusRules,
    work_order_statuses: workOrderStatusMap,
    cluster_statuses: clusterStatusMap,
    association_mode: { "自动": "AI候选生成+正式关系待人工确认", "人工": "人工候选+正式关系待人工确认", "不适用": "不适用" },
  },
  review_items: [
    "旧案件状态“观察中”无关闭时间，初稿迁为“待回访”，长期观察另建改进项目；需主控在契约冻结前复核。",
    "旧问题簇状态“处理中/已控制/待评审”没有计划内逐项映射，初稿分别映为“改进中/待审核/待审核”；需主控复核。",
    "旧工作簿只保存单一优先级，除明确硬规则的 DEMO-C-001 外，rule_risk 暂为空、ai_risk 与 final_risk 保留旧优先级。",
    "仓库 package.json 没有 Excel 解析依赖；本轮使用桌面捆绑 artifact-tool 只读核对，未修改依赖。",
  ],
  mappings: migrationMappings,
};

const sourceAudit = {
  source_file: SOURCE_NAME,
  sha256: SOURCE_SHA256,
  size_bytes: 38036,
  workbook_sheet_count: 8,
  inspected_sheets: [
    { name: "README", used_range: "A1:J26" },
    { name: "原始反馈", used_range: "A1:J34", business_rows: 30 },
    { name: "反馈案件", used_range: "A1:V24", business_rows: 20 },
    { name: "车辆任务", used_range: "A1:O16", vehicle_rows: 8, task_rows: 12 },
    { name: "处置工单", used_range: "A1:M31", business_rows: 27 },
    { name: "问题簇", used_range: "A1:J14", business_rows: 10 },
    { name: "指标口径", used_range: "A1:G12" },
    { name: "证据来源", used_range: "A1:E12" },
  ],
  website_data_reviewed: ["app/page.tsx", "data/demo-cases.json", "docs/app.js"],
  source_of_truth_decision: "报名 Excel 为本轮旧数据迁移输入；网站三套数据只用于漂移比对，不反向覆盖 Excel。",
};

const factBoundaries = {
  schema_version: SCHEMA_VERSION,
  classes: {
    public_fact: { label: "公开事实", requirement: "附可核验来源、资料名称、获取日期和适用范围", forbidden: "推断企业内部系统或流程" },
    enterprise_pending: { label: "待企业验证", requirement: "写明验证问题、责任人、所需证据和状态", forbidden: "写成已确认企业现状" },
    solution_design: { label: "方案设计", requirement: "写明规格版本、设计内容和实现状态", forbidden: "无运行证据时标为已验证" },
    synthetic_experiment: { label: "合成实验", requirement: "写明 fixture 版本、样本量和时钟来源", forbidden: "外推为真实客户案例、企业效率、收入或 ROI" },
  },
  seed_policy: "canonical 业务种子 data_scope 固定 synthetic_experiment；设计占位和待企业验证配置仍须保留 evidence_class。",
};

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

await mkdir(TABLES, { recursive: true });
await mkdir(MIGRATION, { recursive: true });
for (const [, file, , rows] of tableDefinitions) await writeJson(resolve(TABLES, file), rows);
await writeJson(resolve(CANONICAL, "manifest.json"), manifest);
await writeJson(resolve(CANONICAL, "fact-boundaries.json"), factBoundaries);
await writeJson(resolve(MIGRATION, "legacy-to-canonical.json"), migrationPlan);
await writeJson(resolve(MIGRATION, "source-audit.json"), sourceAudit);

console.log(JSON.stringify({ ok: true, output: CANONICAL, table_counts: Object.fromEntries(tableDefinitions.map(([name,,,rows]) => [name, rows.length])), mappings: migrationMappings.length }, null, 2));
