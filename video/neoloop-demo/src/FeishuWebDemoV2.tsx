import {Video} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {VoiceSyncedDemo, timeline} from "./VoiceSyncedDemo";

type Insert = {
  from: number;
  duration: number;
  source: "feishu" | "web";
  trimBefore: number;
  title: string;
  note: string;
};

const fps = timeline.fps;
const feishuSource = "captures/feishu/processed/feishu-workbench-scaled.mp4";
const webSource = "captures/web/web-dual-loop-scaled.mp4";
const webFallbacks = [
  "captures/web/stills/step-0.png",
  "captures/web/stills/step-1.png",
  "captures/web/stills/step-2.png",
  "captures/web/stills/step-3.png",
  "captures/web/stills/review-form.png",
  "captures/web/stills/returned.png",
  "captures/web/stills/resubmitted.png",
  "captures/web/stills/approved.png",
  "captures/web/stills/cluster.png",
  "captures/web/stills/improvement.png",
  "captures/web/stills/complete.png",
];

const inserts: Insert[] = [
  {from: 587, duration: 714, source: "feishu", trimBefore: 0 * fps, title: "飞书工作台总览与来源接入", note: "Base 已连接 · 6 条工作流启用 · 合成数据"},
  {from: 1301, duration: 635, source: "feishu", trimBefore: 14 * fps, title: "收件箱、来源与案件关联", note: "只读查看 · 未配置渠道不宣称已接入"},
  {from: 1936, duration: 652, source: "web", trimBefore: 17 * fps, title: "人工关口：退回补证", note: "本地沙盘 · 不保存 · 不触发飞书"},
  {from: 2588, duration: 604, source: "feishu", trimBefore: 27 * fps, title: "处置队列与原 SLA 时钟", note: "改派、重试和升级不重置起点"},
  {from: 3192, duration: 587, source: "web", trimBefore: 35 * fps, title: "补证重提并再次确认", note: "页面内存状态 · 外部请求 0"},
  {from: 3779, duration: 683, source: "feishu", trimBefore: 60 * fps, title: "问题簇与改进项目", note: "候选关系可追溯 · 最终根因需人工确认"},
  {from: 4462, duration: 635, source: "feishu", trimBefore: 62 * fps, title: "改进观察与人工关口", note: "7/30 天设计时钟 · 不自动下结论"},
  {from: 5097, duration: 639, source: "web", trimBefore: 54 * fps, title: "从问题簇进入改进闭环", note: "SYN-CLUSTER-001 → SYN-IMPROVEMENT-001"},
  {from: 5736, duration: 613, source: "feishu", trimBefore: 66 * fps, title: "AI 审计与主数据边界", note: "候选可看 · 验证可追 · 禁止车辆控制"},
];

const RecordedStage = ({insert}: {insert: Insert}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const exit = interpolate(frame, [insert.duration - 12, insert.duration - 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const isFeishu = insert.source === "feishu";

  return (
    <AbsoluteFill style={{background: "#111813", opacity: Math.min(enter, exit)}}>
      <AbsoluteFill style={{bottom: 116, overflow: "hidden"}}>
        {isFeishu ? (
          <Video
            src={staticFile(feishuSource)}
            trimBefore={insert.trimBefore}
            muted
            volume={0}
            style={{position: "absolute", width: 1920, height: 1250, left: 0, top: -45, objectFit: "fill"}}
          />
        ) : (
          <Img
            src={staticFile(webFallbacks[Math.min(webFallbacks.length - 1, Math.floor(frame / 58))])}
            style={{position: "absolute", width: 1728, height: 1080, left: 96, top: -8, objectFit: "fill"}}
          />
        )}
        <div style={{position: "absolute", inset: 0, boxShadow: "inset 0 -110px 95px -85px rgba(10,18,13,.84)"}} />
        <div style={{position: "absolute", left: 38, top: 30, display: "flex", gap: 12, alignItems: "center", fontFamily: 'Inter, "PingFang SC", sans-serif'}}>
          <span style={{padding: "9px 14px", borderRadius: 999, background: isFeishu ? "#073d2c" : "#c47f20", color: "white", fontSize: 20, fontWeight: 800}}>
            {isFeishu ? "真实飞书环境" : "Web 本地沙盘"}
          </span>
          <span style={{padding: "9px 14px", borderRadius: 999, background: "rgba(255,255,255,.94)", color: "#172018", fontSize: 19, fontWeight: 760}}>
            {isFeishu ? "合成数据" : "不连接外部系统"}
          </span>
        </div>
        <div style={{position: "absolute", left: 50, right: 50, bottom: 30, display: "flex", justifyContent: "space-between", alignItems: "end", gap: 40, fontFamily: 'Inter, "PingFang SC", sans-serif', color: "white", textShadow: "0 2px 16px rgba(0,0,0,.55)"}}>
          <div style={{fontSize: 36, fontWeight: 850}}>{insert.title}</div>
          <div style={{fontSize: 22, fontWeight: 700, color: "#e8efe9"}}>{insert.note}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const FeishuWebDemoV2 = () => (
  <AbsoluteFill>
    <VoiceSyncedDemo />
    {inserts.map((insert) => (
      <Sequence key={`${insert.source}-${insert.from}`} from={insert.from} durationInFrames={insert.duration} name={insert.title}>
        <RecordedStage insert={insert} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
