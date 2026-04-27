import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { colors, typography, radius } from "../../lib/tokens";

interface MockInputProps {
  label?: string;
  value: string;
  typing?: boolean;
  typingDelay?: number;
  typingSpeed?: number;
  placeholder?: string;
  icon?: React.ReactNode;
}

/**
 * MockInput - Input field with typing animation
 * bg: transparent, border: rgba(230,230,232,0.15), radius: 8px
 */
export const MockInput: React.FC<MockInputProps> = ({
  label,
  value,
  typing = false,
  typingDelay = 0,
  typingSpeed = 2,
  placeholder,
  icon,
}) => {
  const frame = useCurrentFrame();

  // Calculate visible characters based on frame
  const charsToShow = typing
    ? Math.min(
        value.length,
        Math.max(0, Math.floor((frame - typingDelay) / typingSpeed))
      )
    : value.length;

  const displayValue = value.slice(0, charsToShow);
  const showCursor = typing && charsToShow < value.length && frame > typingDelay;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {label && (
        <span
          style={{
            fontFamily: typography.sans,
            fontSize: 12,
            fontWeight: typography.medium,
            color: colors.fgSubtle,
            letterSpacing: "0.02em",
          }}
        >
          {label}
        </span>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderRadius: radius.md,
          border: `1px solid rgba(230, 230, 232, 0.15)`,
          background: "transparent",
        }}
      >
        {icon && (
          <div style={{ opacity: 0.5 }}>
            {icon}
          </div>
        )}
        <span
          style={{
            fontFamily: typography.mono,
            fontSize: 14,
            fontWeight: typography.regular,
            color: displayValue ? colors.fg : colors.fgFaint,
            letterSpacing: "-0.01em",
            flex: 1,
          }}
        >
          {displayValue || placeholder}
          {showCursor && (
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 16,
                backgroundColor: colors.fg,
                marginLeft: 2,
                verticalAlign: "text-bottom",
              }}
            />
          )}
        </span>
      </div>
    </div>
  );
};

export default MockInput;
