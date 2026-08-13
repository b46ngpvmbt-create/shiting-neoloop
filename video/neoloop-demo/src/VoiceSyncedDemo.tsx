import type { ReactNode } from "react";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import timelineData from "../public/timeline.json";

type Caption = { text: string; startFrame: number; endFrame: number };
type Scene = {
  id: number;
  title: string;
  kicker: string;
  accent: string;
  points: string[];
  audio: string;
  audioOffsetFrames: number;
  startFrame: number;
  durationFrames: number;
  cueFrames: number[];
  captions: Caption[];
};
type Timeline = {
  fps: number;
  totalFrames: number;
  scenes: Scene[];
};

export const timeline = timelineData as Timeline;

const colors = {
  paper: "#f2eee4",
  surface: "#fbfaf6",
  ink: "#172018",
  muted: "#5c655d",
  green: "#176147",
  lime: "#d4ff54",
  blue: "#4f76d9",
  violet: "#8662c8",
  amber: "#d38d22",
  rose: "#c85353",
  teal: "#2d8a7e",
  rule: "#b9b4a9",
};

const sans = 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
const serif = '"Songti SC", STSong, "Noto Serif CJK SC", serif';
const mono = '"SFMono-Regular", Consolas, monospace';
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const accentMap: Record<string, string> = {
  green: colors.green,
  cyan: colors.blue,
  purple: colors.violet,
  amber: colors.amber,
  red: colors.rose,
};

const evidenceTags = [
  "方案设计",
  "方案设计 · 合成接入",
  "方案设计 · 本地合同",
  "方案设计 · 人工关口",
  "方案设计 · 待企业验证",
  "方案设计 · 人工关口",
  "方案设计 · 合成快照",
  "方案设计 · 人工关口",
  "方案设计 · 合成观察",
  "方案设计 · 故障边界",
  "合成假设",
  "本地交付证据",
  "三层证据",
];

const cueAt = (scene: Scene, index: number) =>
  scene.cueFrames[index] ?? scene.audioOffsetFrames + index * 16;

