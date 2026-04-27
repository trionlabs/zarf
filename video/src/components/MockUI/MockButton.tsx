import React from "react";
import { colors, typography, radius } from "../../lib/tokens";

interface MockButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  pulseDelay?: number;
  pulseDuration?: number;
  icon?: React.ReactNode;
  width?: number | string;
}

/**
 * MockButton - Animated button
 * Primary: bg: rgba(230,230,232,1), text: #0A0A0B, radius: 12px
 * Secondary: bg: transparent, border, text: fg
 */
export const MockButton: React.FC<MockButtonProps> = ({
  children,
  variant = "primary",
  icon,
  width,
}) => {
  const isPrimary = variant === "primary";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "20px 40px",
        borderRadius: radius.lg,
        background: isPrimary ? colors.fg : "transparent",
        border: isPrimary ? "none" : `1px solid rgba(230, 230, 232, 0.2)`,
        fontFamily: typography.sans,
        fontSize: 18,
        fontWeight: typography.semibold,
        color: isPrimary ? colors.bg : colors.fg,
        letterSpacing: "-0.01em",
        boxShadow: isPrimary
          ? "0 4px 20px -5px rgba(0, 0, 0, 0.3)"
          : "none",
        width,
        cursor: "pointer",
      }}
    >
      {icon}
      {children}
    </div>
  );
};

export default MockButton;
