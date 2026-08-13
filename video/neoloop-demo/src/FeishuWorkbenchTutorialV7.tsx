import {Video} from "@remotion/media";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

const fps = 30;
const clickFrame = 49;
const responseFrame = 66;

type Point = {x: number; y: number};

type Segment = {
  start: number;
  duration: number;
  title: string;
  prelude?: string;
  source: string;
  sourceStart: number;
  target: Point;
  captions: string[];
};

const segments: Segment[] = [
  {
    start: 0,
    duration: 397,
    title: "01 总览",
    prelude: "captures/feishu/still-overview.png",
    source: "captures/feishu/processed/feishu-workbench-guide-v6-take1.mp4",
    sourceStart: 40,
    target: {x: 223, y: 354},
    captions: [
      "打开飞书落地工作台，先查看总览",
      "当前为合成实验，Base 已连接",
      "核对十张表与各类记录数量",
    ],
  },
  {
    start: 397,
    duration: 474,
    title: "02 接入与案件",
    prelude: "captures/feishu/still-overview.png",
    source: "captures/feishu/processed/feishu-workbench-guide-v6-take1.mp4",
    sourceStart: 0,
    target: {x: 512, y: 354},
    captions: [
      "点击“接入与案件”",
      "查看渠道接收、写入、重放与冲突状态",
      "连接器尚未启用，不表述为真实全渠道接入",
      "原始来源、文本与接入证据均被保留",
    ],
  },
  {
    start: 871,
    duration: 486,
    title: "人工确认与打回补证",
    prelude: "captures/feishu/still-case-list.png",
    source: "captures/feishu/processed/feishu-workbench-guide-v6-take1.mp4",
    sourceStart: 110,
    target: {x: 1382, y: 568},
    captions: [
      "查看全部反馈案件",
      "AI 只生成分类、风险和关联候选",
      "授权人员确认后，案件才进入协同",
      "信息不足可打回补证，再重新审核",
    ],
  },
  {
    start: 1357,
    duration: 496,
    title: "03 处置与 SLA",
    prelude: "captures/feishu/still-overview.png",
    source: "captures/feishu/processed/feishu-workbench-guide-v6-take1.mp4",
    sourceStart: 130,
    target: {x: 801, y: 354},
    captions: [
      "进入“处置与 SLA”",
      "工单按待关注、进行中和待验证分列",
      "改派、重试和升级都不重置原始时钟",
      "处置完成后仍需验证与回访",
    ],
  },
  {
    start: 1853,
    duration: 514,
    title: "04 问题与改进",
    prelude: "captures/feishu/still-overview.png",
    source: "captures/feishu/processed/feishu-workbench-guide-v6-take2.mp4",
    sourceStart: 20,
    target: {x: 1084, y: 354},
    captions: [
      "点击“问题与改进”",
      "相似反馈先形成问题簇候选",
      "人工立项后进入 7 天与 30 天观察",
      "复发时重开，但不覆盖历史记录",
    ],
  },
  {
    start: 2367,
    duration: 513,
    title: "05 AI 与审计",
    prelude: "captures/feishu/still-overview.png",
    source: "captures/feishu/processed/feishu-workbench-guide-v6-take2.mp4",
    sourceStart: 70,
    target: {x: 1370, y: 354},
    captions: [
      "进入“AI 与审计”",
      "模型输出 exact-5 候选",
      "确定性代码补全 exact-14 审计信封",
      "失败进入人工处理，每次修订可追溯",
    ],
  },
  {
    start: 2880,
    duration: 567,
    title: "06 主数据与知识",
    prelude: "captures/feishu/still-overview.png",
    source: "captures/feishu/processed/feishu-workbench-guide-v6-take2.mp4",
    sourceStart: 90,
    target: {x: 1666, y: 354},
    captions: [
      "最后查看“主数据与知识”",
      "车辆、任务和站点只用于证据关联",
      "不提供车辆控制动作",
      "知识草稿只有人工审核后才能发布",
      "个案闭环与改进闭环由此贯通",
    ],
  },
];

