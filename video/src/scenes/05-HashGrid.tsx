import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, typography, layout } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { fadeIn, stagger, appleSlow } from "../lib/easings";

/**
 * Scene 05: Hash Grid & Private Claim Reveal
 * Uses LOCAL frames (0 = start of this sequence)
 */

function generateHash(seed: number): string {
  const hex = ((seed * 16807) % 2147483647).toString(16).padStart(8, "0");
  return `0x${hex.slice(0, 2)}....${hex.slice(-2)}`;
}

export const HashGridScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Grid configuration using layout system
  const cols = 6;
  const rows = 5;
  const cellWidth = layout.width / cols;
  const cellHeight = layout.height / rows;

  // Scene fade in
  const sceneOpacity = fadeIn(frame, 0, 20);

  // Reveal starts at local frame 60
  const revealStart = 60;
  const revealProgress = interpolate(
    frame,
    [revealStart, revealStart + 40],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: applySlow }
  );

  // Generate grid cells
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const x = col * cellWidth + cellWidth / 2;
      const y = row * cellHeight + cellHeight / 2;

      const isCenterRow = row === 2;
      const isCenterCol = col === 2 || col === 3;
      const isRevealCell = isCenterRow && isCenterCol;

      // Staggered entrance (local frames)
      const cellStart = stagger(frame, 10, index, 1);
      const hashOpacity = interpolate(
        frame,
        [cellStart, cellStart + 20],
        [0, isRevealCell ? 0.15 : 0.12],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      );

      if (isRevealCell) {
        const dimOpacity = interpolate(revealProgress, [0, 0.5], [0.15, 0]);
        cells.push(
          <div
            key={index}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: "translate(-50%, -50%)",
              fontFamily: typography.mono,
              fontSize: typography.hash,
              color: colors.fg,
              opacity: dimOpacity,
            }}
          >
            {generateHash(index)}
          </div>
        );
      } else {
        const dimFactor = interpolate(revealProgress, [0, 1], [1, 0.5]);
        cells.push(
          <div
            key={index}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: "translate(-50%, -50%)",
              fontFamily: typography.mono,
              fontSize: typography.hash,
              color: colors.fg,
              opacity: hashOpacity * dimFactor,
            }}
          >
            {generateHash(index)}
          </div>
        );
      }
    }
  }

  // "Private Claim" text reveal
  const revealOpacity = interpolate(
    frame,
    [revealStart + 10, revealStart + 40],
    [0, 0.7],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const revealScale = interpolate(
    frame,
    [revealStart + 10, revealStart + 40],
    [0.95, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: applySlow }
  );

  const spotlightOpacity = interpolate(
    frame,
    [revealStart, revealStart + 30],
    [0, 0.15],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, opacity: sceneOpacity }}>
      <GrainOverlay opacity={0.35} fadeInStart={0} fadeInDuration={1} />

      {cells}

      {/* Radial spotlight */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 300,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, ${colors.fg} 0%, transparent 70%)`,
          opacity: spotlightOpacity,
          pointerEvents: "none",
        }}
      />

      {/* "Private Claim" text */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${revealScale})`,
          opacity: revealOpacity,
          display: "flex",
          gap: 16,
        }}
      >
        <span
          style={{
            fontFamily: typography.sans,
            fontSize: 36,
            fontWeight: typography.light,
            color: colors.fg,
          }}
        >
          Private
        </span>
        <span
          style={{
            fontFamily: typography.sans,
            fontSize: 36,
            fontWeight: typography.semibold,
            color: colors.fg,
          }}
        >
          Claim
        </span>
      </div>
    </AbsoluteFill>
  );
};

const applySlow = appleSlow;

export default HashGridScene;
