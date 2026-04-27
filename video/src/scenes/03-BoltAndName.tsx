import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from "remotion";
import { colors, typography, layout, springs, beat } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { Spark } from "../components/ParticleSystem";

/**
 * Scene 03: The Bolt & The Name
 * 120 BPM - Punchy, snappy entrances
 * Beat 1: Bolt SLAMS down with sparks
 * Beat 3: Letters SNAP in staggered
 * Enhanced: Electric sparks, trail afterglow, screen shake
 */
export const BoltAndNameScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  // === SCREEN SHAKE on impact ===
  const shakeIntensity = interpolate(frame, [0, 3, 12], [0, 3, 0], {
    extrapolateRight: "clamp",
  });
  const shakeX = Math.sin(frame * 8) * shakeIntensity;
  const shakeY = Math.cos(frame * 10) * shakeIntensity * 0.7;

  // === BOLT SLAM - Beat 1 (frame 0) ===
  const boltSpring = spring({
    frame,
    fps,
    config: springs.hit,
  });

  // Slam from above with overshoot
  const boltY = interpolate(boltSpring, [0, 1], [-300, 0]);
  const boltScale = interpolate(boltSpring, [0, 0.7, 1], [0.3, 1.15, 1]);
  const boltRotate = interpolate(boltSpring, [0, 1], [-30, 0]);

  // Trail afterglow - follows bolt down
  const trailOpacity = interpolate(frame, [0, 5, 15], [0, 0.6, 0], {
    extrapolateRight: "clamp",
  });
  const trailLength = interpolate(frame, [0, 8], [0, 250], {
    extrapolateRight: "clamp",
  });

  // Impact flash
  const impactFlash = interpolate(frame, [0, 4, 12], [0, 1, 0], {
    extrapolateRight: "clamp",
  });

  // Glow pulse on beat
  const glowPulse = beat.isOnBeat(frame) ? 1.5 : 1;

  // === TEXT: "zarf.to" - Beat 3 (frame 30) ===
  const letters = "zarf.to".split("");
  const textStart = beat.at(2);

  // === SHOCKWAVE ===
  const shockwaveScale = interpolate(frame, [0, 20], [0.5, 3], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const shockwaveOpacity = interpolate(frame, [0, 5, 20], [0, 0.4, 0], {
    extrapolateRight: "clamp",
  });

  // Secondary shockwave
  const shockwave2Scale = interpolate(frame, [3, 25], [0.5, 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const shockwave2Opacity = interpolate(frame, [3, 8, 25], [0, 0.25, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Impact position
  const impactY = layout.center.y - 50;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        transform: `translate(${shakeX}px, ${shakeY}px)`,
      }}
    >
      <GrainOverlay opacity={0.4} fadeInStart={0} fadeInDuration={1} />

      {/* Impact shockwaves */}
      <AbsoluteFill
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: impactY - 100,
            width: 200,
            height: 200,
            borderRadius: "50%",
            border: `2px solid ${colors.fg}`,
            transform: `scale(${shockwaveScale})`,
            opacity: shockwaveOpacity,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: impactY - 100,
            width: 200,
            height: 200,
            borderRadius: "50%",
            border: `1px solid ${colors.fg}`,
            transform: `scale(${shockwave2Scale})`,
            opacity: shockwave2Opacity,
          }}
        />
      </AbsoluteFill>

      {/* Electric sparks on impact */}
      <Spark
        triggerFrame={2}
        x={layout.center.x}
        y={impactY + 50}
        count={12}
        color={colors.fg}
      />
      <Spark
        triggerFrame={4}
        x={layout.center.x - 30}
        y={impactY + 40}
        count={6}
        color={colors.fgMuted}
      />
      <Spark
        triggerFrame={4}
        x={layout.center.x + 30}
        y={impactY + 40}
        count={6}
        color={colors.fgMuted}
      />

      {/* Impact flash overlay */}
      <AbsoluteFill
        style={{
          backgroundColor: colors.fg,
          opacity: impactFlash * 0.2,
          mixBlendMode: "overlay",
        }}
      />

      {/* Main content */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 32,
        }}
      >
        {/* Trail afterglow */}
        {trailOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              top: layout.center.y - 200 - trailLength,
              left: layout.center.x - 15,
              width: 30,
              height: trailLength,
              background: `linear-gradient(to bottom, transparent, ${colors.fg})`,
              opacity: trailOpacity,
              filter: "blur(8px)",
            }}
          />
        )}

        {/* Lightning Bolt - SLAMS in */}
        <div
          style={{
            transform: `
              translateY(${boltY}px)
              scale(${boltScale})
              rotate(${boltRotate}deg)
            `,
            filter: `drop-shadow(0 0 ${30 * glowPulse}px rgba(230,230,232,0.6))`,
          }}
        >
          <svg width={140} height={140} viewBox="0 0 24 24">
            <path
              d="M13 10V3L4 14h7v7l9-11h-7z"
              fill={colors.fg}
              stroke="none"
            />
          </svg>
        </div>

        {/* Text: zarf.to - letters SNAP in */}
        <div
          style={{
            display: "flex",
            fontFamily: typography.sans,
            fontSize: typography.hero,
            fontWeight: typography.bold,
            letterSpacing: "-0.04em",
          }}
        >
          {letters.map((letter, i) => {
            // Staggered but FAST - 2 frames apart
            const letterDelay = textStart + i * 2;
            const letterSpring = spring({
              frame: frame - letterDelay,
              fps,
              config: springs.snap,
            });

            // Pop up with scale overshoot
            const y = interpolate(letterSpring, [0, 1], [60, 0]);
            const scale = interpolate(letterSpring, [0, 0.6, 1], [0.5, 1.1, 1]);
            const opacity = interpolate(letterSpring, [0, 0.3], [0, 1], {
              extrapolateRight: "clamp",
            });

            // Glow burst on letter landing
            const glowBurst = interpolate(
              frame,
              [letterDelay + 3, letterDelay + 8, letterDelay + 15],
              [0, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  transform: `translateY(${y}px) scale(${scale})`,
                  opacity,
                  color: colors.fg,
                  textShadow: glowBurst > 0
                    ? `0 0 ${20 * glowBurst}px rgba(230,230,232,${glowBurst * 0.8})`
                    : "none",
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* Ground impact glow */}
      <div
        style={{
          position: "absolute",
          left: layout.center.x - 150,
          top: impactY + 80,
          width: 300,
          height: 40,
          background: `radial-gradient(ellipse, ${colors.fg} 0%, transparent 70%)`,
          opacity: interpolate(frame, [0, 5, 20], [0, 0.3, 0], {
            extrapolateRight: "clamp",
          }),
          filter: "blur(15px)",
        }}
      />
    </AbsoluteFill>
  );
};

export default BoltAndNameScene;
