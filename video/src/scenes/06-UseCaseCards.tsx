import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from "remotion";
import { colors, typography, layout, grid, radius, springs, beat, copy } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";

/**
 * Scene 06: Use Case Cards
 * 120 BPM - Cards SNAP in with stagger
 * Enhanced: Icon micro-animations, connecting lines, holographic shimmer, unified glow
 */
export const UseCaseCardsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fps = 30;

  const cardWidth = 300;
  const cardHeight = 200;
  const cardPositions = grid.distribute(3, cardWidth);
  const cardY = grid.centerY(cardHeight);

  // Entry directions for each card
  const entryConfigs = [
    { x: -300, y: 0, rotate: -20, delay: 0 },
    { x: 0, y: -250, rotate: 0, delay: beat.at(1) },
    { x: 300, y: 0, rotate: 20, delay: beat.at(2) },
  ];

  // Icon animations
  const getIconAnimation = (iconType: string, cardDelay: number) => {
    const relativeFrame = frame - cardDelay - 20; // Start after card lands

    switch (iconType) {
      case "eye": {
        // Blink animation (scale Y 1→0.1→1)
        const blinkCycle = Math.floor(relativeFrame / 60);
        const blinkProgress = (relativeFrame % 60) / 60;
        const isBlinking = blinkProgress > 0.4 && blinkProgress < 0.6;
        const scaleY = isBlinking
          ? interpolate(blinkProgress, [0.4, 0.5, 0.6], [1, 0.1, 1])
          : 1;
        return { scaleY, scaleX: 1, rotate: 0 };
      }
      case "globe": {
        // Slow continuous rotation
        const rotate = relativeFrame > 0 ? relativeFrame * 0.8 : 0;
        return { scaleY: 1, scaleX: 1, rotate };
      }
      case "gift": {
        // Subtle bounce
        const bounce = relativeFrame > 0 ? Math.sin(relativeFrame * 0.15) * 3 : 0;
        const scale = relativeFrame > 0 ? 1 + Math.sin(relativeFrame * 0.1) * 0.05 : 1;
        return { scaleY: scale, scaleX: scale, rotate: 0, translateY: bounce };
      }
      default:
        return { scaleY: 1, scaleX: 1, rotate: 0 };
    }
  };

  // Icons with animation support
  const renderIcon = (iconType: string, anim: ReturnType<typeof getIconAnimation>) => {
    const style: React.CSSProperties = {
      transform: `scaleY(${anim.scaleY}) scaleX(${anim.scaleX}) rotate(${anim.rotate}deg) translateY(${anim.translateY || 0}px)`,
      transition: "transform 0.1s ease-out",
    };

    switch (iconType) {
      case "eye":
        return (
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={colors.fg} strokeWidth={1.5} style={style}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        );
      case "globe":
        return (
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={colors.fg} strokeWidth={1.5} style={style}>
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" />
          </svg>
        );
      case "gift":
        return (
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={colors.fg} strokeWidth={1.5} style={style}>
            <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const iconTypes = ["eye", "globe", "gift"];

  // Calculate when all cards have landed
  const allCardsLanded = frame > entryConfigs[2].delay + 30;

  // Connection lines between cards
  const connectionLineOpacity = allCardsLanded
    ? interpolate(frame, [entryConfigs[2].delay + 30, entryConfigs[2].delay + 50], [0, 0.15], {
        extrapolateRight: "clamp",
      })
    : 0;

  // Holographic shimmer
  const shimmerOffset = (frame * 3) % (cardWidth + 200);

  // Unified glow intensity
  const unifiedGlowIntensity = allCardsLanded
    ? 0.08 + Math.sin(frame * 0.05) * 0.03
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      <GrainOverlay opacity={0.35} fadeInStart={0} fadeInDuration={1} />

      {/* Background glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, rgba(230,230,232,0.04) 0%, transparent 50%)`,
        }}
      />

      {/* Connection lines between cards */}
      {allCardsLanded && (
        <svg
          style={{ position: "absolute", top: 0, left: 0 }}
          width={layout.width}
          height={layout.height}
        >
          {/* Line from card 1 to card 2 */}
          <line
            x1={cardPositions[0] + cardWidth}
            y1={cardY + cardHeight / 2}
            x2={cardPositions[1]}
            y2={cardY + cardHeight / 2}
            stroke={colors.fg}
            strokeWidth={1}
            strokeDasharray="6 4"
            opacity={connectionLineOpacity}
          />
          {/* Line from card 2 to card 3 */}
          <line
            x1={cardPositions[1] + cardWidth}
            y1={cardY + cardHeight / 2}
            x2={cardPositions[2]}
            y2={cardY + cardHeight / 2}
            stroke={colors.fg}
            strokeWidth={1}
            strokeDasharray="6 4"
            opacity={connectionLineOpacity}
          />
          {/* Connection dots */}
          {[0, 1, 2].map((i) => (
            <React.Fragment key={i}>
              {i < 2 && (
                <>
                  <circle
                    cx={cardPositions[i] + cardWidth + 5}
                    cy={cardY + cardHeight / 2}
                    r={3}
                    fill={colors.fg}
                    opacity={connectionLineOpacity}
                  />
                  <circle
                    cx={cardPositions[i + 1] - 5}
                    cy={cardY + cardHeight / 2}
                    r={3}
                    fill={colors.fg}
                    opacity={connectionLineOpacity}
                  />
                </>
              )}
            </React.Fragment>
          ))}
        </svg>
      )}

      {/* Unified glow behind cards */}
      <div
        style={{
          position: "absolute",
          left: cardPositions[0] - 50,
          top: cardY - 50,
          width: cardPositions[2] + cardWidth - cardPositions[0] + 100,
          height: cardHeight + 100,
          background: `radial-gradient(ellipse at center, ${colors.fg} 0%, transparent 70%)`,
          opacity: unifiedGlowIntensity,
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      {copy.useCases.map((card, i) => {
        const config = entryConfigs[i];
        const cardSpring = spring({
          frame: frame - config.delay,
          fps,
          config: springs.punch,
        });

        const x = interpolate(cardSpring, [0, 1], [config.x, 0]);
        const y = interpolate(cardSpring, [0, 1], [config.y, 0]);
        const rotate = interpolate(cardSpring, [0, 1], [config.rotate, 0]);
        const scale = interpolate(cardSpring, [0, 0.6, 1], [0.7, 1.08, 1]);
        const opacity = interpolate(cardSpring, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });

        // Subtle float after landing
        const hasLanded = frame > config.delay + 20;
        const floatOffset = hasLanded ? Math.sin((frame - config.delay) * 0.12 + i) * 3 : 0;

        // Icon animation
        const iconAnim = getIconAnimation(iconTypes[i], config.delay);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cardPositions[i] + x,
              top: cardY + y + floatOffset,
              width: cardWidth,
              height: cardHeight,
              borderRadius: radius["2xl"],
              border: `1px solid rgba(230,230,232,0.12)`,
              background: `linear-gradient(145deg, rgba(230,230,232,0.06) 0%, rgba(230,230,232,0.02) 100%)`,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity,
              transform: `rotate(${rotate}deg) scale(${scale})`,
              boxShadow: `
                0 25px 50px -15px rgba(0,0,0,0.5),
                0 0 80px -30px rgba(230,230,232,0.1)
              `,
              overflow: "hidden",
            }}
          >
            {/* Holographic shimmer overlay */}
            {hasLanded && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: shimmerOffset - 100,
                  width: 100,
                  height: cardHeight,
                  background: `linear-gradient(90deg, transparent, rgba(230,230,232,0.08), transparent)`,
                  transform: "skewX(-20deg)",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Icon with animation */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.xl,
                background: "rgba(230,230,232,0.05)",
                border: "1px solid rgba(230,230,232,0.1)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {renderIcon(iconTypes[i], iconAnim)}
            </div>

            {/* Text */}
            <div>
              <div
                style={{
                  fontFamily: typography.mono,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.2em",
                  color: colors.fgSubtle,
                  marginBottom: 8,
                }}
              >
                {card.label}
              </div>
              <div
                style={{
                  fontFamily: typography.sans,
                  fontSize: 26,
                  fontWeight: typography.semibold,
                  color: colors.fg,
                  letterSpacing: "-0.02em",
                }}
              >
                {card.title}
              </div>
            </div>

            {/* Subtle border glow on hover-like state */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: radius["2xl"],
                border: `1px solid rgba(230,230,232,${hasLanded ? 0.05 + Math.sin((frame - config.delay) * 0.05 + i * 2) * 0.03 : 0})`,
                pointerEvents: "none",
              }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export default UseCaseCardsScene;
