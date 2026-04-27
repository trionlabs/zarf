import React from "react";
import { useCurrentFrame, spring, interpolate } from "remotion";
import { colors, typography, radius, springs } from "../../lib/tokens";

interface MockBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "info" | "count";
  delay?: number;
  count?: number;
  countDelay?: number;
  countSpeed?: number;
}

/**
 * MockBadge - Status badges with optional count animation
 */
export const MockBadge: React.FC<MockBadgeProps> = ({
  children,
  variant = "default",
  delay = 0,
  count,
  countDelay = 0,
  countSpeed = 3,
}) => {
  const frame = useCurrentFrame();
  const fps = 30;

  const entrySpring = spring({
    frame: frame - delay,
    fps,
    config: springs.snap,
  });

  const scale = interpolate(entrySpring, [0, 0.5, 1], [0.5, 1.1, 1]);
  const opacity = interpolate(entrySpring, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });

  // Animated count
  const displayCount = count !== undefined
    ? Math.min(count, Math.max(0, Math.floor((frame - countDelay) / countSpeed)))
    : undefined;

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case "success":
        return {
          background: "rgba(74, 222, 128, 0.15)",
          border: "1px solid rgba(74, 222, 128, 0.3)",
          color: "rgba(74, 222, 128, 1)",
        };
      case "info":
        return {
          background: "rgba(96, 165, 250, 0.15)",
          border: "1px solid rgba(96, 165, 250, 0.3)",
          color: "rgba(96, 165, 250, 1)",
        };
      case "count":
        return {
          background: colors.fg,
          border: "none",
          color: colors.bg,
          minWidth: 24,
          height: 24,
          padding: "0 8px",
        };
      default:
        return {
          background: "rgba(230, 230, 232, 0.08)",
          border: "1px solid rgba(230, 230, 232, 0.15)",
          color: colors.fgMuted,
        };
    }
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: radius.full,
        fontFamily: typography.mono,
        fontSize: 11,
        fontWeight: typography.semibold,
        letterSpacing: "0.02em",
        transform: `scale(${scale})`,
        opacity,
        ...getVariantStyles(),
      }}
    >
      {children}
      {displayCount !== undefined && displayCount > 0 && (
        <span style={{ fontWeight: typography.bold }}>
          {displayCount}
        </span>
      )}
    </div>
  );
};

export default MockBadge;
