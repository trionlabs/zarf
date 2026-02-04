import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import { colors, typography } from "../lib/tokens";
import { strokeDraw, fadeIn, scaleIn } from "../lib/easings";

interface ZarfLogoProps {
  showBolt?: boolean;
  showText?: boolean;
  showTagline?: boolean;
  boltStart?: number;
  textStart?: number;
  taglineStart?: number;
  size?: "sm" | "md" | "lg";
  centered?: boolean;
}

/**
 * Zarf Logo - Lightning bolt with text
 * Animated stroke-draw for the bolt, letter stagger for text
 */
export const ZarfLogo: React.FC<ZarfLogoProps> = ({
  showBolt = true,
  showText = true,
  showTagline = false,
  boltStart = 0,
  textStart = 60,
  taglineStart = 90,
  size = "md",
  centered = true,
}) => {
  const frame = useCurrentFrame();

  // Size configurations
  const sizes = {
    sm: { bolt: 60, text: 24, tagline: 12, gap: 8 },
    md: { bolt: 100, text: 48, tagline: 16, gap: 16 },
    lg: { bolt: 140, text: 64, tagline: 20, gap: 24 },
  };

  const s = sizes[size];

  // Bolt stroke-draw animation
  const boltPathLength = 60; // Approximate path length
  const { dashOffset, opacity: boltOpacity } = strokeDraw(
    frame,
    boltStart,
    40,
    boltPathLength
  );

  // Bolt glow pulse after draw complete
  const glowOpacity = interpolate(
    frame,
    [boltStart + 40, boltStart + 50, boltStart + 60],
    [0, 0.4, 0.1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Text letter stagger
  const letters = "zarf.to".split("");
  const letterDelay = 4; // frames between each letter

  // Tagline fade
  const taglineOpacity = fadeIn(frame, taglineStart, 30);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: centered ? "center" : "flex-start",
        gap: s.gap,
      }}
    >
      {/* Lightning Bolt */}
      {showBolt && (
        <div style={{ position: "relative" }}>
          {/* Glow effect */}
          <svg
            width={s.bolt}
            height={s.bolt}
            viewBox="0 0 24 24"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              filter: "blur(12px)",
              opacity: glowOpacity,
            }}
          >
            <path
              d="M13 10V3L4 14h7v7l9-11h-7z"
              fill={colors.fg}
              stroke="none"
            />
          </svg>

          {/* Main bolt */}
          <svg width={s.bolt} height={s.bolt} viewBox="0 0 24 24">
            <path
              d="M13 10V3L4 14h7v7l9-11h-7z"
              fill="none"
              stroke={colors.fg}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={boltPathLength}
              strokeDashoffset={dashOffset}
              opacity={boltOpacity}
            />
            {/* Fill appears after stroke completes */}
            <path
              d="M13 10V3L4 14h7v7l9-11h-7z"
              fill={colors.fg}
              stroke="none"
              opacity={interpolate(
                frame,
                [boltStart + 35, boltStart + 45],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )}
            />
          </svg>
        </div>
      )}

      {/* Text: zarf.to */}
      {showText && (
        <div
          style={{
            display: "flex",
            fontFamily: typography.sans,
            fontSize: s.text,
            fontWeight: typography.semibold,
            letterSpacing: "-0.02em",
            color: colors.fg,
          }}
        >
          {letters.map((letter, i) => {
            const letterStart = textStart + i * letterDelay;
            const letterOpacity = fadeIn(frame, letterStart, 15);
            const letterY = interpolate(
              frame,
              [letterStart, letterStart + 15],
              [8, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <span
                key={i}
                style={{
                  opacity: letterOpacity,
                  transform: `translateY(${letterY}px)`,
                  display: "inline-block",
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
      )}

      {/* Tagline */}
      {showTagline && (
        <div
          style={{
            fontFamily: typography.sans,
            fontSize: s.tagline,
            fontWeight: typography.light,
            color: colors.fgSubtle,
            opacity: taglineOpacity,
            letterSpacing: "0.01em",
          }}
        >
          Privacy-preserving token distribution
        </div>
      )}
    </div>
  );
};

export default ZarfLogo;
