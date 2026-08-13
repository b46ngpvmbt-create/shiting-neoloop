import { Composition } from "remotion";
import { FeishuWebDemoV2 } from "./FeishuWebDemoV2";
import { FeishuWebDemoV3, FeishuWebDemoV4, v3DurationInFrames } from "./FeishuWebDemoV3";
import { VoiceSyncedDemo, timeline } from "./VoiceSyncedDemo";
import { WorkbenchUsageV5, workbenchV5DurationInFrames } from "./WorkbenchUsageV5";
import {
  FeishuWorkbenchTutorialV6,
  feishuWorkbenchV6DurationInFrames,
} from "./FeishuWorkbenchTutorialV6";
import {
  FeishuWorkbenchTutorialV7,
  feishuWorkbenchV7DurationInFrames,
} from "./FeishuWorkbenchTutorialV7";
import {
  FinalSubmissionDemo,
  finalSubmissionDurationInFrames,
} from "./FinalSubmissionDemo";

export const Root = () => (
  <>
    <Composition
      id="NeoLoopDemo"
      component={VoiceSyncedDemo}
      durationInFrames={timeline.totalFrames}
      fps={timeline.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="NeoLoopFeishuWebV2"
      component={FeishuWebDemoV2}
      durationInFrames={timeline.totalFrames}
      fps={timeline.fps}
      width={1920}
      height={1080}
    />
    <Composition
      id="NeoLoopFeishuWebV3"
      component={FeishuWebDemoV3}
      durationInFrames={v3DurationInFrames}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="NeoLoopFeishuWebV4"
      component={FeishuWebDemoV4}
      durationInFrames={v3DurationInFrames}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="NeoLoopWorkbenchUsageV5"
      component={WorkbenchUsageV5}
      durationInFrames={workbenchV5DurationInFrames}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="NeoLoopFeishuWorkbenchTutorialV6"
      component={FeishuWorkbenchTutorialV6}
      durationInFrames={feishuWorkbenchV6DurationInFrames}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="NeoLoopFeishuWorkbenchTutorialV7"
      component={FeishuWorkbenchTutorialV7}
      durationInFrames={feishuWorkbenchV7DurationInFrames}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="NeoLoopFinalSubmissionDemo"
      component={FinalSubmissionDemo}
      durationInFrames={finalSubmissionDurationInFrames}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
