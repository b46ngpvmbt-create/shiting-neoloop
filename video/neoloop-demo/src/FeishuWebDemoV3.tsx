import type {Caption} from "@remotion/captions";
import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import captionData from "../public/v3-captions.json";

const fps = 30;
export const v3DurationInFrames = 173 * fps + 2;
const captions = captionData as Caption[];

type Shot = {
  startMs: number;
  endMs: number;
  image: string;
  source: "motion" | "feishu" | "web";
  eyebrow: string;
  title: string;
  note: string;
  fit?: "cover" | "contain";
};

const shots: Shot[] = [
  {startMs: 0, endMs: 15336, image: "captures/feishu/still-overview.png", source: "motion", eyebrow: "石听未来 · NEOLOOP", title: "让每条反馈进入两个闭环", note: "个案闭环解决一次反馈 · 改进闭环减少同类复发", fit: "cover"},
  {startMs: 15336, endMs: 34536, image: "captures/feishu/still-overview.png", source: "feishu", eyebrow: "真实飞书环境 · 合成数据", title: "统一 Base 承载当前落地结构", note: "10 张表 · 240 字段 · 5 个业务视图 · 6 条工作流启用配置", fit: "cover"},
  {startMs: 34536, endMs: 53520, image: "captures/feishu/still-intake.png", source: "feishu", eyebrow: "02 接入与案件", title: "来源接入与案件形成", note: "未配置渠道只保留接入契约，不宣称已接通", fit: "cover"},
  {startMs: 53520, endMs: 77520, image: "captures/feishu/exact-sla.jpg", source: "feishu", eyebrow: "03 处置与 SLA", title: "人工确认后进入工单与原时钟", note: "硬规则先于 AI · 改派、重试和升级不重置起点", fit: "cover"},
  {startMs: 77520, endMs: 96888, image: "captures/feishu/exact-improvement.jpg", source: "feishu", eyebrow: "04 问题与改进", title: "问题簇、改进项目与观察窗", note: "根因是假设 · 7/30 天观察 · 归档或复发重开", fit: "cover"},
  {startMs: 96888, endMs: 104200, image: "captures/web/stills/step-3.png", source: "web", eyebrow: "Web 本地沙盘", title: "飞书承载数据，Web 展示治理细节", note: "页面内存状态 · 不保存 · 不触发飞书", fit: "contain"},
  {startMs: 104200, endMs: 107500, image: "captures/web/stills/review-form.png", source: "web", eyebrow: "人工关口", title: "填写退回补证原因", note: "记录返回节点与下一责任角色", fit: "contain"},
  {startMs: 107500, endMs: 110600, image: "captures/web/stills/returned.png", source: "web", eyebrow: "人工关口", title: "实体候选已退回", note: "原因与补证责任可追溯", fit: "contain"},
  {startMs: 110600, endMs: 113300, image: "captures/web/stills/resubmitted.png", source: "web", eyebrow: "补证批次 R1", title: "补充证据后重新提交", note: "再次进入实体审核", fit: "contain"},
  {startMs: 113300, endMs: 115900, image: "captures/web/stills/approved.png", source: "web", eyebrow: "两个独立关口", title: "实体与责任分别确认", note: "模型置信度不能替代授权人员", fit: "contain"},
  {startMs: 115900, endMs: 119300, image: "captures/web/stills/complete.png", source: "web", eyebrow: "个案闭环", title: "建单、回访并关闭个案", note: "本地退回 1 次 · 全程不外联", fit: "contain"},
  {startMs: 119300, endMs: 121300, image: "captures/web/stills/cluster.png", source: "web", eyebrow: "改进闭环", title: "形成问题簇候选", note: "SYN-CASE-017 → SYN-CLUSTER-001", fit: "contain"},
  {startMs: 121300, endMs: 127296, image: "captures/web/stills/improvement.png", source: "web", eyebrow: "人工立项", title: "进入改进项目与观察", note: "SYN-IMPROVEMENT-001", fit: "contain"},
  {startMs: 127296, endMs: 137000, image: "appendix-page-03.png", source: "motion", eyebrow: "05 AI 与审计", title: "输入、候选、证据与人工决定", note: "录屏未覆盖清晰审计页，此处使用已验收视觉附录", fit: "contain"},
  {startMs: 137000, endMs: 147576, image: "dual-loop.png", source: "motion", eyebrow: "边界与失败关闭", title: "不足即停，高影响决定转人工", note: "不自动判责、赔偿或确认最终技术根因", fit: "contain"},
  {startMs: 147576, endMs: 165500, image: "captures/web/stills/complete.png", source: "motion", eyebrow: "三层证据", title: "Web 体验 · 飞书落地 · 离线验证", note: "三层分别验收，不能互相替代", fit: "contain"},
  {startMs: 165500, endMs: 173200, image: "captures/feishu/still-overview.png", source: "motion", eyebrow: "石听 NeoLoop", title: "一辆车 · 一个任务 · 一个责任人 · 一次改进", note: "SYN-CASE-017 → SYN-CLUSTER-001 → SYN-IMPROVEMENT-001", fit: "cover"},
];

