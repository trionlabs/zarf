import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from "remotion";
import { colors, typography, layout, springs, beat } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";

/**
 * Scene 04: The Flow
 * 120 BPM - Email → ZK → Wallet flow
 * Enhanced: Multiple staggered particles with trails, hex encryption effect,
 * path glow on particle pass, icon breathing animations
 */
export const FlowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  // Layout
  const centerX = layout.center.x;
  const centerY = layout.center.y;
  const emailX = layout.thirds.x1 - 40;
  const walletX = layout.thirds.x2 + 40;
  const zkCenterY = centerY;
  const iconSize = 90;

  // === EMAIL - Beat 1 (frame 0) ===
  const emailSpring = spring({
    frame,
    fps,
    config: springs.punch,
  });
  const emailX_anim = interpolate(emailSpring, [0, 1], [-200, 0]);
  const emailScale = interpolate(emailSpring, [0, 0.6, 1], [0.3, 1.15, 1]);
  const emailRotate = interpolate(emailSpring, [0, 1], [-15, 0]);

  // Icon breathing animation
  const emailBreath = 1 + Math.sin(frame * 0.08) * 0.02;

  // === PATH - Beat 3 (frame 30) ===
  const pathStart = beat.at(2);
  const pathProgress = interpolate(
    frame,
    [pathStart, pathStart + beat.toFrames(3)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  // === ZK CORE - Beat 4 (frame 45) ===
  const zkStart = beat.at(3);
  const zkSpring = spring({
    frame: frame - zkStart,
    fps,
    config: springs.bounce,
  });
  const zkScale = interpolate(zkSpring, [0, 0.5, 1], [0, 1.3, 1]);
  const zkPulse = 1 + Math.sin(frame * 0.3) * 0.1;

  // ZK Rings
  const rings = [0, 1, 2].map((i) => {
    const ringSpring = spring({
      frame: frame - zkStart - i * 3,
      fps,
      config: springs.snap,
    });
    return {
      scale: interpolate(ringSpring, [0, 1], [0, 1]),
      opacity: interpolate(ringSpring, [0, 0.5, 1], [0, 0.4 - i * 0.1, 0.25 - i * 0.08]),
      rotate: (frame - zkStart) * (i % 2 === 0 ? 1.5 : -1.5),
    };
  });

  // === WALLET - Beat 6 (frame 75) ===
  const walletStart = beat.at(5);
  const walletSpring = spring({
    frame: frame - walletStart,
    fps,
    config: springs.punch,
  });
  const walletX_anim = interpolate(walletSpring, [0, 1], [200, 0]);
  const walletScale = interpolate(walletSpring, [0, 0.6, 1], [0.3, 1.15, 1]);
  const walletRotate = interpolate(walletSpring, [0, 1], [15, 0]);

  // Icon breathing animation
  const walletBreath = 1 + Math.sin(frame * 0.08 + 1) * 0.02;

  // === MULTIPLE PARTICLES - Beat 7 (frame 90) ===
  const particleStart = beat.at(6);
  const particleEnd = beat.at(10);
  const particleCount = 5;
  const particleStagger = 3; // frames between particles

  // Bezier path for particles
  const pathOffset = iconSize / 2 + 15;
  const getPointOnPath = (t: number) => {
    const p0 = { x: emailX + pathOffset, y: centerY };
    const p3 = { x: walletX - pathOffset, y: centerY };
    const mid = { x: centerX, y: zkCenterY };

    if (t < 0.5) {
      const t2 = t * 2;
      const x = p0.x + (mid.x - p0.x) * t2;
      const y = p0.y + (mid.y - p0.y - 60 * Math.sin(t2 * Math.PI)) * t2;
      return { x, y };
    } else {
      const t2 = (t - 0.5) * 2;
      const x = mid.x + (p3.x - mid.x) * t2;
      const y = mid.y + (p3.y - mid.y + 60 * Math.sin(t2 * Math.PI)) * t2;
      return { x, y };
    }
  };

  // Generate particle data
  const particles = Array.from({ length: particleCount }, (_, i) => {
    const particleDelay = i * particleStagger;
    const particleProgress = interpolate(
      frame,
      [particleStart + particleDelay, particleEnd + particleDelay],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }
    );

    const pos = getPointOnPath(particleProgress);
    const size = interpolate(particleProgress, [0, 0.5, 1], [8, 16, 8]);
    const glow = interpolate(particleProgress, [0.3, 0.5, 0.7], [0, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    // Trail positions (previous positions)
    const trailCount = 6;
    const trails = Array.from({ length: trailCount }, (_, ti) => {
      const trailProgress = Math.max(0, particleProgress - (ti + 1) * 0.03);
      const trailPos = getPointOnPath(trailProgress);
      return {
        x: trailPos.x,
        y: trailPos.y,
        opacity: (1 - (ti + 1) / (trailCount + 1)) * 0.5,
        size: size * (1 - (ti + 1) / (trailCount + 2)),
      };
    });

    return {
      progress: particleProgress,
      pos,
      size,
      glow,
      trails,
      active: particleProgress > 0 && particleProgress < 1,
    };
  });

  // Path glow intensity based on particle proximity
  const pathGlowIntensity = particles.reduce((max, p) => {
    if (!p.active) return max;
    const glowAtProgress = p.glow;
    return Math.max(max, glowAtProgress);
  }, 0);

  // === HEX ENCRYPTION EFFECT ===
  const hexChars = "0123456789ABCDEF";
  const hexEffectStart = zkStart + 10;
  const hexEffectDuration = 40;
  const hexVisible = frame >= hexEffectStart && frame < hexEffectStart + hexEffectDuration;

  const hexParticles = React.useMemo(() => {
    return Array.from({ length: 16 }, (_, i) => ({
      angle: (i / 16) * Math.PI * 2,
      radius: 70 + (i % 3) * 20,
      char: hexChars[Math.floor(Math.random() * 16)],
      delay: i * 2,
    }));
  }, []);

  // Path SVG
  const pathD = `
    M ${emailX + pathOffset} ${centerY}
    Q ${(emailX + centerX) / 2} ${centerY - 80}, ${centerX} ${zkCenterY}
    Q ${(centerX + walletX) / 2} ${centerY + 80}, ${walletX - pathOffset} ${centerY}
  `;
  const pathLength = 900;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <GrainOverlay opacity={0.35} fadeInStart={0} fadeInDuration={1} />

      {/* Path SVG */}
      <svg
        style={{ position: "absolute", top: 0, left: 0 }}
        width={layout.width}
        height={layout.height}
      >
        {/* Glow path - intensifies when particles pass */}
        <path
          d={pathD}
          fill="none"
          stroke={`rgba(230,230,232,${0.08 + pathGlowIntensity * 0.15})`}
          strokeWidth={30 + pathGlowIntensity * 20}
          strokeDasharray={pathLength}
          strokeDashoffset={pathLength * (1 - pathProgress)}
          strokeLinecap="round"
          filter="blur(15px)"
        />

        {/* Main path */}
        <path
          d={pathD}
          fill="none"
          stroke={`rgba(230,230,232,${0.25 + pathGlowIntensity * 0.2})`}
          strokeWidth={2}
          strokeDasharray={pathLength}
          strokeDashoffset={pathLength * (1 - pathProgress)}
          strokeLinecap="round"
        />

        {/* ZK Rings */}
        <g transform={`translate(${centerX}, ${zkCenterY})`}>
          {rings.map((ring, i) => (
            <circle
              key={i}
              cx={0}
              cy={0}
              r={35 + i * 25}
              fill="none"
              stroke={colors.fg}
              strokeWidth={1.5}
              opacity={ring.opacity}
              transform={`scale(${ring.scale}) rotate(${ring.rotate})`}
              strokeDasharray={i % 2 === 0 ? "8 4" : "none"}
            />
          ))}

          {/* Core */}
          <circle
            cx={0}
            cy={0}
            r={18}
            fill={colors.fg}
            opacity={0.7 * zkScale}
            transform={`scale(${zkScale * zkPulse})`}
          />
          <circle
            cx={0}
            cy={0}
            r={28}
            fill="none"
            stroke={colors.fg}
            strokeWidth={2}
            opacity={0.5 * zkScale}
            transform={`scale(${zkScale})`}
          />
        </g>

        {/* Hex encryption characters */}
        {hexVisible && hexParticles.map((hex, i) => {
          const hexProgress = interpolate(
            frame,
            [hexEffectStart + hex.delay, hexEffectStart + hex.delay + 20],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const hexOpacity = interpolate(hexProgress, [0, 0.3, 0.7, 1], [0, 0.6, 0.4, 0]);
          const rotatedAngle = hex.angle + (frame - hexEffectStart) * 0.03;

          return (
            <text
              key={i}
              x={centerX + Math.cos(rotatedAngle) * hex.radius}
              y={zkCenterY + Math.sin(rotatedAngle) * hex.radius}
              fill={colors.fg}
              opacity={hexOpacity}
              fontSize={10}
              fontFamily={typography.mono}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {hexChars[(i + Math.floor(frame / 3)) % 16]}
            </text>
          );
        })}
      </svg>

      {/* Particle trails and main particles */}
      {particles.map((particle, pi) => particle.active && (
        <React.Fragment key={pi}>
          {/* Trails */}
          {particle.trails.map((trail, ti) => (
            <div
              key={`trail-${pi}-${ti}`}
              style={{
                position: "absolute",
                left: trail.x - trail.size / 2,
                top: trail.y - trail.size / 2,
                width: trail.size,
                height: trail.size,
                borderRadius: "50%",
                backgroundColor: colors.fg,
                opacity: trail.opacity * (particle.progress > 0.1 ? 1 : 0),
              }}
            />
          ))}

          {/* Main particle */}
          <div
            style={{
              position: "absolute",
              left: particle.pos.x - particle.size / 2,
              top: particle.pos.y - particle.size / 2,
              width: particle.size,
              height: particle.size,
              borderRadius: "50%",
              backgroundColor: colors.fg,
              boxShadow: `
                0 0 ${25 + particle.glow * 40}px rgba(230,230,232,${0.6 + particle.glow * 0.4}),
                0 0 ${50 + particle.glow * 80}px rgba(230,230,232,${0.3 + particle.glow * 0.3})
              `,
            }}
          />
        </React.Fragment>
      ))}

      {/* Email icon with breathing */}
      <div
        style={{
          position: "absolute",
          left: emailX - iconSize / 2 + emailX_anim,
          top: centerY - iconSize / 2,
          width: iconSize,
          height: iconSize,
          borderRadius: 22,
          border: `2px solid rgba(230,230,232,0.25)`,
          background: "rgba(230,230,232,0.04)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${emailScale * emailBreath}) rotate(${emailRotate}deg)`,
          boxShadow: "0 15px 50px -15px rgba(0,0,0,0.6)",
        }}
      >
        <span style={{ fontSize: iconSize * 0.5, fontWeight: 300, color: colors.fgMuted }}>@</span>
      </div>

      {/* Wallet icon with breathing */}
      <div
        style={{
          position: "absolute",
          left: walletX - iconSize / 2 + walletX_anim,
          top: centerY - iconSize / 2,
          width: iconSize,
          height: iconSize,
          borderRadius: 22,
          border: `2px solid rgba(230,230,232,0.35)`,
          background: "rgba(230,230,232,0.06)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transform: `scale(${walletScale * walletBreath}) rotate(${walletRotate}deg)`,
          boxShadow: "0 15px 50px -15px rgba(0,0,0,0.6)",
        }}
      >
        <svg width={iconSize * 0.45} height={iconSize * 0.45} viewBox="0 0 24 24" fill="none">
          <rect x={2} y={5} width={20} height={16} rx={3} stroke={colors.fg} strokeWidth={1.5} />
          <rect x={14} y={10} width={6} height={6} rx={1.5} fill={colors.fgMuted} />
        </svg>
      </div>

      {/* "ZK" label */}
      <div
        style={{
          position: "absolute",
          left: centerX - 50,
          top: zkCenterY + 55,
          width: 100,
          textAlign: "center",
          opacity: interpolate(frame, [zkStart + 15, zkStart + 25], [0, 0.6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span
          style={{
            fontFamily: typography.mono,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.25em",
            color: colors.fgSubtle,
          }}
        >
          ZERO KNOWLEDGE
        </span>
      </div>
    </AbsoluteFill>
  );
};

export default FlowScene;
