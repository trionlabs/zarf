import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import { colors, layout } from "../lib/tokens";

interface GlowBurstProps {
  /** Frame to trigger the burst */
  triggerFrame: number;
  /** Center X position */
  x?: number;
  /** Center Y position */
  y?: number;
  /** Initial size */
  startSize?: number;
  /** End size */
  endSize?: number;
  /** Duration in frames */
  duration?: number;
  /** Glow color */
  color?: string;
  /** Maximum opacity */
  maxOpacity?: number;
  /** Style variant */
  variant?: "radial" | "ring" | "soft" | "sharp";
}

/**
 * GlowBurst - Brief radial glow that expands and fades
 */
export const GlowBurst: React.FC<GlowBurstProps> = ({
  triggerFrame,
  x = layout.center.x,
  y = layout.center.y,
  startSize = 50,
  endSize = 300,
  duration = 20,
  color = colors.fg,
  maxOpacity = 0.6,
  variant = "radial",
}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - triggerFrame;

  if (relativeFrame < 0 || relativeFrame > duration) return null;

  const progress = relativeFrame / duration;

  // Size expansion with easing
  const size = interpolate(
    progress,
    [0, 1],
    [startSize, endSize],
    { easing: Easing.out(Easing.cubic) }
  );

  // Opacity: quick fade in, gradual fade out
  const opacity = interpolate(
    progress,
    [0, 0.1, 0.4, 1],
    [0, maxOpacity, maxOpacity * 0.5, 0]
  );

  const getStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: "absolute",
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      borderRadius: "50%",
      pointerEvents: "none",
    };

    switch (variant) {
      case "radial":
        return {
          ...baseStyle,
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
          opacity,
        };

      case "ring":
        return {
          ...baseStyle,
          background: "transparent",
          border: `2px solid ${color}`,
          opacity,
          boxShadow: `0 0 ${size * 0.1}px ${color}`,
        };

      case "soft":
        return {
          ...baseStyle,
          background: `radial-gradient(circle, ${color} 0%, transparent 50%)`,
          opacity: opacity * 0.5,
          filter: `blur(${size * 0.1}px)`,
        };

      case "sharp":
        const sharpOpacity = interpolate(
          progress,
          [0, 0.05, 0.2, 1],
          [0, maxOpacity * 1.2, maxOpacity * 0.3, 0]
        );
        return {
          ...baseStyle,
          background: `radial-gradient(circle, ${color} 0%, ${color} 30%, transparent 60%)`,
          opacity: sharpOpacity,
        };

      default:
        return baseStyle;
    }
  };

  return <div style={getStyle()} />;
};

/**
 * ScreenFlash - Full screen flash effect
 */
export const ScreenFlash: React.FC<{
  triggerFrame: number;
  duration?: number;
  color?: string;
  maxOpacity?: number;
}> = ({
  triggerFrame,
  duration = 12,
  color = colors.fg,
  maxOpacity = 0.3,
}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - triggerFrame;

  if (relativeFrame < 0 || relativeFrame > duration) return null;

  const progress = relativeFrame / duration;

  const opacity = interpolate(
    progress,
    [0, 0.1, 1],
    [maxOpacity, maxOpacity * 0.8, 0],
    { easing: Easing.out(Easing.cubic) }
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: color,
        opacity,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * MultiRingBurst - Multiple expanding rings
 */
export const MultiRingBurst: React.FC<{
  triggerFrame: number;
  x?: number;
  y?: number;
  ringCount?: number;
  ringDelay?: number;
  startSize?: number;
  endSize?: number;
  duration?: number;
  color?: string;
}> = ({
  triggerFrame,
  x = layout.center.x,
  y = layout.center.y,
  ringCount = 3,
  ringDelay = 4,
  startSize = 50,
  endSize = 400,
  duration = 25,
  color = colors.fg,
}) => {
  return (
    <>
      {Array.from({ length: ringCount }, (_, i) => (
        <GlowBurst
          key={i}
          triggerFrame={triggerFrame + i * ringDelay}
          x={x}
          y={y}
          startSize={startSize}
          endSize={endSize - i * 50}
          duration={duration}
          color={color}
          maxOpacity={0.3 - i * 0.08}
          variant="ring"
        />
      ))}
    </>
  );
};

/**
 * PulsingGlow - Continuous pulsing glow effect
 */
export const PulsingGlow: React.FC<{
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  minOpacity?: number;
  maxOpacity?: number;
  speed?: number;
}> = ({
  x = layout.center.x,
  y = layout.center.y,
  size = 100,
  color = colors.fg,
  minOpacity = 0.1,
  maxOpacity = 0.4,
  speed = 0.1,
}) => {
  const frame = useCurrentFrame();

  const opacity = minOpacity + (maxOpacity - minOpacity) * (0.5 + 0.5 * Math.sin(frame * speed));
  const scale = 0.9 + 0.2 * Math.sin(frame * speed * 0.8);

  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color} 0%, transparent 60%)`,
        opacity,
        transform: `scale(${scale})`,
        pointerEvents: "none",
      }}
    />
  );
};

export default GlowBurst;
