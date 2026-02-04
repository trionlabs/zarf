import React from "react";
import { useCurrentFrame, interpolate, spring } from "remotion";
import { colors, typography, radius, springs } from "../../lib/tokens";

interface MockProofProps {
  delay?: number;
  duration?: number;
}

/**
 * MockProof - Elegant ZK proof visualization
 * Minimal, abstract representation of proof generation
 */
export const MockProof: React.FC<MockProofProps> = ({
  delay = 0,
  duration = 60,
}) => {
  const frame = useCurrentFrame();
  const fps = 30;

  const relativeFrame = frame - delay;
  const progress = interpolate(
    relativeFrame,
    [0, duration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const entrySpring = spring({
    frame: relativeFrame,
    fps,
    config: springs.snap,
  });

  const opacity = interpolate(entrySpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });

  // Generate proof hash segments
  const hashSegments = [
    "0x7f3a", "9b2c", "4e8d", "f1a6", "3c5b", "8d2e", "a4f9", "6b1c"
  ];

  // Proof verification steps
  const steps = [
    { label: "Witness", icon: "1" },
    { label: "Constraint", icon: "2" },
    { label: "Verify", icon: "3" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        opacity,
        width: "100%",
      }}
    >
      {/* Hash display - scrolling proof bytes */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: radius.lg,
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(230,230,232,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontFamily: typography.mono,
            fontSize: 13,
            color: colors.fgMuted,
            letterSpacing: "0.05em",
            whiteSpace: "nowrap",
          }}
        >
          {hashSegments.map((seg, i) => {
            const segmentProgress = interpolate(
              progress,
              [i / hashSegments.length, (i + 1) / hashSegments.length],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            const isActive = segmentProgress > 0 && segmentProgress < 1;
            const isComplete = segmentProgress >= 1;

            return (
              <span
                key={i}
                style={{
                  opacity: segmentProgress > 0 ? 0.4 + segmentProgress * 0.6 : 0.2,
                  color: isComplete ? colors.fg : isActive ? colors.fg : colors.fgFaint,
                  marginRight: i < hashSegments.length - 1 ? 8 : 0,
                  transition: "opacity 0.1s",
                }}
              >
                {seg}
              </span>
            );
          })}
        </div>
      </div>

      {/* Verification steps - minimal dots */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
        }}
      >
        {steps.map((step, i) => {
          const stepProgress = interpolate(
            progress,
            [(i * 0.3), (i * 0.3) + 0.25],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const isComplete = stepProgress >= 1;
          const isActive = stepProgress > 0 && stepProgress < 1;

          return (
            <React.Fragment key={step.label}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: `1px solid ${isComplete ? "rgba(74, 222, 128, 0.4)" : isActive ? "rgba(230,230,232,0.3)" : "rgba(230,230,232,0.1)"}`,
                    background: isComplete ? "rgba(74, 222, 128, 0.1)" : "transparent",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontSize: 12,
                    color: isComplete ? "rgba(74, 222, 128, 1)" : isActive ? colors.fg : colors.fgFaint,
                  }}
                >
                  {isComplete ? "✓" : step.icon}
                </div>
                <span
                  style={{
                    fontFamily: typography.mono,
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    color: isComplete ? colors.fg : isActive ? colors.fgMuted : colors.fgFaint,
                  }}
                >
                  {step.label.toUpperCase()}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    margin: "0 16px",
                    background: `linear-gradient(90deg,
                      ${isComplete ? "rgba(74, 222, 128, 0.3)" : "rgba(230,230,232,0.1)"} 0%,
                      rgba(230,230,232,0.05) 100%
                    )`,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Progress indicator - thin line */}
      <div
        style={{
          height: 2,
          borderRadius: radius.full,
          background: "rgba(230, 230, 232, 0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: progress >= 1
              ? "rgba(74, 222, 128, 0.8)"
              : `linear-gradient(90deg, rgba(230,230,232,0.3) 0%, ${colors.fg} 100%)`,
            borderRadius: radius.full,
          }}
        />
      </div>
    </div>
  );
};

export default MockProof;
