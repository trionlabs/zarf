import React from "react";
import { useCurrentFrame, spring, interpolate, Easing } from "remotion";
import { springs, beat } from "../lib/tokens";

type AnimationType = "fadeUp" | "fadeDown" | "scaleUp" | "typewriter" | "blur" | "split";
type Stagger = "character" | "word" | "line";

interface AnimatedTextProps {
  children: string;
  animation?: AnimationType;
  stagger?: Stagger;
  delay?: number;
  staggerDelay?: number; // frames between each unit
  style?: React.CSSProperties;
  springConfig?: typeof springs.snap;
}

/**
 * AnimatedText - Animate text character by character or word by word
 *
 * Usage:
 * <AnimatedText animation="fadeUp" stagger="character">Hello World</AnimatedText>
 * <AnimatedText animation="scaleUp" stagger="word" delay={15}>Hello World</AnimatedText>
 */
export const AnimatedText: React.FC<AnimatedTextProps> = ({
  children,
  animation = "fadeUp",
  stagger = "character",
  delay = 0,
  staggerDelay = 2,
  style = {},
  springConfig = springs.snap,
}) => {
  const frame = useCurrentFrame();
  const fps = 30;

  // Split text into units based on stagger type
  const units = React.useMemo(() => {
    switch (stagger) {
      case "character":
        return children.split("");
      case "word":
        return children.split(" ");
      case "line":
        return children.split("\n");
      default:
        return [children];
    }
  }, [children, stagger]);

  const getAnimationStyle = (unitIndex: number): React.CSSProperties => {
    const unitDelay = delay + unitIndex * staggerDelay;

    const progress = spring({
      frame: frame - unitDelay,
      fps,
      config: springConfig,
    });

    switch (animation) {
      case "fadeUp":
        return {
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(progress, [0, 1], [30, 0])}px)`,
        };

      case "fadeDown":
        return {
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(progress, [0, 1], [-30, 0])}px)`,
        };

      case "scaleUp":
        const scale = interpolate(progress, [0, 0.6, 1], [0.5, 1.15, 1]);
        return {
          opacity: interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
          transform: `scale(${scale})`,
        };

      case "typewriter":
        return {
          opacity: frame >= unitDelay ? 1 : 0,
        };

      case "blur":
        const blur = interpolate(progress, [0, 1], [10, 0]);
        return {
          opacity: interpolate(progress, [0, 1], [0, 1]),
          filter: `blur(${blur}px)`,
        };

      case "split":
        const angle = (unitIndex - units.length / 2) * 15;
        const distance = interpolate(progress, [0, 1], [50, 0]);
        return {
          opacity: interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
          transform: `translate(${Math.sin(angle * Math.PI / 180) * distance}px, ${Math.cos(angle * Math.PI / 180) * distance}px)`,
        };

      default:
        return {};
    }
  };

  const separator = stagger === "word" ? "\u00A0" : stagger === "line" ? <br /> : "";

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", ...style }}>
      {units.map((unit, i) => (
        <React.Fragment key={i}>
          <span
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              ...getAnimationStyle(i),
            }}
          >
            {unit}
          </span>
          {i < units.length - 1 && separator}
        </React.Fragment>
      ))}
    </span>
  );
};

/**
 * AnimatedLine - Animate a single line with entrance effect
 */
interface AnimatedLineProps {
  children: React.ReactNode;
  delay?: number;
  animation?: "fadeUp" | "fadeDown" | "scaleUp" | "slideLeft" | "slideRight";
  style?: React.CSSProperties;
}

export const AnimatedLine: React.FC<AnimatedLineProps> = ({
  children,
  delay = 0,
  animation = "fadeUp",
  style = {},
}) => {
  const frame = useCurrentFrame();
  const fps = 30;

  const progress = spring({
    frame: frame - delay,
    fps,
    config: springs.punch,
  });

  const getStyle = (): React.CSSProperties => {
    switch (animation) {
      case "fadeUp":
        return {
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(progress, [0, 1], [40, 0])}px)`,
        };
      case "fadeDown":
        return {
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(progress, [0, 1], [-40, 0])}px)`,
        };
      case "scaleUp":
        return {
          opacity: interpolate(progress, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
          transform: `scale(${interpolate(progress, [0, 0.5, 1], [0.8, 1.05, 1])})`,
        };
      case "slideLeft":
        return {
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateX(${interpolate(progress, [0, 1], [100, 0])}px)`,
        };
      case "slideRight":
        return {
          opacity: interpolate(progress, [0, 1], [0, 1]),
          transform: `translateX(${interpolate(progress, [0, 1], [-100, 0])}px)`,
        };
      default:
        return {};
    }
  };

  return (
    <div style={{ ...getStyle(), ...style }}>
      {children}
    </div>
  );
};

/**
 * AnimatedCounter - Animate a number counting up
 */
interface AnimatedCounterProps {
  from?: number;
  to: number;
  delay?: number;
  duration?: number; // in frames
  format?: (n: number) => string;
  style?: React.CSSProperties;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  from = 0,
  to,
  delay = 0,
  duration = 30,
  format = (n) => Math.round(n).toString(),
  style = {},
}) => {
  const frame = useCurrentFrame();

  const progress = interpolate(
    frame,
    [delay, delay + duration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  const value = from + (to - from) * progress;

  return <span style={style}>{format(value)}</span>;
};

export default AnimatedText;
