import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { colors, typography, layout, grid } from "../lib/tokens";
import GrainOverlay from "../components/GrainOverlay";
import { strokeDraw, fadeIn } from "../lib/easings";

/**
 * Scene 07: Verification Ledger
 * Uses LOCAL frames (0 = start of this sequence)
 */

interface BlockData {
  y: number;
  width: number;
  delay: number;
}

const blocks: BlockData[] = [
  { y: 120, width: 280, delay: 0 },
  { y: 200, width: 240, delay: 15 },
  { y: 280, width: 300, delay: 30 },
  { y: 360, width: 220, delay: 45 },
];

export const VerificationLedgerScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Scene fade in (local frames 0-20)
  const fadeInOpacity = interpolate(
    frame,
    [0, 20],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Vertical chain line (local frames 10-40)
  const chainLength = 300;
  const { dashOffset: chainDashOffset } = strokeDraw(frame, 10, 30, chainLength);

  // Layout using grid system
  const chainX = layout.thirds.x1;  // Left third line
  const blockX = chainX + layout.gutter;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, opacity: fadeInOpacity }}>
      <GrainOverlay opacity={0.35} fadeInStart={0} fadeInDuration={1} />

      <svg
        style={{ position: "absolute", top: 0, left: 0 }}
        width={layout.width}
        height={layout.height}
      >
        {/* Vertical chain line */}
        <line
          x1={chainX}
          y1={80}
          x2={chainX}
          y2={400}
          stroke={colors.fgFaint}
          strokeWidth={0.75}
          strokeDasharray={chainLength}
          strokeDashoffset={chainDashOffset}
        />

        {/* Blocks */}
        {blocks.map((block, i) => {
          const blockStart = 30 + block.delay; // local frames

          const dotOpacity = fadeIn(frame, blockStart, 15);
          const dotScale = interpolate(
            frame,
            [blockStart, blockStart + 15],
            [0.5, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          const connectorOpacity = fadeIn(frame, blockStart + 5, 10);

          const blockPerimeter = (block.width + 30) * 2;
          const { dashOffset: blockDashOffset, opacity: blockOpacity } = strokeDraw(
            frame,
            blockStart + 10,
            25,
            blockPerimeter
          );

          const dataOpacity = fadeIn(frame, blockStart + 25, 15);

          const checkStart = blockStart + 35;
          const { dashOffset: checkDashOffset, opacity: checkOpacity } = strokeDraw(
            frame,
            checkStart,
            15,
            24
          );

          return (
            <g key={i}>
              <circle
                cx={chainX}
                cy={block.y}
                r={6}
                fill={colors.fg}
                opacity={dotOpacity * 0.5}
                transform={`scale(${dotScale})`}
                style={{ transformOrigin: `${chainX}px ${block.y}px` }}
              />

              <line
                x1={chainX + 6}
                y1={block.y}
                x2={blockX}
                y2={block.y}
                stroke={colors.fgFaint}
                strokeWidth={0.5}
                opacity={connectorOpacity}
              />

              <rect
                x={blockX}
                y={block.y - 15}
                width={block.width}
                height={30}
                rx={8}
                fill="none"
                stroke={colors.fgFaint}
                strokeWidth={0.75}
                strokeDasharray={blockPerimeter}
                strokeDashoffset={blockDashOffset}
                opacity={blockOpacity}
              />

              <line
                x1={blockX + 15}
                y1={block.y}
                x2={blockX + block.width - 50}
                y2={block.y}
                stroke={colors.fg}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={dataOpacity * 0.15}
              />

              <path
                d={`M ${blockX + block.width - 30} ${block.y - 4} l 6 6 l 10 -12`}
                fill="none"
                stroke={colors.fg}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={24}
                strokeDashoffset={checkDashOffset}
                opacity={checkOpacity * 0.5}
              />
            </g>
          );
        })}
      </svg>

      {/* "verified" badge (local frame 80+) */}
      <div
        style={{
          position: "absolute",
          left: blockX + 200,
          top: 420,
          opacity: fadeIn(frame, 80, 20),
          transform: `translateY(${interpolate(
            frame,
            [80, 100],
            [8, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          )}px)`,
        }}
      >
        <div
          style={{
            padding: "6px 16px",
            borderRadius: 12,
            backgroundColor: "rgba(230, 230, 232, 0.05)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontFamily: typography.mono,
              fontSize: 11,
              color: colors.fgMuted,
            }}
          >
            verified
          </span>
          <span style={{ fontSize: 11, color: colors.fgMuted }}>✓</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default VerificationLedgerScene;
