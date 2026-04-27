import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring } from "remotion";
import { colors, typography, layout, springs, beat, radius } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { GlowBurst } from "../components/GlowBurst";

/**
 * Scene 03: Use Cases
 * Three dramatic cards - no cheap labels
 */
export const UseCasesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  const cases = [
    {
      title: "CAP TABLES",
      desc: "Private equity rounds",
      icon: "◈",
    },
    {
      title: "PAYROLL",
      desc: "Global token compensation",
      icon: "◎",
    },
    {
      title: "AIRDROPS",
      desc: "Stealth distributions",
      icon: "⬡",
    },
  ];

  const cardWidth = 520;
  const cardHeight = 320;
  const gap = 40;
  const totalWidth = cardWidth * 3 + gap * 2;
  const startX = layout.center.x - totalWidth / 2;
  const cardY = layout.center.y - cardHeight / 2;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050506" }}>
      <GrainOverlay opacity={0.4} fadeInStart={0} fadeInDuration={3} />

      {/* Ambient glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 100%, rgba(230,230,232,0.03) 0%, transparent 50%)`,
        }}
      />

      {/* Cards - slight stagger, almost together */}
      {cases.map((item, i) => {
        const cardDelay = beat.at(0.5) + i * 4; // 4 frames stagger (~0.13 seconds)
        const cardSpring = spring({
          frame: frame - cardDelay,
          fps,
          config: { damping: 14, stiffness: 180, mass: 0.6 },
        });

        const y = interpolate(cardSpring, [0, 1], [80, 0]);
        const rotateX = interpolate(cardSpring, [0, 1], [12, 0]);
        const scale = interpolate(cardSpring, [0, 0.6, 1], [0.88, 1.02, 1]);
        const opacity = interpolate(cardSpring, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });

        const cardX = startX + i * (cardWidth + gap);

        // Hover glow effect
        const glowPulse = Math.sin((frame - cardDelay) * 0.05) * 0.5 + 0.5;

        return (
          <React.Fragment key={item.title}>
            <GlowBurst
              triggerFrame={cardDelay}
              x={cardX + cardWidth / 2}
              y={cardY + cardHeight / 2}
              startSize={50}
              endSize={300}
              duration={30}
              maxOpacity={0.15}
              variant="soft"
            />

            <div
              style={{
                position: "absolute",
                left: cardX,
                top: cardY,
                width: cardWidth,
                height: cardHeight,
                borderRadius: radius["3xl"],
                border: `1px solid rgba(230,230,232,${0.08 + glowPulse * 0.04})`,
                background: `linear-gradient(160deg, rgba(230,230,232,0.04) 0%, rgba(230,230,232,0.01) 100%)`,
                padding: 56,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                transform: `translateY(${y}px) perspective(1000px) rotateX(${rotateX}deg) scale(${scale})`,
                opacity,
                boxShadow: `
                  0 40px 80px -20px rgba(0,0,0,0.5),
                  0 0 ${40 + glowPulse * 20}px rgba(230,230,232,${0.02 + glowPulse * 0.02})
                `,
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: radius.xl,
                  border: `1px solid rgba(230,230,232,0.1)`,
                  background: "rgba(230,230,232,0.03)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 36,
                  color: colors.fg,
                  fontFamily: typography.sans,
                }}
              >
                {item.icon}
              </div>

              <div>
                {/* Title */}
                <div
                  style={{
                    fontFamily: typography.sans,
                    fontSize: 52,
                    fontWeight: 800,
                    letterSpacing: "-0.04em",
                    color: colors.fg,
                    marginBottom: 12,
                  }}
                >
                  {item.title}
                </div>

                {/* Description */}
                <div
                  style={{
                    fontFamily: typography.sans,
                    fontSize: 20,
                    fontWeight: typography.regular,
                    color: colors.fgSubtle,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {item.desc}
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {/* Bottom tagline */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(frame, [beat.at(4), beat.at(4) + 20], [0, 0.5], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span
          style={{
            fontFamily: typography.mono,
            fontSize: 14,
            fontWeight: typography.medium,
            color: colors.fgSubtle,
            letterSpacing: "0.15em",
          }}
        >
          PRIVACY-FIRST DISTRIBUTION
        </span>
      </div>
    </AbsoluteFill>
  );
};

export default UseCasesScene;
