import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, typography, springs, beat, copy, layout } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { AnimatedText, AnimatedLine } from "../components/AnimatedText";
import { Animated } from "../components/Animated";
import { GlowBurst } from "../components/GlowBurst";

/**
 * Scene 05: The Headline
 * 120 BPM - Main messaging from landing page
 * Enhanced: Subtle dot grid background, word glow bursts, focus line under headline
 */
export const HeadlineScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Background pulse on big beats
  const pulse1 = interpolate(frame, [beat.at(1), beat.at(1) + 8], [0.2, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse2 = interpolate(frame, [beat.at(3), beat.at(3) + 8], [0.2, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dot grid fade in
  const gridOpacity = interpolate(frame, [0, 30], [0, 0.06], {
    extrapolateRight: "clamp",
  });

  // Focus line under headline
  const focusLineStart = beat.at(4);
  const focusLineWidth = interpolate(
    frame,
    [focusLineStart, focusLineStart + 20],
    [0, 400],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const focusLineOpacity = interpolate(
    frame,
    [focusLineStart, focusLineStart + 10, focusLineStart + 60],
    [0, 0.4, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Word positions for glow bursts (approximate positions)
  const wordGlowPositions = [
    { x: layout.center.x - 180, y: layout.center.y - 30, delay: beat.at(1) + 5 },  // "Confidential"
    { x: layout.center.x + 100, y: layout.center.y - 30, delay: beat.at(1) + beat.framesPerBeat / 2 + 5 },  // "Token"
    { x: layout.center.x, y: layout.center.y + 50, delay: beat.at(3) + 10 },  // "Distributions"
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <GrainOverlay opacity={0.35} fadeInStart={0} fadeInDuration={1} />

      {/* Subtle dot grid background */}
      <AbsoluteFill
        style={{
          opacity: gridOpacity,
          backgroundImage: `radial-gradient(${colors.fgFaint} 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
          backgroundPosition: "center center",
        }}
      />

      {/* Beat pulse overlay */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at center, ${colors.fg} 0%, transparent 50%)`,
          opacity: pulse1 + pulse2,
          mixBlendMode: "overlay",
        }}
      />

      {/* Word glow bursts */}
      {wordGlowPositions.map((pos, i) => (
        <GlowBurst
          key={i}
          triggerFrame={pos.delay}
          x={pos.x}
          y={pos.y}
          startSize={30}
          endSize={200}
          duration={25}
          maxOpacity={0.4}
          variant="soft"
        />
      ))}

      {/* Content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
        }}
      >
        {/* Badge */}
        <Animated.In
          in={{ y: -30, scale: 0.8, opacity: 0 }}
          delay={0}
          springConfig={springs.snap}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 20,
              border: `1px solid ${colors.border}`,
              background: "rgba(230,230,232,0.03)",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: colors.fgSubtle,
              }}
            />
            <span
              style={{
                fontFamily: typography.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.15em",
                color: colors.fgSubtle,
                textTransform: "uppercase",
              }}
            >
              {copy.badge}
            </span>
          </div>
        </Animated.In>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          {/* Line 1: "Confidential Token" - word by word */}
          <div
            style={{
              fontFamily: typography.sans,
              fontSize: typography.hero,
              fontWeight: typography.semibold,
              letterSpacing: "-0.03em",
              color: colors.fg,
            }}
          >
            <AnimatedText
              animation="scaleUp"
              stagger="word"
              delay={beat.at(1)}
              staggerDelay={beat.framesPerBeat / 2}
              springConfig={springs.hit}
            >
              Confidential Token
            </AnimatedText>
          </div>

          {/* Line 2: "Distributions" - character by character */}
          <div
            style={{
              fontFamily: typography.sans,
              fontSize: typography.hero,
              fontWeight: typography.semibold,
              letterSpacing: "-0.03em",
              color: colors.fg,
            }}
          >
            <AnimatedText
              animation="fadeUp"
              stagger="character"
              delay={beat.at(3)}
              staggerDelay={1}
              springConfig={springs.snap}
            >
              Distributions
            </AnimatedText>
          </div>

          {/* Focus line under headline */}
          <div
            style={{
              marginTop: 16,
              width: focusLineWidth,
              height: 1,
              background: `linear-gradient(90deg, transparent, ${colors.fg}, transparent)`,
              opacity: focusLineOpacity,
            }}
          />
        </div>

        {/* Subhead - word by word */}
        <div
          style={{
            marginTop: 20,
            fontFamily: typography.sans,
            fontSize: typography.h3,
            fontWeight: typography.light,
            color: colors.fgMuted,
          }}
        >
          <AnimatedText
            animation="fadeUp"
            stagger="word"
            delay={beat.at(5)}
            staggerDelay={3}
            springConfig={springs.smooth}
          >
            {copy.subhead}
          </AnimatedText>
        </div>

        {/* Tagline - fade in */}
        <AnimatedLine
          delay={beat.at(7)}
          animation="fadeUp"
          style={{
            marginTop: 8,
            fontFamily: typography.sans,
            fontSize: typography.body,
            fontWeight: typography.regular,
            color: colors.fgSubtle,
          }}
        >
          {copy.tagline}
        </AnimatedLine>
      </AbsoluteFill>

      {/* Corner decorative elements */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 80,
          width: 60,
          height: 60,
          borderLeft: `1px solid ${colors.fgFaint}`,
          borderTop: `1px solid ${colors.fgFaint}`,
          opacity: interpolate(frame, [20, 40], [0, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 80,
          right: 80,
          width: 60,
          height: 60,
          borderRight: `1px solid ${colors.fgFaint}`,
          borderBottom: `1px solid ${colors.fgFaint}`,
          opacity: interpolate(frame, [20, 40], [0, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </AbsoluteFill>
  );
};

export default HeadlineScene;
