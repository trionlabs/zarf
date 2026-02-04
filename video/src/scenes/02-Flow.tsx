import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from "remotion";
import { colors, typography, layout, springs, beat, radius } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { GlowBurst } from "../components/GlowBurst";

/**
 * Scene 02: The Flow
 * Email → ZK → Wallet - Dark, dramatic, no cheap labels
 */
export const FlowScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  const centerY = layout.center.y;
  const spacing = 480;

  // Three nodes with dramatic styling
  const nodes = [
    { label: "EMAIL", icon: "@", sublabel: "recipient@company.com" },
    { label: "PROOF", icon: "ZK", sublabel: "Barretenberg" },
    { label: "CLAIM", icon: "⚡", sublabel: "On-chain" },
  ];

  const nodePositions = [
    layout.center.x - spacing,
    layout.center.x,
    layout.center.x + spacing,
  ];

  // Path progress
  const pathStart = beat.at(2);
  const pathProgress = interpolate(
    frame,
    [pathStart, pathStart + beat.toFrames(4)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  // Particle position along curved path
  const particleX = interpolate(
    pathProgress,
    [0, 0.5, 1],
    [nodePositions[0], nodePositions[1], nodePositions[2]]
  );
  const particleY = centerY - Math.sin(pathProgress * Math.PI) * 80;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050506" }}>
      <GrainOverlay opacity={0.4} fadeInStart={0} fadeInDuration={3} />

      {/* Deep ambient glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 60%, rgba(230,230,232,0.02) 0%, transparent 50%)`,
        }}
      />

      {/* Curved connection path */}
      <svg
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        width={layout.width}
        height={layout.height}
      >
        {/* Path glow */}
        <path
          d={`M ${nodePositions[0]} ${centerY} Q ${nodePositions[1]} ${centerY - 80}, ${nodePositions[2]} ${centerY}`}
          fill="none"
          stroke={colors.fg}
          strokeWidth={40}
          strokeDasharray={1000}
          strokeDashoffset={1000 * (1 - pathProgress)}
          opacity={0.03}
          filter="blur(20px)"
        />
        {/* Main path */}
        <path
          d={`M ${nodePositions[0]} ${centerY} Q ${nodePositions[1]} ${centerY - 80}, ${nodePositions[2]} ${centerY}`}
          fill="none"
          stroke="rgba(230,230,232,0.15)"
          strokeWidth={1}
          strokeDasharray={1000}
          strokeDashoffset={1000 * (1 - pathProgress)}
        />
      </svg>

      {/* Traveling energy particle */}
      {pathProgress > 0.02 && pathProgress < 0.98 && (
        <>
          <div
            style={{
              position: "absolute",
              left: particleX - 8,
              top: particleY - 8,
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: colors.fg,
              boxShadow: `0 0 30px ${colors.fg}, 0 0 60px ${colors.fg}, 0 0 100px ${colors.fg}`,
            }}
          />
          {/* Particle trail */}
          {[...Array(5)].map((_, i) => {
            const trailProgress = Math.max(0, pathProgress - i * 0.03);
            const trailX = interpolate(
              trailProgress,
              [0, 0.5, 1],
              [nodePositions[0], nodePositions[1], nodePositions[2]]
            );
            const trailY = centerY - Math.sin(trailProgress * Math.PI) * 80;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: trailX - 3,
                  top: trailY - 3,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: colors.fg,
                  opacity: 0.3 - i * 0.05,
                }}
              />
            );
          })}
        </>
      )}

      {/* Nodes */}
      {nodes.map((node, i) => {
        const nodeDelay = beat.at(i * 1.2);
        const nodeSpring = spring({
          frame: frame - nodeDelay,
          fps,
          config: springs.punch,
        });

        const scale = interpolate(nodeSpring, [0, 0.6, 1], [0.5, 1.05, 1]);
        const opacity = interpolate(nodeSpring, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });

        // Glow when particle passes
        const nodeProgress = i / 2;
        const isActive = Math.abs(pathProgress - nodeProgress) < 0.15;
        const glowIntensity = isActive ? 0.8 : 0.1;

        return (
          <React.Fragment key={node.label}>
            <GlowBurst
              triggerFrame={nodeDelay}
              x={nodePositions[i]}
              y={centerY}
              startSize={40}
              endSize={200}
              duration={25}
              maxOpacity={0.2}
              variant="soft"
            />

            <div
              style={{
                position: "absolute",
                left: nodePositions[i] - 120,
                top: centerY - 100,
                width: 240,
                textAlign: "center",
                opacity,
                transform: `scale(${scale})`,
              }}
            >
              {/* Node circle */}
              <div
                style={{
                  width: 120,
                  height: 120,
                  margin: "0 auto 20px",
                  borderRadius: "50%",
                  border: `1px solid rgba(230,230,232,${0.1 + glowIntensity * 0.2})`,
                  background: `rgba(230,230,232,${0.02 + glowIntensity * 0.05})`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: i === 1 ? 36 : 52,
                  color: colors.fg,
                  fontFamily: i === 1 ? typography.mono : typography.sans,
                  fontWeight: i === 1 ? typography.bold : typography.light,
                  boxShadow: `0 0 ${30 + glowIntensity * 50}px rgba(230,230,232,${glowIntensity * 0.3})`,
                }}
              >
                {node.icon}
              </div>

              {/* Label */}
              <div
                style={{
                  fontFamily: typography.sans,
                  fontSize: 28,
                  fontWeight: typography.bold,
                  letterSpacing: "-0.02em",
                  color: colors.fg,
                  marginBottom: 8,
                }}
              >
                {node.label}
              </div>

              {/* Sublabel */}
              <div
                style={{
                  fontFamily: typography.mono,
                  fontSize: 13,
                  fontWeight: typography.regular,
                  letterSpacing: "0.05em",
                  color: colors.fgFaint,
                }}
              >
                {node.sublabel}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {/* Arrows between nodes */}
      {[0, 1].map((i) => {
        const arrowDelay = beat.at(1.5 + i * 1.5);
        const arrowOpacity = interpolate(
          frame,
          [arrowDelay, arrowDelay + 15],
          [0, 0.4],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const arrowX = (nodePositions[i] + nodePositions[i + 1]) / 2;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: arrowX - 20,
              top: centerY - 10,
              fontSize: 32,
              color: colors.fg,
              opacity: arrowOpacity,
            }}
          >
            →
          </div>
        );
      })}

      {/* Bottom tagline */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(frame, [beat.at(5), beat.at(5) + 20], [0, 0.6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span
          style={{
            fontFamily: typography.sans,
            fontSize: 28,
            fontWeight: typography.medium,
            color: colors.fgMuted,
            letterSpacing: "-0.01em",
          }}
        >
          Like Web2, Built for Web3
        </span>
      </div>
    </AbsoluteFill>
  );
};

export default FlowScene;
