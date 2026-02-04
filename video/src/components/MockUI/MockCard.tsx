import React from "react";
import { useCurrentFrame, spring, interpolate } from "remotion";
import { colors, radius, springs } from "../../lib/tokens";

interface MockCardProps {
  children: React.ReactNode;
  width?: number;
  height?: number;
  delay?: number;
  style?: React.CSSProperties;
}

/**
 * MockCard - Reusable card frame matching Zarf Zen design
 * bg: rgba(230,230,232,0.04), border: rgba(230,230,232,0.1), radius: 24px
 */
export const MockCard: React.FC<MockCardProps> = ({
  children,
  width = 320,
  height,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const fps = 30;

  const entrySpring = spring({
    frame: frame - delay,
    fps,
    config: springs.punch,
  });

  const y = interpolate(entrySpring, [0, 1], [40, 0]);
  const opacity = interpolate(entrySpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(entrySpring, [0, 0.6, 1], [0.9, 1.02, 1]);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius["2xl"],
        border: `1px solid rgba(230, 230, 232, 0.1)`,
        background: `linear-gradient(145deg, rgba(230, 230, 232, 0.04) 0%, rgba(230, 230, 232, 0.02) 100%)`,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        transform: `translateY(${y}px) scale(${scale})`,
        opacity,
        boxShadow: `
          0 25px 50px -15px rgba(0, 0, 0, 0.4),
          0 0 60px -30px rgba(230, 230, 232, 0.08)
        `,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export default MockCard;
