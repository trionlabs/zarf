import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";
import { colors, typography, layout, springs, beat } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { GlowBurst } from "../components/GlowBurst";

/**
 * Scene 05: Resolve
 * Dramatic finale - dark, impactful
 */
export const ResolveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  // Logo animation
  const logoDelay = beat.at(0.5);
  const logoSpring = spring({
    frame: frame - logoDelay,
    fps,
    config: { damping: 12, stiffness: 150, mass: 0.8 },
  });

  const logoScale = interpolate(logoSpring, [0, 0.6, 1], [0.5, 1.05, 1]);
  const logoOpacity = interpolate(logoSpring, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });

  // URL animation
  const urlDelay = beat.at(2.5);
  const urlSpring = spring({
    frame: frame - urlDelay,
    fps,
    config: springs.punch,
  });
  const urlOpacity = interpolate(urlSpring, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });
  const urlY = interpolate(urlSpring, [0, 1], [50, 0]);
  const urlScale = interpolate(urlSpring, [0, 0.5, 1], [0.9, 1.02, 1]);

  // Breathing glow
  const breathe = Math.sin(frame * 0.04) * 0.5 + 0.5;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050506" }}>
      <GrainOverlay opacity={0.4} fadeInStart={0} fadeInDuration={3} />

      {/* Central radial glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 50%, rgba(230,230,232,${0.03 + breathe * 0.02}) 0%, transparent 50%)`,
        }}
      />

      {/* Logo glow burst */}
      <GlowBurst
        triggerFrame={logoDelay}
        x={layout.center.x}
        y={layout.center.y - 100}
        startSize={80}
        endSize={500}
        duration={40}
        maxOpacity={0.2}
        variant="soft"
      />

      {/* Center content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 40,
        }}
      >
        {/* Logo */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            opacity: logoOpacity,
          }}
        >
          <div
            style={{
              width: 200,
              height: 200,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
            }}
          >
            {/* Glow ring */}
            <div
              style={{
                position: "absolute",
                width: 200,
                height: 200,
                borderRadius: "50%",
                border: `1px solid rgba(230,230,232,${0.1 + breathe * 0.1})`,
                boxShadow: `0 0 ${40 + breathe * 40}px rgba(230,230,232,${0.1 + breathe * 0.1})`,
              }}
            />
            <svg width={120} height={120} viewBox="0 0 24 24">
              <path
                d="M13 10V3L4 14h7v7l9-11h-7z"
                fill={colors.fg}
              />
            </svg>
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            opacity: urlOpacity,
            transform: `translateY(${urlY}px) scale(${urlScale})`,
          }}
        >
          <span
            style={{
              fontFamily: typography.sans,
              fontSize: 120,
              fontWeight: 900,
              letterSpacing: "-0.05em",
              color: colors.fg,
            }}
          >
            zarf.to
          </span>
        </div>
      </AbsoluteFill>

      {/* Bottom tagline */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(frame, [beat.at(4.5), beat.at(4.5) + 20], [0, 0.6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span
          style={{
            fontFamily: typography.mono,
            fontSize: 16,
            fontWeight: typography.regular,
            color: colors.fgSubtle,
            letterSpacing: "0.25em",
          }}
        >
          CONFIDENTIAL TOKEN DISTRIBUTIONS
        </span>
        <div
          style={{
            marginTop: 16,
            fontFamily: typography.sans,
            fontSize: 18,
            fontWeight: typography.regular,
            color: colors.fgFaint,
            letterSpacing: "0.02em",
            opacity: interpolate(frame, [beat.at(5.5), beat.at(5.5) + 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          ZK powered · On-chain · Verifiable
        </div>
      </div>

      {/* Corner accents */}
      {[
        { left: 60, top: 60, deg: 0 },
        { right: 60, top: 60, deg: 90 },
        { right: 60, bottom: 60, deg: 180 },
        { left: 60, bottom: 60, deg: 270 },
      ].map((pos, i) => {
        const accentDelay = beat.at(5) + i * 5;
        const accentOpacity = interpolate(
          frame,
          [accentDelay, accentDelay + 15],
          [0, 0.3],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const { deg, ...position } = pos;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              ...position,
              width: 40,
              height: 40,
              borderLeft: `1px solid ${colors.fgFaint}`,
              borderTop: `1px solid ${colors.fgFaint}`,
              transform: `rotate(${deg}deg)`,
              opacity: accentOpacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export default ResolveScene;
