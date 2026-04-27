import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import { colors, beat, layout } from "../lib/tokens";

interface FingerprintRipplesProps {
  fadeInStart?: number;
  fadeInDuration?: number;
  expandStart?: number;
  expandDuration?: number;
  opacity?: number;
  originX?: string;
  originY?: string;
  /** Enable beat-synced mode with rotating ring groups */
  beatSynced?: boolean;
}

/**
 * Fingerprint Ripples - Concentric circles effect
 * Enhanced with beat-synced rings and rotating groups
 */
export const FingerprintRipples: React.FC<FingerprintRipplesProps> = ({
  fadeInStart = 60,
  fadeInDuration = 30,
  expandStart = 60,
  expandDuration = 60,
  opacity = 0.5,
  originX = "50%",
  originY = "50%",
  beatSynced = false,
}) => {
  const frame = useCurrentFrame();

  // Fade in
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

  // Basic expansion (scale)
  const scale = interpolate(
    frame,
    [expandStart, expandStart + expandDuration],
    [0.3, 1.2],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  if (!beatSynced) {
    // Original simple mode
    return (
      <AbsoluteFill
        style={{
          opacity: currentOpacity,
          transform: `scale(${scale})`,
          transformOrigin: `${originX} ${originY}`,
          background: `
            repeating-radial-gradient(
              circle at ${originX} ${originY},
              transparent 0px,
              transparent 7px,
              ${colors.ripple} 8px,
              transparent 9px
            )
          `,
          pointerEvents: "none",
        }}
      />
    );
  }

  // Beat-synced mode with enhanced effects
  const centerX = layout.center.x;
  const centerY = layout.center.y;

  // Ring groups configuration
  const ringGroups = [
    { count: 4, baseRadius: 60, spacing: 25, rotationSpeed: 2, opacity: 0.4 },   // Inner - fast
    { count: 5, baseRadius: 180, spacing: 35, rotationSpeed: 1, opacity: 0.25 }, // Middle - medium
    { count: 6, baseRadius: 380, spacing: 50, rotationSpeed: 0.5, opacity: 0.1 }, // Outer - slow
  ];

  // Beat-synced ring expansion - new ring appears on each beat
  const beatRings = Array.from({ length: 6 }, (_, i) => {
    const ringStart = expandStart + i * beat.framesPerBeat;
    const relativeFrame = frame - ringStart;

    if (relativeFrame < 0) return null;

    const progress = Math.min(relativeFrame / 45, 1);
    const ringRadius = 50 + progress * 350;
    const ringOpacity = interpolate(
      progress,
      [0, 0.1, 0.6, 1],
      [0, 0.35, 0.2, 0],
      { extrapolateRight: "clamp" }
    );

    return { radius: ringRadius, opacity: ringOpacity, progress };
  }).filter(Boolean);

  // Data particles orbiting the rings
  const particles = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2 + frame * 0.02;
    const orbitRadius = 120 + (i % 3) * 80;
    const particleOpacity = interpolate(
      frame,
      [fadeInStart + i * 3, fadeInStart + i * 3 + 15],
      [0, 0.4 + Math.sin(frame * 0.1 + i) * 0.2],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

    return {
      x: centerX + Math.cos(angle) * orbitRadius,
      y: centerY + Math.sin(angle) * orbitRadius,
      size: 2 + (i % 3),
      opacity: particleOpacity,
    };
  });

  // Center core pulse
  const coreSize = 20 + Math.sin(frame * 0.15) * 5;
  const coreOpacity = interpolate(
    frame,
    [fadeInStart, fadeInStart + 20],
    [0, 0.6],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ opacity: currentOpacity, pointerEvents: "none" }}>
      {/* SVG for precise ring control */}
      <svg
        style={{ position: "absolute", top: 0, left: 0 }}
        width={layout.width}
        height={layout.height}
      >
        {/* Rotating ring groups */}
        {ringGroups.map((group, gi) => (
          <g
            key={gi}
            transform={`rotate(${frame * group.rotationSpeed * (gi % 2 === 0 ? 1 : -1)}, ${centerX}, ${centerY})`}
          >
            {Array.from({ length: group.count }, (_, ri) => {
              const radius = group.baseRadius + ri * group.spacing;
              const ringOpacity = interpolate(
                frame,
                [fadeInStart + gi * 5 + ri * 2, fadeInStart + gi * 5 + ri * 2 + 20],
                [0, group.opacity - ri * 0.03],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );

              return (
                <circle
                  key={ri}
                  cx={centerX}
                  cy={centerY}
                  r={radius * scale}
                  fill="none"
                  stroke={colors.fg}
                  strokeWidth={1}
                  opacity={ringOpacity}
                  strokeDasharray={gi === 1 ? "8 4" : "none"}
                />
              );
            })}
          </g>
        ))}

        {/* Beat-synced expanding rings */}
        {beatRings.map((ring, i) => ring && (
          <circle
            key={`beat-${i}`}
            cx={centerX}
            cy={centerY}
            r={ring.radius}
            fill="none"
            stroke={colors.fg}
            strokeWidth={2}
            opacity={ring.opacity}
          />
        ))}

        {/* Center core */}
        <circle
          cx={centerX}
          cy={centerY}
          r={coreSize}
          fill={colors.fg}
          opacity={coreOpacity * 0.7}
        />
        <circle
          cx={centerX}
          cy={centerY}
          r={coreSize + 8}
          fill="none"
          stroke={colors.fg}
          strokeWidth={1.5}
          opacity={coreOpacity * 0.5}
        />

      </svg>

      {/* Orbiting data particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: p.x - p.size / 2,
            top: p.y - p.size / 2,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: colors.fg,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 3}px ${colors.fg}`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

export default FingerprintRipples;
