import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, typography, layout, beat, radius } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { GlowBurst } from "../components/GlowBurst";
import { MockCard, MockInput, MockButton, MockTimeline } from "../components/MockUI";

/**
 * Scene 07: Create Flow Demo
 * Actual UI mockup - dark, dramatic, no cheap labels
 */
export const CreateFlowDemoScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Card animation - subtle, no overshoot
  const cardDelay = beat.at(0.5);
  const cardProgress = interpolate(
    frame,
    [cardDelay, cardDelay + 25],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const cardY = interpolate(cardProgress, [0, 1], [30, 0]);
  const cardOpacity = interpolate(cardProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
  const cardScale = interpolate(cardProgress, [0, 1], [0.97, 1]);

  // Form elements appear with tight stagger (nearly simultaneous)
  const baseDelay = beat.at(1.5);
  const tokenDelay = baseDelay;
  const scheduleDelay = baseDelay + 5;  // 5 frames later (~0.17s)
  const recipientsDelay = baseDelay + 10;  // 10 frames later (~0.33s)

  // Typing animation for email
  const emailText = "team@company.com";
  const emailProgress = interpolate(
    frame,
    [recipientsDelay, recipientsDelay + 45],
    [0, emailText.length],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Recipients counter
  const recipientCount = Math.min(
    8,
    Math.floor(interpolate(frame, [recipientsDelay + 30, recipientsDelay + 90], [0, 8], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }))
  );

  // Button appears after form elements
  const buttonDelay = baseDelay + 20;  // 20 frames after base (~0.67s)

  return (
    <AbsoluteFill style={{ backgroundColor: "#050506" }}>
      <GrainOverlay opacity={0.4} fadeInStart={0} fadeInDuration={3} />

      {/* Ambient glow behind card */}
      <GlowBurst
        triggerFrame={cardDelay}
        x={layout.center.x}
        y={layout.center.y}
        startSize={100}
        endSize={800}
        duration={60}
        maxOpacity={0.08}
        variant="soft"
      />

      {/* Main UI Card - Larger, cleaner */}
      <div
        style={{
          position: "absolute",
          left: layout.center.x - 420,
          top: layout.center.y - 340,
          width: 840,
          transform: `translateY(${cardY}px) scale(${cardScale})`,
          opacity: cardOpacity,
        }}
      >
        <div
          style={{
            borderRadius: radius["3xl"],
            border: "1px solid rgba(230,230,232,0.06)",
            background: "linear-gradient(165deg, rgba(20,20,22,0.95) 0%, rgba(10,10,12,0.98) 100%)",
            padding: 64,
            boxShadow: "0 80px 160px -40px rgba(0,0,0,0.7), 0 0 100px -50px rgba(230,230,232,0.05)",
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 56, textAlign: "center" }}>
            <div
              style={{
                fontFamily: typography.mono,
                fontSize: 12,
                fontWeight: typography.semibold,
                color: colors.fgFaint,
                letterSpacing: "0.2em",
                marginBottom: 16,
              }}
            >
              PROGRAMMABLE PRIVACY
            </div>
            <div
              style={{
                fontFamily: typography.sans,
                fontSize: 48,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: colors.fg,
                marginBottom: 16,
              }}
            >
              Create Distribution
            </div>
            <div
              style={{
                fontFamily: typography.sans,
                fontSize: 20,
                color: colors.fgSubtle,
              }}
            >
              Vesting schedules with on-chain compliance
            </div>
          </div>

          {/* Two column layout */}
          <div style={{ display: "flex", gap: 48 }}>
            {/* Left column */}
            <div style={{ flex: 1 }}>
              {/* Token Selection */}
              <div
                style={{
                  marginBottom: 36,
                  opacity: interpolate(frame, [tokenDelay, tokenDelay + 12], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div
                  style={{
                    fontFamily: typography.mono,
                    fontSize: 12,
                    fontWeight: typography.semibold,
                    color: colors.fgFaint,
                    marginBottom: 14,
                    letterSpacing: "0.15em",
                  }}
                >
                  TOKEN
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    padding: "24px 28px",
                    borderRadius: radius.xl,
                    border: "1px solid rgba(230,230,232,0.08)",
                    background: "rgba(230,230,232,0.02)",
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #2775CA 0%, #1A5FB4 100%)",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: 24,
                      fontWeight: "bold",
                      color: "#fff",
                    }}
                  >
                    $
                  </div>
                  <div>
                    <div style={{ fontFamily: typography.sans, fontSize: 22, fontWeight: typography.bold, color: colors.fg }}>
                      USDC
                    </div>
                    <div style={{ fontFamily: typography.mono, fontSize: 14, color: colors.fgFaint }}>
                      100,000 available
                    </div>
                  </div>
                </div>
              </div>

              {/* Recipients */}
              <div
                style={{
                  opacity: interpolate(frame, [recipientsDelay, recipientsDelay + 12], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      fontFamily: typography.mono,
                      fontSize: 12,
                      fontWeight: typography.semibold,
                      color: colors.fgFaint,
                      letterSpacing: "0.15em",
                    }}
                  >
                    RECIPIENTS
                  </div>
                  <div
                    style={{
                      fontFamily: typography.mono,
                      fontSize: 13,
                      color: colors.fgMuted,
                      background: "rgba(230,230,232,0.05)",
                      padding: "4px 10px",
                      borderRadius: radius.md,
                    }}
                  >
                    {recipientCount} added
                  </div>
                </div>
                <MockInput
                  value={emailText.slice(0, Math.floor(emailProgress))}
                  typing={true}
                  typingDelay={recipientsDelay}
                  placeholder="Enter email address"
                />
              </div>
            </div>

            {/* Right column - Vesting Schedule */}
            <div
              style={{
                flex: 1,
                opacity: interpolate(frame, [scheduleDelay, scheduleDelay + 12], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div
                style={{
                  fontFamily: typography.mono,
                  fontSize: 12,
                  fontWeight: typography.semibold,
                  color: colors.fgFaint,
                  marginBottom: 14,
                  letterSpacing: "0.15em",
                }}
              >
                VESTING SCHEDULE
              </div>
              <div
                style={{
                  padding: "28px",
                  borderRadius: radius.xl,
                  border: "1px solid rgba(230,230,232,0.08)",
                  background: "rgba(230,230,232,0.02)",
                }}
              >
                <MockTimeline delay={0} cliffMonths={6} vestingMonths={24} />
              </div>
            </div>
          </div>

          {/* Deploy Button */}
          <div
            style={{
              marginTop: 48,
              opacity: interpolate(frame, [buttonDelay, buttonDelay + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <MockButton variant="primary" width="100%">
              Deploy Distribution
            </MockButton>
          </div>
        </div>
      </div>

    </AbsoluteFill>
  );
};

export default CreateFlowDemoScene;
