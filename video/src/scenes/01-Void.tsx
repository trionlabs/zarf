import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, beat, layout } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { useBeatPulse } from "../components/BeatPulse";

/**
 * Scene 01: The Void
 * Frames 0-60 (0:00 - 0:02) - 4 beats at 120 BPM
 *
 * Pure black, then grain emerges from darkness
 * Enhanced: Breathing vignette, scanning light lines, center glow point
 * Feeling: "Something is about to happen"
 */
export const VoidScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Beat-synced vignette pulse (0.3 → 0.5 → 0.3)
  const vignettePulse = useBeatPulse(0.3, 0.5, 10);

  // Beat-synced grain intensity
  const grainPulse = useBeatPulse(0.35, 0.55, 8);

  // Center glow point - barely visible, pulsing
  const glowOpacity = useBeatPulse(0.02, 0.08, 12);
  const glowScale = useBeatPulse(0.8, 1.2, 10);

  // Scanning light lines - thin horizontal lines that flicker across
  const scanLines = React.useMemo(() => {
    return [
      { y: 0.25, speed: 0.8, delay: 5, opacity: 0.04 },
      { y: 0.45, speed: 1.2, delay: 15, opacity: 0.03 },
      { y: 0.65, speed: 0.6, delay: 25, opacity: 0.05 },
      { y: 0.85, speed: 1.0, delay: 35, opacity: 0.03 },
    ];
  }, []);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* Breathing vignette overlay */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${vignettePulse}) 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Subtle scanning light lines */}
      {scanLines.map((line, i) => {
        const lineFrame = frame - line.delay;
        if (lineFrame < 0) return null;

        // Line sweeps across screen
        const xProgress = (lineFrame * line.speed * 2) % (layout.width + 400);
        const isVisible = xProgress < layout.width + 200;

        // Flicker effect
        const flicker = Math.sin(frame * 0.5 + i * 2) > 0.3 ? 1 : 0.5;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: xProgress - 200,
              top: layout.height * line.y - 1,
              width: 400,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${colors.fgFaint}, transparent)`,
              opacity: isVisible ? line.opacity * flicker : 0,
              filter: "blur(1px)",
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* Center glow point - hint of what's coming */}
      <AbsoluteFill
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        {/* Outer soft glow */}
        <div
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.fgFaint} 0%, transparent 70%)`,
            opacity: glowOpacity * 0.5,
            transform: `scale(${glowScale})`,
            filter: "blur(30px)",
          }}
        />

        {/* Inner core dot */}
        <div
          style={{
            position: "absolute",
            width: 4,
            height: 4,
            borderRadius: "50%",
            backgroundColor: colors.fg,
            opacity: interpolate(frame, [20, 40], [0, glowOpacity * 3], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            boxShadow: `0 0 20px ${colors.fg}`,
          }}
        />
      </AbsoluteFill>

      {/* Grain with beat-synced intensity */}
      <GrainOverlay
        fadeInStart={15}
        fadeInDuration={45}
        opacity={grainPulse}
      />

      {/* Subtle edge glow that pulses */}
      <AbsoluteFill
        style={{
          boxShadow: `inset 0 0 150px rgba(230,230,232,${0.02 + vignettePulse * 0.02})`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

export default VoidScene;
