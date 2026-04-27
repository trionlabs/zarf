import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { beat } from "../lib/tokens";

interface BeatPulseProps {
  children: React.ReactNode;
  /** Property to pulse: 'scale' | 'opacity' | 'glow' | 'all' */
  property?: "scale" | "opacity" | "glow" | "all";
  /** Minimum value (at rest) */
  min?: number;
  /** Maximum value (on beat) */
  max?: number;
  /** How quickly the pulse decays (frames) */
  decay?: number;
  /** Offset in frames from beat boundaries */
  offset?: number;
  /** Apply to specific beat numbers only (0-indexed within scene) */
  onBeats?: number[];
  /** Custom style when using glow mode */
  glowColor?: string;
}

/**
 * BeatPulse - Wrapper that pulses children on beat boundaries
 *
 * Usage:
 * <BeatPulse property="scale" min={1} max={1.1}>
 *   <YourComponent />
 * </BeatPulse>
 */
export const BeatPulse: React.FC<BeatPulseProps> = ({
  children,
  property = "scale",
  min = 1,
  max = 1.15,
  decay = 8,
  offset = 0,
  onBeats,
  glowColor = "rgba(230, 230, 232, 0.6)",
}) => {
  const frame = useCurrentFrame();

  // Calculate distance to nearest beat
  const adjustedFrame = frame + offset;
  const beatNumber = beat.fromFrame(adjustedFrame);
  const frameInBeat = adjustedFrame % beat.framesPerBeat;

  // Check if we should pulse on this beat
  const shouldPulse = onBeats ? onBeats.includes(beatNumber) : true;

  // Pulse intensity: 1 at beat, decays to 0
  const pulseIntensity = shouldPulse
    ? interpolate(
        frameInBeat,
        [0, decay],
        [1, 0],
        { extrapolateRight: "clamp" }
      )
    : 0;

  // Calculate the pulsed value
  const value = min + (max - min) * pulseIntensity;

  const getStyle = (): React.CSSProperties => {
    switch (property) {
      case "scale":
        return { transform: `scale(${value})` };
      case "opacity":
        return { opacity: value };
      case "glow":
        const glowSize = (max - min) * pulseIntensity * 50;
        return {
          filter: `drop-shadow(0 0 ${glowSize}px ${glowColor})`,
        };
      case "all":
        const allGlowSize = (max - min) * pulseIntensity * 30;
        return {
          transform: `scale(${value})`,
          opacity: min + (1 - min) * (1 - pulseIntensity * 0.3),
          filter: `drop-shadow(0 0 ${allGlowSize}px ${glowColor})`,
        };
      default:
        return {};
    }
  };

  return (
    <div style={{ ...getStyle(), display: "inline-block" }}>
      {children}
    </div>
  );
};

/**
 * useBeatPulse - Hook for beat-synced values
 * Returns a value that pulses on each beat
 */
export const useBeatPulse = (
  min: number = 0,
  max: number = 1,
  decay: number = 8,
  offset: number = 0
): number => {
  const frame = useCurrentFrame();
  const adjustedFrame = frame + offset;
  const frameInBeat = adjustedFrame % beat.framesPerBeat;

  const pulseIntensity = interpolate(
    frameInBeat,
    [0, decay],
    [1, 0],
    { extrapolateRight: "clamp" }
  );

  return min + (max - min) * pulseIntensity;
};

/**
 * useIsOnBeat - Hook that returns true on beat frames
 */
export const useIsOnBeat = (tolerance: number = 2): boolean => {
  const frame = useCurrentFrame();
  const frameInBeat = frame % beat.framesPerBeat;
  return frameInBeat < tolerance;
};

export default BeatPulse;
