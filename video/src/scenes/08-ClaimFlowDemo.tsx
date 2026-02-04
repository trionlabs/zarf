import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, typography, layout, beat, radius } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { GlowBurst } from "../components/GlowBurst";
import { MockProof, MockButton } from "../components/MockUI";

/**
 * Scene 08: Claim Flow Demo
 * Actual UI mockup - dark, dramatic, no cheap labels
 */
export const ClaimFlowDemoScene: React.FC = () => {
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

  // Step timing - tight stagger (nearly simultaneous)
  const baseDelay = beat.at(1.5);
  const verifyDelay = baseDelay;
  const proofDelay = baseDelay + 6;  // 6 frames later (~0.2s)
  const claimDelay = baseDelay + 12;  // 12 frames later (~0.4s)

  // Proof progress
  const proofProgress = interpolate(
    frame,
    [proofDelay, proofDelay + beat.toFrames(4)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Email verification completes quickly
  const emailVerified = frame >= verifyDelay + 20;

  // Token amount animation
  const tokenAmount = interpolate(
    frame,
    [claimDelay + 40, claimDelay + 70],
    [0, 25000],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Success state
  const isSuccess = frame >= claimDelay + 80;

  return (
    <AbsoluteFill style={{ backgroundColor: "#050506" }}>
      <GrainOverlay opacity={0.4} fadeInStart={0} fadeInDuration={3} />

      {/* Ambient glow */}
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

      {/* Success burst */}
      {isSuccess && (
        <GlowBurst
          triggerFrame={claimDelay + 80}
          x={layout.center.x}
          y={layout.center.y}
          startSize={50}
          endSize={1000}
          duration={30}
          maxOpacity={0.15}
          variant="soft"
        />
      )}

      {/* Main UI Card */}
      <div
        style={{
          position: "absolute",
          left: layout.center.x - 380,
          top: layout.center.y - 340,
          width: 760,
          transform: `translateY(${cardY}px) scale(${cardScale})`,
          opacity: cardOpacity,
        }}
      >
        <div
          style={{
            borderRadius: radius["3xl"],
            border: `1px solid rgba(230,230,232,${isSuccess ? 0.05 : 0.08})`,
            background: isSuccess
              ? "linear-gradient(160deg, rgba(74, 222, 128, 0.06) 0%, rgba(74, 222, 128, 0.02) 100%)"
              : "linear-gradient(160deg, rgba(230,230,232,0.04) 0%, rgba(230,230,232,0.01) 100%)",
            padding: 56,
            boxShadow: isSuccess
              ? "0 60px 120px -30px rgba(74, 222, 128, 0.2)"
              : "0 60px 120px -30px rgba(0,0,0,0.6)",
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 40, textAlign: "center" }}>
            <div
              style={{
                fontFamily: typography.mono,
                fontSize: 12,
                fontWeight: typography.semibold,
                color: isSuccess ? "rgba(74, 222, 128, 0.6)" : colors.fgFaint,
                letterSpacing: "0.2em",
                marginBottom: 16,
              }}
            >
              TOTAL UNLINKABILITY
            </div>
            <div
              style={{
                fontFamily: typography.sans,
                fontSize: 42,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: isSuccess ? "rgba(74, 222, 128, 1)" : colors.fg,
                marginBottom: 12,
              }}
            >
              {isSuccess ? "Claimed!" : "Claim Your Tokens"}
            </div>
            <div
              style={{
                fontFamily: typography.sans,
                fontSize: 18,
                color: colors.fgSubtle,
              }}
            >
              {isSuccess ? "Tokens transferred to your wallet" : "Claim to a fresh wallet, no identity leaks"}
            </div>
          </div>

          {/* Email verification step */}
          <div
            style={{
              marginBottom: 32,
              padding: 28,
              borderRadius: radius.xl,
              border: `1px solid ${emailVerified ? "rgba(74, 222, 128, 0.3)" : "rgba(230,230,232,0.08)"}`,
              background: emailVerified ? "rgba(74, 222, 128, 0.05)" : "rgba(230,230,232,0.02)",
              opacity: interpolate(frame, [verifyDelay, verifyDelay + 15], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: emailVerified ? "rgba(74, 222, 128, 0.15)" : "rgba(230,230,232,0.05)",
                  border: `1px solid ${emailVerified ? "rgba(74, 222, 128, 0.3)" : "rgba(230,230,232,0.1)"}`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 22,
                  color: emailVerified ? "rgba(74, 222, 128, 1)" : colors.fgMuted,
                }}
              >
                {emailVerified ? "✓" : "@"}
              </div>
              <div>
                <div style={{ fontFamily: typography.sans, fontSize: 18, fontWeight: typography.semibold, color: colors.fg }}>
                  Email Verified
                </div>
                <div style={{ fontFamily: typography.mono, fontSize: 14, color: colors.fgFaint }}>
                  investor@acme.vc
                </div>
              </div>
            </div>
          </div>

          {/* ZK Proof generation */}
          <div
            style={{
              marginBottom: 32,
              padding: 28,
              borderRadius: radius.xl,
              border: `1px solid ${proofProgress >= 1 ? "rgba(74, 222, 128, 0.3)" : "rgba(230,230,232,0.08)"}`,
              background: proofProgress >= 1 ? "rgba(74, 222, 128, 0.05)" : "rgba(230,230,232,0.02)",
              opacity: interpolate(frame, [proofDelay, proofDelay + 15], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: proofProgress >= 1 ? "rgba(74, 222, 128, 0.15)" : "rgba(230,230,232,0.05)",
                  border: `1px solid ${proofProgress >= 1 ? "rgba(74, 222, 128, 0.3)" : "rgba(230,230,232,0.1)"}`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontFamily: typography.mono,
                  fontSize: 14,
                  fontWeight: typography.bold,
                  color: proofProgress >= 1 ? "rgba(74, 222, 128, 1)" : colors.fgMuted,
                }}
              >
                {proofProgress >= 1 ? "✓" : "ZK"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: typography.sans, fontSize: 18, fontWeight: typography.semibold, color: colors.fg, marginBottom: 16 }}>
                  {proofProgress >= 1 ? "Proof Generated" : "Generating ZK Proof"}
                </div>
                <MockProof delay={proofDelay} duration={beat.toFrames(4)} />
              </div>
            </div>
          </div>

          {/* Token amount */}
          <div
            style={{
              marginBottom: 32,
              textAlign: "center",
              opacity: interpolate(frame, [claimDelay, claimDelay + 15], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div
              style={{
                fontFamily: typography.mono,
                fontSize: isSuccess ? 72 : 56,
                fontWeight: 300,
                color: isSuccess ? "rgba(74, 222, 128, 1)" : colors.fg,
                letterSpacing: "-0.02em",
              }}
            >
              {Math.floor(tokenAmount).toLocaleString()}
              <span style={{ fontSize: 24, marginLeft: 12, opacity: 0.7 }}>USDC</span>
            </div>
            <div
              style={{
                fontFamily: typography.mono,
                fontSize: 14,
                color: colors.fgFaint,
                marginTop: 8,
              }}
            >
              24-month vesting · 6-month cliff
            </div>
          </div>

          {/* Claim Button */}
          <div
            style={{
              opacity: interpolate(frame, [claimDelay + 20, claimDelay + 35], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <MockButton
              variant="primary"
              width="100%"
            >
              {isSuccess ? "✓ Tokens Received" : "Claim to Wallet"}
            </MockButton>
          </div>
        </div>
      </div>

    </AbsoluteFill>
  );
};

export default ClaimFlowDemoScene;