export const feishuWorkbenchV7DurationInFrames = 3447;

const RecordedClip = ({segment}: {segment: Segment}) => {
  const frame = useCurrentFrame();
  const preludeUsesRecordedGeometry = segment.prelude?.endsWith("still-case-list.png");
  const videoOpacity = segment.prelude
    ? interpolate(frame, [responseFrame - 5, responseFrame + 5], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill style={{backgroundColor: "#eef1ec", overflow: "hidden"}}>
      {segment.prelude ? (
        <Img
          src={staticFile(segment.prelude)}
          style={
            preludeUsesRecordedGeometry
              ? {position: "absolute", width: 2088, height: 1427, left: -82, top: -218}
              : {position: "absolute", width: 1920, height: 1250, left: 0, top: -80}
          }
        />
      ) : null}
      <Video
        src={staticFile(segment.source)}
        trimBefore={segment.sourceStart * fps}
        muted
        volume={0}
        style={{
          position: "absolute",
          width: 2088,
          height: 1427,
          left: -82,
          top: -218,
          objectFit: "fill",
          opacity: videoOpacity,
        }}
      />
    </AbsoluteFill>
  );
};

const Cursor = ({target}: {target: Point}) => {
  const frame = useCurrentFrame();
  const move = interpolate(frame, [4, 37], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const x = interpolate(move, [0, 1], [1490, target.x]);
  const y = interpolate(move, [0, 1], [245, target.y]);
  const ripple = interpolate(frame, [clickFrame, clickFrame + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorOpacity = interpolate(frame, [responseFrame + 2, responseFrame + 16], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{pointerEvents: "none", opacity: cursorOpacity}}>
      <div
        style={{
          position: "absolute",
          left: x - 30 * ripple,
          top: y - 30 * ripple,
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: `4px solid rgba(87, 184, 67, ${1 - ripple})`,
          transform: `scale(${0.35 + ripple})`,
          opacity: frame < clickFrame ? 0 : 1,
        }}
      />
      <svg
        width="42"
        height="52"
        viewBox="0 0 42 52"
        style={{
          position: "absolute",
          left: x,
          top: y,
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,.42))",
          transform: frame >= clickFrame && frame <= clickFrame + 4 ? "scale(.86)" : "scale(1)",
          transformOrigin: "3px 3px",
        }}
      >
        <path d="M3 2L4 39L14 30L22 49L30 45L22 27L38 27Z" fill="white" stroke="#10271f" strokeWidth="2.8" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};

const Caption = ({captions, duration}: {captions: string[]; duration: number}) => {
  const frame = useCurrentFrame();
  const index = Math.min(captions.length - 1, Math.floor((frame / duration) * captions.length));
  const local = (frame / duration) * captions.length - index;
  const opacity = interpolate(local, [0, 0.08, 0.91, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        right: 120,
        bottom: 30,
        textAlign: "center",
        color: "white",
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        fontWeight: 700,
        fontSize: 38,
        lineHeight: 1.22,
        letterSpacing: 0.5,
        WebkitTextStroke: "7px rgba(0,0,0,.78)",
        paintOrder: "stroke fill",
        textShadow: "0 3px 8px rgba(0,0,0,.62)",
        opacity,
      }}
    >
      {captions[index]}
    </div>
  );
};

export const FeishuWorkbenchTutorialV7 = () => (
  <AbsoluteFill style={{backgroundColor: "#eef1ec"}}>
    {segments.map((segment) => (
      <Sequence
        key={segment.start}
        from={segment.start}
        durationInFrames={segment.duration}
        name={segment.title}
        premountFor={fps}
      >
        <RecordedClip segment={segment} />
        <Cursor target={segment.target} />
        <Caption captions={segment.captions} duration={segment.duration} />
      </Sequence>
    ))}
    <Audio src={staticFile("audio-v7/neoloop-v7-narration.mp3")} volume={1} />
  </AbsoluteFill>
);