const cueProgress = (frame: number, cue: number, duration = 12) =>
  interpolate(frame, [cue, cue + duration], [0, 1], {
    ...clamp,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const Reveal = ({ cue, children, width = "auto" }: { cue: number; children: ReactNode; width?: number | string }) => {
  const frame = useCurrentFrame();
  const progress = cueProgress(frame, cue);
  return (
    <div
      style={{
        width,
        opacity: progress,
        translate: `0 ${interpolate(progress, [0, 1], [16, 0])}px`,
        scale: interpolate(progress, [0, 0.7, 1], [0.96, 1.015, 1]),
      }}
    >
      {children}
    </div>
  );
};

const Node = ({ index, title, meta, accent }: { index: string; title: string; meta?: string; accent: string }) => (
  <div style={{ minHeight: 126, borderTop: `5px solid ${accent}`, borderBottom: `1px solid ${colors.rule}`, padding: "19px 17px 16px", background: "rgba(251,250,246,.86)" }}>
    <div style={{ color: accent, fontFamily: mono, fontSize: 18, fontWeight: 800 }}>{index}</div>
    <div style={{ marginTop: 9, fontSize: 27, fontWeight: 800 }}>{title}</div>
    {meta ? <div style={{ marginTop: 6, color: colors.muted, fontSize: 18 }}>{meta}</div> : null}
  </div>
);

const Connector = ({ cue, accent }: { cue: number; accent: string }) => {
  const frame = useCurrentFrame();
  const progress = cueProgress(frame, cue, 10);
  return (
    <div style={{ width: 48, display: "flex", alignItems: "center", opacity: progress }}>
      <div style={{ height: 3, width: 35, background: accent, scale: `${progress} 1`, transformOrigin: "left" }} />
      <div style={{ width: 0, height: 0, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: `11px solid ${accent}` }} />
    </div>
  );
};

const Flow = ({ scene, labels, metas, accents }: { scene: Scene; labels: string[]; metas?: string[]; accents?: string[] }) => (
  <div style={{ width: "100%", display: "flex", alignItems: "center" }}>
    {labels.map((label, index) => {
      const accent = accents?.[index] ?? accentMap[scene.accent] ?? colors.green;
      return (
        <div key={label} style={{ display: "contents" }}>
          {index > 0 ? <Connector cue={cueAt(scene, index) - 5} accent={accent} /> : null}
          <Reveal cue={cueAt(scene, index)} width="100%">
            <Node index={`${index + 1}`.padStart(2, "0")} title={label} meta={metas?.[index]} accent={accent} />
          </Reveal>
        </div>
      );
    })}
  </div>
);

const StoryChain = ({ scene }: { scene: Scene }) => (
  <div style={{ width: "100%", padding: 34, borderTop: `5px solid ${colors.green}`, borderBottom: `1px solid ${colors.ink}`, background: colors.surface }}>
    <Reveal cue={cueAt(scene, 0)}><div style={{ color: colors.green, letterSpacing: 3, fontSize: 18 }}>石听未来 · 固定合成故事链</div></Reveal>
    <div style={{ marginTop: 38, display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "center", gap: 18, fontFamily: mono, fontSize: 27, fontWeight: 800 }}>
      <Reveal cue={cueAt(scene, 1)}><span>SYN-CASE-017</span></Reveal>
      <Connector cue={cueAt(scene, 2) - 6} accent={colors.green} />
      <Reveal cue={cueAt(scene, 2)}><span>SYN-CLUSTER-001</span></Reveal>
      <Connector cue={cueAt(scene, 2) + 6} accent={colors.violet} />
      <Reveal cue={cueAt(scene, 2) + 10}><span>SYN-IMPROVEMENT-001</span></Reveal>
    </div>
    <Reveal cue={cueAt(scene, 3)}><div style={{ marginTop: 34, paddingTop: 16, borderTop: `1px solid ${colors.rule}`, color: colors.rose, fontSize: 21, fontWeight: 760 }}>边界：不执行车辆控制</div></Reveal>
  </div>
);

const ChannelStage = ({ scene }: { scene: Scene }) => {
  const channels = ["App 评价", "客服记录", "热线转写", "服务邮件", "飞书", "授权公开平台"];
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: `1px solid ${colors.rule}`, borderLeft: `1px solid ${colors.rule}` }}>
        {channels.map((channel, index) => (
          <Reveal key={channel} cue={cueAt(scene, 0) + index * 3}>
            <div style={{ minHeight: 88, display: "flex", alignItems: "center", padding: "0 18px", borderRight: `1px solid ${colors.rule}`, borderBottom: `1px solid ${colors.rule}`, background: index === 4 ? colors.ink : colors.surface, color: index === 4 ? colors.lime : colors.ink, fontSize: 22, fontWeight: 780 }}>{channel}</div>
          </Reveal>
        ))}
      </div>
      <Reveal cue={cueAt(scene, 1)}><div style={{ marginTop: 20, padding: 21, background: colors.ink, color: colors.surface, fontSize: 22 }}>官方接口 / Webhook / 事件流 → 授权范围与接收时间</div></Reveal>
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Reveal cue={cueAt(scene, 2)}><Node index="01" title="原文不可变" meta="AI 不能覆盖" accent={colors.teal} /></Reveal>
        <Reveal cue={cueAt(scene, 3)}><Node index="02" title="幂等去重" meta="同键回放 · 异键保留" accent={colors.blue} /></Reveal>
      </div>
    </div>
  );
};

const CompareStage = ({ scene, labels, metas, accents }: { scene: Scene; labels: string[]; metas: string[]; accents: string[] }) => (
  <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
    {labels.map((label, index) => (
      <Reveal key={label} cue={cueAt(scene, index)}>
        <Node index={`${index + 1}`.padStart(2, "0")} title={label} meta={metas[index]} accent={accents[index]} />
      </Reveal>
    ))}
  </div>
);

