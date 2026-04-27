import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from "remotion";
import { colors, typography, layout, springs, beat, copy } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { ScreenFlash } from "../components/GlowBurst";

/**
 * Scene 08: The Resolve
 * 120 BPM - Dramatic finale
 * Enhanced: Spiral particle paths, ".to" domain highlight, final white flash, logo 3D flip
 */
export const ResolveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  // === SPIRAL IMPLODING PARTICLES ===
  const particleCount = 20;
  const particles = Array.from({ length: particleCount }, (_, i) => {
    const baseAngle = (i / particleCount) * Math.PI * 2;
    const startRadius = 500 + (i % 4) * 50;
    const delay = i * 0.6;

    const progress = spring({
      frame: frame - delay,
      fps,
      config: springs.snap,
    });

    // Spiral path - angle increases as radius decreases
    const spiralTurns = 1.5;
    const currentAngle = baseAngle + progress * Math.PI * 2 * spiralTurns;
    const radius = interpolate(progress, [0, 1], [startRadius, 0]);

    const x = Math.cos(currentAngle) * radius;
    const y = Math.sin(currentAngle) * radius;

    const opacity = interpolate(progress, [0, 0.2, 0.85, 1], [0, 0.8, 0.6, 0]);
    const size = interpolate(progress, [0, 0.5, 1], [3, 12, 4]);

    return { x, y, opacity, size, angle: currentAngle };
  });

  // === LOGO - Beat 3 with 3D flip ===
  const logoStart = beat.at(2);
  const logoSpring = spring({
    frame: frame - logoStart,
    fps,
    config: springs.bounce,
  });

  const logoScale = interpolate(logoSpring, [0, 0.4, 1], [0, 1.25, 1]);
  const logoRotateZ = interpolate(logoSpring, [0, 1], [180, 0]);
  // 3D flip effect - rotates on X axis
  const logoRotateX = interpolate(logoSpring, [0, 0.5, 1], [90, -10, 0]);

  // Glow burst
  const glowIntensity = interpolate(
    frame,
    [logoStart, logoStart + 6, logoStart + 25],
    [0, 1.5, 0.4],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // === TEXT "zarf.to" with domain highlight - Beat 5 ===
  const textStart = beat.at(4);
  const textSpring = spring({
    frame: frame - textStart,
    fps,
    config: springs.punch,
  });

  const textY = interpolate(textSpring, [0, 1], [50, 0]);
  const textScale = interpolate(textSpring, [0, 0.6, 1], [0.8, 1.05, 1]);
  const textOpacity = interpolate(textSpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });

  // ".to" domain highlight timing
  const domainHighlightStart = textStart + 15;
  const domainHighlightIntensity = interpolate(
    frame,
    [domainHighlightStart, domainHighlightStart + 8, domainHighlightStart + 30],
    [0, 1, 0.3],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // === TAGLINE - Beat 7 ===
  const taglineStart = beat.at(6);
  const taglineOpacity = interpolate(
    frame,
    [taglineStart, taglineStart + 12],
    [0, 0.5],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const taglineY = interpolate(
    frame,
    [taglineStart, taglineStart + 12],
    [15, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  // === SHOCKWAVE RINGS ===
  const rings = [0, 1, 2].map((i) => {
    const ringStart = logoStart + 2 + i * 4;
    const ringProgress = interpolate(
      frame,
      [ringStart, ringStart + 25],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    return {
      scale: interpolate(ringProgress, [0, 1], [0.3, 2.5 + i * 0.4]),
      opacity: interpolate(ringProgress, [0, 0.2, 1], [0, 0.25, 0]),
    };
  });

  // === FINAL FLASH before hold ===
  const finalFlashFrame = beat.at(8);

  // Particle trail effect
  const particleTrails = particles.flatMap((p, pi) =>
    Array.from({ length: 4 }, (_, ti) => {
      const trailDelay = (ti + 1) * 0.02;
      const trailAngle = p.angle - trailDelay * Math.PI * 3;
      const trailProgress = Math.max(0, 1 - Math.abs(p.x) / 500 - trailDelay);

      if (trailProgress <= 0) return null;

      const trailRadius = Math.sqrt(p.x * p.x + p.y * p.y) + 30 * (ti + 1);
      return {
        x: Math.cos(trailAngle) * trailRadius,
        y: Math.sin(trailAngle) * trailRadius,
        opacity: p.opacity * (1 - (ti + 1) / 5) * 0.4,
        size: p.size * 0.4,
      };
    })
  ).filter(Boolean);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <GrainOverlay opacity={0.4} fadeInStart={0} fadeInDuration={1} />

      {/* Spiral particle trails */}
      <AbsoluteFill>
        {particleTrails.map((p, i) => p && (
          <div
            key={`trail-${i}`}
            style={{
              position: "absolute",
              left: layout.center.x + p.x - p.size / 2,
              top: layout.center.y + p.y - p.size / 2,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: colors.fg,
              opacity: p.opacity,
            }}
          />
        ))}
      </AbsoluteFill>

      {/* Spiral converging particles */}
      <AbsoluteFill>
        {particles.map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: layout.center.x + p.x - p.size / 2,
              top: layout.center.y + p.y - p.size / 2,
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

      {/* Shockwave rings */}
      <AbsoluteFill
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {rings.map((ring, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 180,
              height: 180,
              borderRadius: "50%",
              border: `2px solid ${colors.fg}`,
              transform: `scale(${ring.scale})`,
              opacity: ring.opacity,
            }}
          />
        ))}
      </AbsoluteFill>

      {/* Final flash */}
      <ScreenFlash
        triggerFrame={finalFlashFrame}
        duration={8}
        maxOpacity={0.5}
      />

      {/* Main logo + text */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 28,
          perspective: "1000px",
        }}
      >
        {/* Logo with 3D flip and glow */}
        <div
          style={{
            transform: `scale(${logoScale}) rotateZ(${logoRotateZ}deg) rotateX(${logoRotateX}deg)`,
            transformStyle: "preserve-3d",
            filter: `drop-shadow(0 0 ${50 * glowIntensity}px rgba(230,230,232,0.9))`,
          }}
        >
          <svg width={160} height={160} viewBox="0 0 24 24">
            <path
              d="M13 10V3L4 14h7v7l9-11h-7z"
              fill={colors.fg}
            />
          </svg>
        </div>

        {/* "zarf.to" with ".to" highlight */}
        <div
          style={{
            transform: `translateY(${textY}px) scale(${textScale})`,
            opacity: textOpacity,
          }}
        >
          <span
            style={{
              fontFamily: typography.sans,
              fontSize: 72,
              fontWeight: typography.bold,
              letterSpacing: "-0.04em",
              color: colors.fg,
            }}
          >
            zarf
          </span>
          <span
            style={{
              fontFamily: typography.sans,
              fontSize: 72,
              fontWeight: typography.bold,
              letterSpacing: "-0.04em",
              color: colors.fg,
              textShadow: domainHighlightIntensity > 0
                ? `0 0 ${20 * domainHighlightIntensity}px rgba(230,230,232,${domainHighlightIntensity}),
                   0 0 ${40 * domainHighlightIntensity}px rgba(230,230,232,${domainHighlightIntensity * 0.5})`
                : "none",
              position: "relative",
            }}
          >
            .to
            {/* Underline glow for .to */}
            <span
              style={{
                position: "absolute",
                bottom: -4,
                left: 0,
                right: 0,
                height: 2,
                background: colors.fg,
                opacity: domainHighlightIntensity * 0.8,
                filter: `blur(${2 - domainHighlightIntensity}px)`,
              }}
            />
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            transform: `translateY(${taglineY}px)`,
            opacity: taglineOpacity,
          }}
        >
          <span
            style={{
              fontFamily: typography.sans,
              fontSize: typography.body,
              fontWeight: typography.light,
              color: colors.fgMuted,
              letterSpacing: "0.03em",
            }}
          >
            {copy.ctaSub}
          </span>
        </div>
      </AbsoluteFill>

      {/* Corner accents */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
          opacity: interpolate(frame, [taglineStart + 20, taglineStart + 35], [0, 0.4], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              backgroundColor: colors.fgMuted,
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export default ResolveScene;
