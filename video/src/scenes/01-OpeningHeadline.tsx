import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";
import { colors, typography, layout, springs, beat } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { GlowBurst } from "../components/GlowBurst";

/**
 * Scene 01: Opening Headline
 * Dramatic landing page style - impactful copy
 */
export const OpeningHeadlineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  // Main headline spring
  const headlineDelay = beat.at(0.5);
  const headlineSpring = spring({
    frame: frame - headlineDelay,
    fps,
    config: { damping: 14, stiffness: 180, mass: 0.7 },
  });

  const headlineY = interpolate(headlineSpring, [0, 1], [100, 0]);
  const headlineOpacity = interpolate(headlineSpring, [0, 0.15], [0, 1], { extrapolateRight: "clamp" });
  const headlineScale = interpolate(headlineSpring, [0, 0.5, 1], [0.92, 1.01, 1]);

  // Subhead spring
  const subheadDelay = beat.at(2.5);
  const subheadSpring = spring({
    frame: frame - subheadDelay,
    fps,
    config: { damping: 18, stiffness: 150, mass: 0.6 },
  });
  const subheadOpacity = interpolate(subheadSpring, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });
  const subheadY = interpolate(subheadSpring, [0, 1], [40, 0]);

  // Features spring
  const featuresDelay = beat.at(4.5);
  const featuresOpacity = interpolate(
    frame,
    [featuresDelay, featuresDelay + 20],
    [0, 0.7],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#050506" }}>
      <GrainOverlay opacity={0.35} fadeInStart={0} fadeInDuration={3} />

      {/* Deep radial gradient */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 45%, rgba(230,230,232,0.04) 0%, transparent 55%)`,
        }}
      />

      {/* Central glow burst */}
      <GlowBurst
        triggerFrame={headlineDelay}
        x={layout.center.x}
        y={layout.center.y - 50}
        startSize={100}
        endSize={800}
        duration={50}
        maxOpacity={0.12}
        variant="soft"
      />

      {/* Main content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingBottom: 60,
        }}
      >
        {/* Main headline */}
        <div
          style={{
            transform: `translateY(${headlineY}px) scale(${headlineScale})`,
            opacity: headlineOpacity,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: typography.sans,
              fontSize: 160,
              fontWeight: 900,
              letterSpacing: "-0.05em",
              color: colors.fg,
              lineHeight: 0.9,
              marginBottom: 0,
            }}
          >
            PRIVATE
          </div>
          <div
            style={{
              fontFamily: typography.sans,
              fontSize: 160,
              fontWeight: 900,
              letterSpacing: "-0.05em",
              color: colors.fg,
              lineHeight: 0.9,
              marginBottom: 24,
            }}
          >
            TOKEN CLAIMS
          </div>
          <div
            style={{
              fontFamily: typography.sans,
              fontSize: 36,
              fontWeight: typography.medium,
              letterSpacing: "0.05em",
              color: colors.fgMuted,
              lineHeight: 1,
            }}
          >
            PAYROLLS · AIRDROPS · VESTING CONTRACTS
          </div>
        </div>

        {/* Subhead */}
        <div
          style={{
            marginTop: 48,
            opacity: subheadOpacity,
            transform: `translateY(${subheadY}px)`,
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontFamily: typography.sans,
              fontSize: 32,
              fontWeight: typography.regular,
              color: colors.fgMuted,
              letterSpacing: "-0.01em",
            }}
          >
            Distribute tokens to emails with zero-knowledge proofs
          </span>
          <div
            style={{
              marginTop: 20,
              fontFamily: typography.sans,
              fontSize: 18,
              fontWeight: typography.regular,
              color: colors.fgFaint,
              letterSpacing: "0.02em",
            }}
          >
            No wallet exposure. No identity leaks.
          </div>
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: 24,
            marginTop: 56,
            opacity: featuresOpacity,
          }}
        >
          {["Email-first", "ZK Privacy", "On-chain"].map((feature, i) => (
            <div
              key={feature}
              style={{
                padding: "14px 28px",
                borderRadius: 100,
                border: "1px solid rgba(230,230,232,0.12)",
                background: "rgba(230,230,232,0.03)",
                fontFamily: typography.sans,
                fontSize: 16,
                fontWeight: typography.medium,
                color: colors.fgSubtle,
                letterSpacing: "0.02em",
              }}
            >
              {feature}
            </div>
          ))}
        </div>
      </AbsoluteFill>

      {/* Decorative corner elements */}
      {[
        { left: 80, top: 80 },
        { right: 80, bottom: 80 },
      ].map((pos, i) => {
        const cornerDelay = beat.at(5) + i * 10;
        const cornerOpacity = interpolate(
          frame,
          [cornerDelay, cornerDelay + 15],
          [0, 0.2],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              ...pos,
              width: 100,
              height: 100,
              opacity: cornerOpacity,
            }}
          >
            <div
              style={{
                width: 50,
                height: 1,
                background: `linear-gradient(90deg, ${colors.fgFaint}, transparent)`,
                position: "absolute",
                top: 0,
                left: 0,
              }}
            />
            <div
              style={{
                width: 1,
                height: 50,
                background: `linear-gradient(180deg, ${colors.fgFaint}, transparent)`,
                position: "absolute",
                top: 0,
                left: 0,
              }}
            />
          </div>
        );
      })}

      {/* Floating particles */}
      {[...Array(8)].map((_, i) => {
        const particleDelay = beat.at(1.5) + i * 6;
        const particleOpacity = interpolate(
          frame,
          [particleDelay, particleDelay + 12, particleDelay + 50],
          [0, 0.35, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const startY = layout.height * 0.75;
        const endY = layout.height * 0.25;
        const particleY = interpolate(
          frame,
          [particleDelay, particleDelay + 50],
          [startY, endY],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const particleX = layout.width * (0.15 + (i * 0.1));

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: particleX,
              top: particleY,
              width: 3,
              height: 3,
              borderRadius: "50%",
              backgroundColor: colors.fg,
              opacity: particleOpacity,
              boxShadow: `0 0 15px ${colors.fg}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export default OpeningHeadlineScene;
