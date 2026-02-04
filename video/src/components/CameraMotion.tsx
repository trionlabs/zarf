import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

interface CameraMotionProps {
  children: React.ReactNode;
  /** Starting scale (default 1.0) */
  startScale?: number;
  /** Ending scale (default 1.05) */
  endScale?: number;
  /** X pan in pixels (default 0) */
  panX?: number;
  /** Y pan in pixels (default 0) */
  panY?: number;
  /** Duration in frames (default uses full composition) */
  duration?: number;
  /** Easing function */
  easing?: (t: number) => number;
}

/**
 * CameraMotion - Adds subtle zoom and pan effects to scenes
 * Wraps children with smooth camera movement
 */
export const CameraMotion: React.FC<CameraMotionProps> = ({
  children,
  startScale = 1.0,
  endScale = 1.05,
  panX = 0,
  panY = 0,
  duration = 180,
  easing = Easing.out(Easing.cubic),
}) => {
  const frame = useCurrentFrame();

  const progress = interpolate(frame, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

  const scale = interpolate(progress, [0, 1], [startScale, endScale]);
  const translateX = interpolate(progress, [0, 1], [0, panX]);
  const translateY = interpolate(progress, [0, 1], [0, panY]);

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        transformOrigin: "center center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export default CameraMotion;