const sourceLabel = (source: Shot["source"]) => {
  if (source === "feishu") return "真实飞书环境 / 合成数据";
  if (source === "web") return "Web 本地沙盘 / 不连接外部系统";
  return "合成演示 / 证据边界已标注";
};

const CaptionLayer = ({strongOutline = false}: {strongOutline?: boolean}) => {
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;
  const caption = captions.find((item) => timeMs >= item.startMs && timeMs < item.endMs);
  if (!caption) return null;
  const local = timeMs - caption.startMs;
  const remaining = caption.endMs - timeMs;
  const opacity = Math.min(1, local / 110, remaining / 110);
  return (
    <div style={{position: "absolute", left: 110, right: 110, bottom: 42, display: "flex", justifyContent: "center", pointerEvents: "none", opacity}}>
      <div style={{maxWidth: 1540, textAlign: "center", color: "#fff", fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif', fontWeight: strongOutline ? 780 : 760, fontSize: 42, lineHeight: 1.28, letterSpacing: 0.2, WebkitTextStroke: strongOutline ? "6px rgba(0,0,0,.98)" : "4px rgba(0,0,0,.94)", paintOrder: "stroke fill", textShadow: strongOutline ? "0 2px 2px #000, 0 5px 14px rgba(0,0,0,.92)" : "0 3px 9px rgba(0,0,0,.78)"}}>
        {caption.text}
      </div>
    </div>
  );
};

const ShotLayer = ({shot, unobstructed = false}: {shot: Shot; unobstructed?: boolean}) => {
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;
  const localMs = timeMs - shot.startMs;
  const scale = interpolate(localMs, [0, Math.max(1, shot.endMs - shot.startMs)], [1.01, 1.035], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.2, 0.8, 0.2, 1)});
  const isIntro = shot.source === "motion";
  return (
    <AbsoluteFill style={{background: "#101a14", overflow: "hidden"}}>
      <Img src={staticFile(shot.image)} style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: shot.fit ?? "cover", scale, filter: unobstructed ? "none" : isIntro ? "brightness(.58) saturate(.78)" : "brightness(.88) saturate(.92)"}} />
      {!unobstructed && <AbsoluteFill style={{background: isIntro ? "linear-gradient(90deg, rgba(4,18,12,.91) 0%, rgba(4,18,12,.56) 50%, rgba(4,18,12,.2) 100%)" : "linear-gradient(180deg, rgba(5,16,11,.1) 0%, rgba(5,16,11,0) 58%, rgba(5,16,11,.72) 100%)"}} />}
      <div style={{position: "absolute", left: 54, top: 40, display: "flex", alignItems: "center", gap: 14, fontFamily: 'Inter, "PingFang SC", sans-serif'}}>
        <span style={{padding: unobstructed ? "7px 12px" : "9px 14px", borderRadius: 999, background: shot.source === "feishu" ? "rgba(8,59,45,.9)" : shot.source === "web" ? "rgba(185,115,29,.9)" : "rgba(21,37,26,.9)", color: "white", fontSize: unobstructed ? 17 : 19, fontWeight: 820, boxShadow: unobstructed ? "0 2px 10px rgba(0,0,0,.2)" : "none"}}>{sourceLabel(shot.source)}</span>
      </div>
      {!unobstructed && <div style={{position: "absolute", left: isIntro ? 92 : 56, right: 56, bottom: 142, color: "white", fontFamily: 'Inter, "PingFang SC", sans-serif', textShadow: "0 2px 18px rgba(0,0,0,.72)"}}>
        <div style={{fontSize: 20, letterSpacing: 3, fontWeight: 760, color: "#d4ff54"}}>{shot.eyebrow}</div>
        <div style={{marginTop: 12, maxWidth: isIntro ? 1350 : 1200, fontSize: isIntro ? 58 : 39, fontWeight: 860, lineHeight: 1.1}}>{shot.title}</div>
        <div style={{marginTop: 12, fontSize: 23, fontWeight: 650, color: "#e6ede8"}}>{shot.note}</div>
      </div>}
    </AbsoluteFill>
  );
};

export const FeishuWebDemoV3 = () => {
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;
  const shot = shots.find((item) => timeMs >= item.startMs && timeMs < item.endMs) ?? shots[shots.length - 1];
  return (
    <AbsoluteFill style={{background: "#101a14"}}>
      <ShotLayer shot={shot} />
      <Audio src={staticFile("audio-v3/neoloop-v3-narration.mp3")} volume={1} />
      <CaptionLayer />
    </AbsoluteFill>
  );
};

export const FeishuWebDemoV4 = () => {
  const frame = useCurrentFrame();
  const timeMs = (frame / fps) * 1000;
  const shot = shots.find((item) => timeMs >= item.startMs && timeMs < item.endMs) ?? shots[shots.length - 1];
  return (
    <AbsoluteFill style={{background: "#101a14"}}>
      <ShotLayer shot={shot} unobstructed />
      <Audio src={staticFile("audio-v3/neoloop-v3-narration.mp3")} volume={1} />
      <CaptionLayer strongOutline />
    </AbsoluteFill>
  );
};
