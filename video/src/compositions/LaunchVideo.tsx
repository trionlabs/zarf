import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { colors, typography, beat } from "../lib/tokens";
import { LaunchVideoProps } from "../lib/schemas";

// Scenes
import OpeningHeadlineScene from "../scenes/01-OpeningHeadline";
import FlowScene from "../scenes/02-Flow";
import UseCasesScene from "../scenes/03-UseCases";
import CreateFlowDemoScene from "../scenes/07-CreateFlowDemo";
import ClaimFlowDemoScene from "../scenes/08-ClaimFlowDemo";
import ResolveScene from "../scenes/05-Resolve";

/**
 * LaunchVideo - Demonstrative Launch Video
 * 30 seconds @ 30fps = 900 frames = 60 beats @ 120 BPM
 *
 * Structure:
 * 1. Opening Headline - Landing intro (8 beats)
 * 2. Flow - Email → ZK → Wallet (8 beats)
 * 3. Use Cases - Syndicates, Payroll, Airdrops (8 beats)
 * 4. Create Demo - Full create flow (10 beats)
 * 5. Claim Demo - Full claim flow (10 beats)
 * 6. Resolve - CTA (8 beats)
 *
 * Total: 52 beats + transitions ≈ 900 frames
 */
export const LaunchVideo: React.FC<LaunchVideoProps> = (props) => {
  const frame = useCurrentFrame();

  const fastFade = springTiming({ config: { damping: 20, stiffness: 300 } });

  return (
    <AbsoluteFill style={{ backgroundColor: props.bgColor || colors.bg }}>
      <TransitionSeries>
        {/* Scene 1: Opening Headline - Landing intro - 8 beats */}
        <TransitionSeries.Sequence durationInFrames={beat.toFrames(8)}>
          <OpeningHeadlineScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={fastFade}
        />

        {/* Scene 2: Flow - Email → ZK → Wallet - 8 beats */}
        <TransitionSeries.Sequence durationInFrames={beat.toFrames(8)}>
          <FlowScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={fastFade}
        />

        {/* Scene 3: Use Cases - 8 beats */}
        <TransitionSeries.Sequence durationInFrames={beat.toFrames(8)}>
          <UseCasesScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={fastFade}
        />

        {/* Scene 4: Create Flow Demo - 10 beats */}
        <TransitionSeries.Sequence durationInFrames={beat.toFrames(10)}>
          <CreateFlowDemoScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={fastFade}
        />

        {/* Scene 5: Claim Flow Demo - 10 beats */}
        <TransitionSeries.Sequence durationInFrames={beat.toFrames(10)}>
          <ClaimFlowDemoScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={fastFade}
        />

        {/* Scene 6: Resolve - CTA - 8 beats */}
        <TransitionSeries.Sequence durationInFrames={beat.toFrames(8)}>
          <ResolveScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* Debug: Beat counter */}
      {process.env.NODE_ENV === "development" && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "flex-end",
            padding: 20,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: typography.mono,
              fontSize: 12,
              color: colors.fgSubtle,
              backgroundColor: "rgba(0,0,0,0.7)",
              padding: "6px 12px",
              borderRadius: 6,
              display: "flex",
              gap: 16,
            }}
          >
            <span>Frame: {frame}</span>
            <span>Beat: {beat.fromFrame(frame) + 1}</span>
            <span style={{ color: beat.isOnBeat(frame) ? colors.fg : colors.fgFaint }}>
              {beat.isOnBeat(frame) ? "●" : "○"}
            </span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export default LaunchVideo;
