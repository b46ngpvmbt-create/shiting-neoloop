import {Video} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const source = "captures/web/processed/workbench-usage-guide-v5.mp4";

const guide = [
  {at: 0, eyebrow: "01 / 总览", title: "从运营视图进入", detail: "先确认合成快照与证据边界。"},
  {at: 7, eyebrow: "02 / 案件", title: "查看个案证据", detail: "打开 SYN-CASE-017，核对来源与关联对象。"},
  {at: 16, eyebrow: "03 / 沙盘", title: "进入本地演示", detail: "所有操作只改变浏览器内存，不写入飞书。"},
  {at: 25, eyebrow: "04 / 人工关口", title: "退回补证", detail: "填写缺失证据，明确退回原因。"},
  {at: 39, eyebrow: "05 / 重新提交", title: "补证后再审核", detail: "先补证，再由人工重新确认。"},
  {at: 49, eyebrow: "06 / 个案闭环", title: "派单、处置、回访", detail: "风险、实体、工单和关闭逐步留痕。"},
  {at: 65, eyebrow: "07 / 改进闭环", title: "从问题簇到改进", detail: "重复问题进入立项与观察窗。"},
  {at: 80, eyebrow: "08 / 完成", title: "两次闭环可追溯", detail: "个案、问题簇与改进项目保持关联。"},
] as const;

export const workbenchV5DurationInFrames = 88 * 30;

export const WorkbenchUsageV5 = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const seconds = frame / fps;
  const currentIndex = guide.reduce(
    (lastIndex, item, index) => (seconds >= item.at ? index : lastIndex),
    0,
  );
  const current = guide[Math.max(0, currentIndex)];
  const localFrame = frame - current.at * fps;

  return (
    <AbsoluteFill
      style={{
        background: "#eff1eb",
        color: "#10251b",
        fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 18% 14%, rgba(192,214,174,.46), transparent 31%), linear-gradient(155deg, #f7f7f2 0%, #e6ebe2 100%)",
        }}
      />

      <section
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 590,
          height: 1080,
          padding: "68px 54px 54px 62px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(16,37,27,.12)",
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 14}}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              display: "grid",
              placeItems: "center",
              background: "#0e4a35",
              color: "white",
              fontWeight: 900,
              fontSize: 17,
            }}
          >
            石听
          </div>
          <div>
            <div style={{fontSize: 21, fontWeight: 850}}>石听 NeoLoop</div>
            <div style={{fontSize: 14, color: "#657269", marginTop: 2}}>工作台使用说明 · 合成演示</div>
          </div>
        </div>

        <div style={{marginTop: 104}}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 850,
              letterSpacing: 1.5,
              color: "#41735d",
              opacity: interpolate(localFrame, [0, 9], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {current.eyebrow}
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 50,
              lineHeight: 1.12,
              letterSpacing: -1.5,
              fontWeight: 900,
              opacity: interpolate(localFrame, [0, 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: `0 ${interpolate(localFrame, [0, 12], [14, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              })}px`,
            }}
          >
            {current.title}
          </div>
          <div
            style={{
              marginTop: 22,
              maxWidth: 410,
              fontSize: 22,
              lineHeight: 1.62,
              color: "#5c6a62",
              fontWeight: 580,
              opacity: interpolate(localFrame, [5, 16], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {current.detail}
          </div>
        </div>

        <div style={{marginTop: "auto"}}>
          <div style={{height: 4, borderRadius: 99, background: "rgba(16,37,27,.12)", overflow: "hidden"}}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (frame / (workbenchV5DurationInFrames - 1)) * 100)}%`,
                background: "#0e4a35",
              }}
            />
          </div>
          <div style={{display: "flex", justifyContent: "space-between", marginTop: 15, fontSize: 14, color: "#66746b"}}>
            <span>真实连续操作录屏</span>
            <span>{Math.max(1, currentIndex + 1)} / {guide.length}</span>
          </div>
        </div>
      </section>

      <section
        style={{
          position: "absolute",
          left: 590,
          right: 0,
          top: 0,
          bottom: 0,
          overflow: "hidden",
          background: "#e9ede7",
        }}
      >
        <Video
          src={staticFile(source)}
          muted
          volume={0}
          objectFit="fill"
          style={{
            position: "absolute",
            width: 2208,
            height: 1435,
            left: -945,
            top: -112,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            boxShadow: "inset 18px 0 36px -32px rgba(9,29,19,.7)",
          }}
        />
      </section>
    </AbsoluteFill>
  );
};
