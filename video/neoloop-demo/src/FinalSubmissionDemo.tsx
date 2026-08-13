import {Video} from "@remotion/media";
import {AbsoluteFill, Sequence, staticFile} from "remotion";

const introDuration = 1301;
const workbenchDuration = 3447;
const closingSourceStart = 2907;
const closingDuration = 2286;

export const finalSubmissionDurationInFrames =
  introDuration + workbenchDuration + closingDuration;

const FullFrameVideo = ({src, trimBefore = 0}: {src: string; trimBefore?: number}) => (
  <Video
    src={staticFile(src)}
    trimBefore={trimBefore}
    objectFit="cover"
    style={{width: "100%", height: "100%"}}
  />
);

export const FinalSubmissionDemo = () => (
  <AbsoluteFill style={{backgroundColor: "#101a14"}}>
    <Sequence name="产品定位与接入设计" durationInFrames={introDuration}>
      <FullFrameVideo src="master-sources/neoloop-motion-v1.mp4" />
    </Sequence>
    <Sequence
      name="飞书工作台实操"
      from={introDuration}
      durationInFrames={workbenchDuration}
    >
      <FullFrameVideo src="master-sources/neoloop-feishu-tutorial-v7.mp4" />
    </Sequence>
    <Sequence
      name="Web治理、边界与三层证据"
      from={introDuration + workbenchDuration}
      durationInFrames={closingDuration}
    >
      <FullFrameVideo
        src="master-sources/neoloop-evidence-v4.mp4"
        trimBefore={closingSourceStart}
      />
    </Sequence>
  </AbsoluteFill>
);
