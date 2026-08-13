import {Video} from "@remotion/media";
import {AbsoluteFill, Series, staticFile} from "remotion";

const fps = 30;

type Clip = {
  source: string;
  start: number;
  duration: number;
  name: string;
};

const clips: Clip[] = [
  {source: "captures/feishu/processed/feishu-workbench-guide-v6-take1.mp4", start: 35, duration: 13, name: "01 总览"},
  {source: "captures/feishu/processed/feishu-workbench-guide-v6-take1.mp4", start: 0, duration: 16, name: "02 接入边界"},
  {source: "captures/feishu/processed/feishu-workbench-guide-v6-take1.mp4", start: 66, duration: 25, name: "02 反馈与案件"},
  {source: "captures/feishu/processed/feishu-workbench-guide-v6-take1.mp4", start: 110, duration: 23, name: "03 处置与 SLA"},
  {source: "captures/feishu/processed/feishu-workbench-guide-v6-take2.mp4", start: 10, duration: 23, name: "04 问题与改进"},
  {source: "captures/feishu/processed/feishu-workbench-guide-v6-take2.mp4", start: 56, duration: 16, name: "05 AI 与审计"},
  {source: "captures/feishu/processed/feishu-workbench-guide-v6-take2.mp4", start: 76, duration: 14, name: "06 主数据与知识"},
  {source: "captures/feishu/processed/feishu-workbench-guide-v6-take2.mp4", start: 90, duration: 5, name: "回到总览"},
];

export const feishuWorkbenchV6DurationInFrames = clips.reduce(
  (sum, clip) => sum + clip.duration * fps,
  0,
);

const RecordedClip = ({clip}: {clip: Clip}) => (
  <AbsoluteFill style={{backgroundColor: "#f3f5ef", overflow: "hidden"}}>
    <Video
      src={staticFile(clip.source)}
      trimBefore={clip.start * fps}
      muted
      volume={0}
      style={{
        position: "absolute",
        width: 2088,
        height: 1427,
        left: -82,
        top: -218,
        objectFit: "fill",
      }}
    />
  </AbsoluteFill>
);

export const FeishuWorkbenchTutorialV6 = () => (
  <AbsoluteFill>
    <Series>
      {clips.map((clip) => (
        <Series.Sequence
          key={`${clip.source}-${clip.start}`}
          durationInFrames={clip.duration * fps}
          name={clip.name}
          premountFor={fps}
        >
          <RecordedClip clip={clip} />
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);
