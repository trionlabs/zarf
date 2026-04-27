import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import { colors, video } from "../lib/tokens";

interface GrainOverlayProps {
  opacity?: number;
  fadeInStart?: number;
  fadeInDuration?: number;
}

/**
 * Grain Overlay - Premium texture effect
 * Ported from Zarf landing page's feTurbulence grain
 */
export const GrainOverlay: React.FC<GrainOverlayProps> = ({
  opacity = 0.35,
  fadeInStart = 0,
  fadeInDuration = 30,
}) => {
  const frame = useCurrentFrame();

  const currentOpacity = interpolate(
    frame,
    [fadeInStart, fadeInStart + fadeInDuration],
    [0, opacity],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  // SVG filter for fractal noise grain
  const grainSvg = `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <filter id="grain">
        <feTurbulence
          type="turbulence"
          baseFrequency="0.7"
          numOctaves="5"
          stitchTiles="stitch"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" opacity="1"/>
    </svg>
  `;

  const encodedSvg = `data:image/svg+xml,${encodeURIComponent(grainSvg)}`;

  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url("${encodedSvg}")`,
        backgroundRepeat: "repeat",
        opacity: currentOpacity,
        mixBlendMode: "soft-light",
        filter: "contrast(150%) brightness(100%) grayscale(100%)",
        pointerEvents: "none",
      }}
    />
  );
};

export default GrainOverlay;
