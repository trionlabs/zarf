import React from "react";
import { AbsoluteFill } from "remotion";
import { colors, timing } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import FingerprintRipples from "../components/FingerprintRipples";

/**
 * Scene 02: Fingerprint Emerges
 * Frames 60-120 (0:02 - 0:04) - 6 beats at 120 BPM
 *
 * Concentric rings expand from center - identity, privacy motif
 * Enhanced: Beat-synced ring expansion, rotating groups, orbiting particles
 * Feeling: "Identity. Pattern. Something personal."
 */
export const FingerprintScene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* Grain persists */}
      <GrainOverlay opacity={0.35} fadeInStart={0} fadeInDuration={1} />

      {/* Simplified fingerprint ripples - beatSynced disabled for debugging */}
      <FingerprintRipples
        fadeInStart={0}
        fadeInDuration={20}
        expandStart={0}
        expandDuration={90}
        opacity={0.6}
        originX="50%"
        originY="50%"
        beatSynced={false}
      />
    </AbsoluteFill>
  );
};

export default FingerprintScene;
