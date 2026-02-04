import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";
import { colors, typography, layout, springs, beat, radius } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";

/**
 * Scene 04: Create + Claim Split Screen
 * Left: Claim flow | Right: Create flow
 * Clean, minimal, side by side
 */
export const CreateClaimSplitScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  const halfWidth = layout.width / 2;
  const centerY = layout.center.y;

  // Divider animation
  const dividerHeight = interpolate(
    frame,
    [0, beat.at(1)],
    [0, layout.height * 0.6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Left side: CLAIM
  const claimSteps = [
    { num: "01", label: "VERIFY EMAIL" },
    { num: "02", label: "GENERATE PROOF" },
    { num: "03", label: "CLAIM TOKENS" },
  ];

  // Right side: CREATE
  const createSteps = [
    { num: "01", label: "SELECT TOKEN" },
    { num: "02", label: "SET SCHEDULE" },
    { num: "03", label: "ADD RECIPIENTS" },
  ];

  const renderSteps = (steps: typeof claimSteps, side: "left" | "right", baseDelay: number) => {
    const offsetX = side === "left" ? halfWidth * 0.5 : halfWidth * 1.5;

    return (
      <>
        {/* Title */}
        <div
          style={{
            position: "absolute",
            left: side === "left" ? 0 : halfWidth,
            top: layout.margin.y + 40,
            width: halfWidth,
            textAlign: "center",
            opacity: interpolate(frame, [baseDelay, baseDelay + 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span
            style={{
              fontFamily: typography.mono,
              fontSize: 12,
              fontWeight: typography.semibold,
              letterSpacing: "0.2em",
              color: colors.fgSubtle,
            }}
          >
            {side === "left" ? "CLAIM" : "CREATE"}
          </span>
        </div>

        {/* Steps */}
        {steps.map((step, i) => {
          const stepDelay = baseDelay + beat.at(1 + i);
          const stepSpring = spring({
            frame: frame - stepDelay,
            fps,
            config: springs.snap,
          });

          const y = interpolate(stepSpring, [0, 1], [30, 0]);
          const opacity = interpolate(stepSpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });

          const stepY = centerY - 80 + i * 80;

          return (
            <div
              key={`${side}-${step.num}`}
              style={{
                position: "absolute",
                left: offsetX - 120,
                top: stepY,
                width: 240,
                display: "flex",
                alignItems: "center",
                gap: 16,
                transform: `translateY(${y}px)`,
                opacity,
              }}
            >
              {/* Number */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: `1px solid ${colors.border}`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontFamily: typography.mono,
                  fontSize: 12,
                  color: colors.fgMuted,
                }}
              >
                {step.num}
              </div>

              {/* Label */}
              <div
                style={{
                  fontFamily: typography.sans,
                  fontSize: 16,
                  fontWeight: typography.medium,
                  color: colors.fg,
                  letterSpacing: "-0.01em",
                }}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <GrainOverlay opacity={0.3} fadeInStart={0} fadeInDuration={5} />

      {/* Center divider */}
      <div
        style={{
          position: "absolute",
          left: halfWidth,
          top: (layout.height - dividerHeight) / 2,
          width: 1,
          height: dividerHeight,
          backgroundColor: colors.border,
        }}
      />

      {/* Left: Claim */}
      {renderSteps(claimSteps, "left", 0)}

      {/* Right: Create */}
      {renderSteps(createSteps, "right", beat.at(1))}
    </AbsoluteFill>
  );
};

export default CreateClaimSplitScene;
