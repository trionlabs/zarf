import React from "react";
import { useCurrentFrame, interpolate, spring } from "remotion";
import { colors, typography, radius, springs } from "../../lib/tokens";

interface MockTimelineProps {
  delay?: number;
  cliffMonths?: number;
  vestingMonths?: number;
}

/**
 * MockTimeline - Vesting timeline visualization
 * Shows cliff and vesting period with animated progress
 */
export const MockTimeline: React.FC<MockTimelineProps> = ({
  delay = 0,
  cliffMonths = 6,
  vestingMonths = 24,
}) => {
  const frame = useCurrentFrame();
  const fps = 30;

  const entrySpring = spring({
    frame: frame - delay,
    fps,
    config: springs.snap,
  });

  const lineProgress = interpolate(
    frame,
    [delay + 10, delay + 40],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const cliffPosition = cliffMonths / vestingMonths;
  const months = [0, 6, 12, 18, 24];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: interpolate(entrySpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
      }}
    >
      {/* Timeline header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: typography.sans,
            fontSize: 12,
            fontWeight: typography.medium,
            color: colors.fgSubtle,
          }}
        >
          Vesting Schedule
        </span>
        <span
          style={{
            fontFamily: typography.mono,
            fontSize: 11,
            color: colors.fgFaint,
          }}
        >
          {vestingMonths} months
        </span>
      </div>

      {/* Timeline bar */}
      <div
        style={{
          position: "relative",
          height: 8,
          borderRadius: radius.full,
          background: "rgba(230, 230, 232, 0.08)",
          overflow: "hidden",
        }}
      >
        {/* Cliff period (darker) */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${cliffPosition * 100 * Math.min(lineProgress / cliffPosition, 1)}%`,
            height: "100%",
            background: "rgba(230, 230, 232, 0.15)",
            borderRadius: radius.full,
          }}
        />

        {/* Vesting period (lighter) */}
        <div
          style={{
            position: "absolute",
            left: `${cliffPosition * 100}%`,
            top: 0,
            width: `${Math.max(0, (lineProgress - cliffPosition) / (1 - cliffPosition)) * (1 - cliffPosition) * 100}%`,
            height: "100%",
            background: colors.fg,
            borderRadius: radius.full,
          }}
        />

        {/* Cliff marker */}
        <div
          style={{
            position: "absolute",
            left: `${cliffPosition * 100}%`,
            top: -4,
            width: 2,
            height: 16,
            background: colors.fgMuted,
            transform: "translateX(-50%)",
            opacity: lineProgress > cliffPosition ? 1 : 0.3,
          }}
        />
      </div>

      {/* Month markers */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {months.map((month, i) => (
          <span
            key={month}
            style={{
              fontFamily: typography.mono,
              fontSize: 10,
              color: colors.fgFaint,
              opacity: lineProgress > month / vestingMonths ? 1 : 0.4,
            }}
          >
            {month}m
          </span>
        ))}
      </div>

      {/* Labels */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "rgba(230, 230, 232, 0.15)",
            }}
          />
          <span
            style={{
              fontFamily: typography.sans,
              fontSize: 10,
              color: colors.fgFaint,
            }}
          >
            Cliff
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: colors.fg,
            }}
          />
          <span
            style={{
              fontFamily: typography.sans,
              fontSize: 10,
              color: colors.fgFaint,
            }}
          >
            Vesting
          </span>
        </div>
      </div>
    </div>
  );
};

export default MockTimeline;