const TimelineStage = ({ scene, labels, metas }: { scene: Scene; labels: string[]; metas: string[] }) => {
  const frame = useCurrentFrame();
  const finalCue = cueAt(scene, labels.length - 1);
  const line = cueProgress(frame, cueAt(scene, 0), Math.max(24, finalCue - cueAt(scene, 0) + 8));
  return (
    <div style={{ width: "100%", position: "relative", paddingTop: 42 }}>
      <div style={{ position: "absolute", left: 34, right: 34, top: 60, height: 5, background: "#d0cbc0" }}>
        <div style={{ height: "100%", width: `${line * 100}%`, background: `linear-gradient(90deg, ${colors.blue}, ${colors.amber}, ${colors.rose})` }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${labels.length}, 1fr)`, gap: 20 }}>
        {labels.map((label, index) => (
          <Reveal key={label} cue={cueAt(scene, index)}>
            <div style={{ textAlign: "center" }}>
              <div style={{ margin: "0 auto", width: 28, height: 28, borderRadius: "50%", background: index === labels.length - 1 ? colors.rose : colors.green, border: `7px solid ${colors.paper}`, boxSizing: "content-box" }} />
              <div style={{ marginTop: 30, fontFamily: mono, color: colors.green, fontSize: 18 }}>{`${index + 1}`.padStart(2, "0")}</div>
              <div style={{ marginTop: 8, fontSize: 25, fontWeight: 800 }}>{label}</div>
              <div style={{ marginTop: 7, color: colors.muted, fontSize: 18 }}>{metas[index]}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
};

const ClusterStage = ({ scene }: { scene: Scene }) => (
  <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 0.72fr 1fr", gap: 24, alignItems: "center" }}>
    <div style={{ display: "grid", gap: 12 }}>
      {["SYN-CASE-017", "SYN-CASE-023", "SYN-CASE-031"].map((item, index) => (
        <Reveal key={item} cue={cueAt(scene, Math.min(index, 1)) + index * 4}><Node index={`C${index + 1}`} title={item} meta="独立事件记录" accent={colors.blue} /></Reveal>
      ))}
    </div>
    <div style={{ textAlign: "center" }}><Connector cue={cueAt(scene, 2) - 6} accent={colors.violet} /></div>
    <Reveal cue={cueAt(scene, 2)}><div style={{ padding: 36, borderTop: `6px solid ${colors.violet}`, borderBottom: `1px solid ${colors.ink}`, background: colors.surface }}><div style={{ color: colors.violet, fontFamily: mono, fontSize: 20 }}>问题簇</div><div style={{ marginTop: 12, fontSize: 30, fontWeight: 850 }}>SYN-CLUSTER-001</div><Reveal cue={cueAt(scene, 3)}><div style={{ marginTop: 25, color: colors.green, fontSize: 21 }}>保留每一次独立处置 ↺</div></Reveal></div></Reveal>
  </div>
);

const EvidenceStage = ({ scene }: { scene: Scene }) => {
  const roles = [
    ["AI 候选", "N1–N7", colors.violet],
    ["确定性流程", "W1–W6", colors.blue],
    ["硬规则", "P0 / P1", colors.rose],
    ["人工关口", "H1", colors.amber],
    ["证据状态", "可追溯", colors.teal],
  ] as const;
  return (
    <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 15 }}>
      {roles.map(([label, meta, accent], index) => (
        <Reveal key={label} cue={cueAt(scene, index)}><Node index={`${index + 1}`} title={label} meta={meta} accent={accent} /></Reveal>
      ))}
    </div>
  );
};

const FormulaStage = ({ scene }: { scene: Scene }) => {
  const frame = useCurrentFrame();
  const resultProgress = cueProgress(frame, cueAt(scene, 3), 24);
  const result = (83.3 * resultProgress).toFixed(1);
  return (
    <div style={{ width: "100%", padding: 46, background: colors.ink, color: colors.surface }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
        {["1000 条 / 月", "8 分钟", "3 分钟"].map((label, index) => (
          <Reveal key={label} cue={cueAt(scene, index)}><div style={{ padding: 18, borderTop: `3px solid ${index === 0 ? colors.lime : colors.blue}`, fontSize: 24, fontWeight: 780 }}>{label}</div></Reveal>
        ))}
      </div>
      <Reveal cue={cueAt(scene, 3)}><div style={{ marginTop: 34, color: colors.lime, fontSize: 92, fontWeight: 880 }}>{result}<span style={{ marginLeft: 18, color: "#d8ddd8", fontSize: 29 }}>小时 / 月</span></div></Reveal>
      <div style={{ marginTop: 22, fontFamily: mono, color: "#c7cec8", fontSize: 22 }}>1000 × max(8 − 3, 0) ÷ 60</div>
    </div>
  );
};

const DocumentsStage = ({ scene }: { scene: Scene }) => (
  <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
    {["10 页视觉附录", "3 份 Excel", "10 表 240 字段", "视频与 SHA-256"].map((label, index) => (
      <Reveal key={label} cue={cueAt(scene, index)}><div style={{ minHeight: 136, padding: 24, borderTop: `5px solid ${index % 2 ? colors.blue : colors.green}`, borderBottom: `1px solid ${colors.rule}`, background: colors.surface }}><div style={{ fontFamily: mono, color: colors.muted }}>{`0${index + 1}`}</div><div style={{ marginTop: 14, fontSize: 29, fontWeight: 820 }}>{label}</div></div></Reveal>
    ))}
  </div>
);

const SummaryStage = ({ scene }: { scene: Scene }) => (
  <div style={{ width: "100%" }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
      {["Web 体验", "飞书现场", "离线验证"].map((label, index) => (
        <Reveal key={label} cue={cueAt(scene, index)}><Node index={`0${index + 1}`} title={label} meta={index === 1 ? "总控冻结与验收" : "独立证据层"} accent={[colors.green, colors.amber, colors.blue][index]} /></Reveal>
      ))}
    </div>
    <Reveal cue={cueAt(scene, 3)}><div style={{ marginTop: 26, padding: 25, background: colors.surface, borderTop: `4px solid ${colors.green}`, borderBottom: `1px solid ${colors.ink}`, fontFamily: mono, fontSize: 23, fontWeight: 800 }}>SYN-CASE-017 → SYN-CLUSTER-001 → SYN-IMPROVEMENT-001</div></Reveal>
  </div>
);

const Visual = ({ scene }: { scene: Scene }) => {
  if (scene.id === 1) return <StoryChain scene={scene} />;
  if (scene.id === 2) return <ChannelStage scene={scene} />;
  if (scene.id === 3) return <Flow scene={scene} labels={["W1 留存", "硬规则", "N1—N3", "只可上调"]} metas={["原文与幂等键", "P0/P1 优先", "事实·分类·风险", "失败即停下"]} accents={[colors.blue, colors.rose, colors.violet, colors.amber]} />;
  if (scene.id === 4) return <CompareStage scene={scene} labels={["实体候选", "逐项证据", "实体关口", "责任关口"]} metas={["车辆·任务·站点", "缺失项·置信度", "授权人员确认", "独立确认"]} accents={[colors.violet, colors.teal, colors.amber, colors.amber]} />;
  if (scene.id === 5) return <TimelineStage scene={scene} labels={["责任候选", "创建工单", "保留起点", "超时升级"]} metas={["N6 不判责", "规则版本确认", "改派不重置", "人工接管"]} />;
  if (scene.id === 6) return <Flow scene={scene} labels={["证据校验", "回复草稿", "人工发布", "回访结案"]} metas={["缺失即停", "N7 未发布", "授权审核", "保留记录"]} accents={[colors.teal, colors.violet, colors.amber, colors.green]} />;
  if (scene.id === 7) return <ClusterStage scene={scene} />;
  if (scene.id === 8) return <CompareStage scene={scene} labels={["根因假设", "支持证据", "反证", "人工立项"]} metas={["可验证", "回到原记录", "不隐藏冲突", "改进项目"]} accents={[colors.violet, colors.teal, colors.rose, colors.amber]} />;
  if (scene.id === 9) return <TimelineStage scene={scene} labels={["T0 立项", "T7 观察", "T30 判断", "复发重开"]} metas={["措施冻结", "标注时钟", "分母明确", "不覆盖旧记录"]} />;
  if (scene.id === 10) return <EvidenceStage scene={scene} />;
  if (scene.id === 11) return <FormulaStage scene={scene} />;
  if (scene.id === 12) return <DocumentsStage scene={scene} />;
  return <SummaryStage scene={scene} />;
};

const Subtitle = ({ scene }: { scene: Scene }) => {
  const frame = useCurrentFrame();
  const current = scene.captions.find((item) => frame >= item.startFrame && frame < item.endFrame);
  if (!current) return null;
  const fade = Math.min(4, Math.max(1, Math.floor((current.endFrame - current.startFrame) / 3)));
  const opacity = interpolate(frame, [current.startFrame, current.startFrame + fade, current.endFrame - fade, current.endFrame], [0, 1, 1, 0], clamp);
  return <div style={{ opacity, fontSize: 27, lineHeight: 1.5, color: colors.ink }}>{current.text}</div>;
};

const SceneView = ({ scene }: { scene: Scene }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 18], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const fadeOut = interpolate(frame, [scene.durationFrames - 12, scene.durationFrames - 1], [1, 0], clamp);
  const accent = accentMap[scene.accent] ?? colors.green;
  const globalFrame = scene.startFrame + frame;
  return (
    <AbsoluteFill style={{ background: colors.paper, color: colors.ink, fontFamily: sans, opacity: fadeOut }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(24,32,24,.034) 1px, transparent 1px), linear-gradient(90deg, rgba(24,32,24,.034) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
      <div style={{ position: "absolute", left: 64, right: 64, top: 42, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${colors.ink}`, paddingBottom: 18 }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}><span style={{ background: colors.ink, color: colors.lime, padding: "10px 13px", fontWeight: 850, fontSize: 20 }}>石听</span><span style={{ color: colors.green, letterSpacing: 3, fontSize: 20, fontWeight: 760 }}>NEOLOOP</span></div>
        <div style={{ display: "flex", gap: 18, alignItems: "center", color: colors.green, fontSize: 21, fontWeight: 760 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: colors.amber }} />合成演示</div>
      </div>
      <div style={{ position: "absolute", left: 92, right: 92, top: 146, bottom: 145, display: "grid", gridTemplateColumns: "0.72fr 1.28fr", gap: 70, alignItems: "center", opacity: enter, translate: `0 ${interpolate(enter, [0, 1], [22, 0])}px` }}>
        <div>
          <div style={{ color: accent, fontFamily: mono, fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>{`${scene.id}`.padStart(2, "0")} / {timeline.scenes.length.toString().padStart(2, "0")}</div>
          <h1 style={{ margin: "24px 0 0", fontFamily: serif, fontSize: 62, lineHeight: 1.12, fontWeight: 650, letterSpacing: -2 }}>{scene.title}</h1>
          <div style={{ marginTop: 28, color: colors.muted, fontSize: 29, lineHeight: 1.55 }}>{scene.kicker}</div>
          <div style={{ display: "inline-block", marginTop: 30, padding: "10px 0", borderTop: `1px solid ${accent}`, borderBottom: `1px solid ${accent}`, color: accent, fontSize: 19, fontWeight: 780 }}>{evidenceTags[scene.id - 1]}</div>
        </div>
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Visual scene={scene} /></div>
      </div>
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 38 }}>
        <div style={{ minHeight: 58, display: "flex", justifyContent: "space-between", alignItems: "end", gap: 36 }}><div style={{ maxWidth: 1530 }}><Subtitle scene={scene} /></div><div style={{ color: colors.green, fontFamily: mono, fontSize: 18 }}>{Math.floor(globalFrame / timeline.fps)}s / {Math.ceil(timeline.totalFrames / timeline.fps)}s</div></div>
        <div style={{ marginTop: 13, height: 5, background: "#d2cec3" }}><div style={{ height: "100%", width: `${(globalFrame / timeline.totalFrames) * 100}%`, background: colors.green }} /></div>
      </div>
      <Sequence from={scene.audioOffsetFrames}><Audio src={staticFile(scene.audio)} volume={1} /></Sequence>
    </AbsoluteFill>
  );
};

export const VoiceSyncedDemo = () => (
  <AbsoluteFill>
    {timeline.scenes.map((scene) => (
      <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationFrames} name={`Scene ${scene.id}: ${scene.title}`}>
        <SceneView scene={scene} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
