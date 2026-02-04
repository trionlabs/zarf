import React from "react";
import { useCurrentFrame, spring, interpolate, Easing } from "remotion";
import { springs, beat } from "../lib/tokens";

/**
 * Animated - Composable animation primitives
 *
 * Usage:
 * <Animated.Move x={-100} y={50}>
 *   <Animated.Scale from={0} to={1}>
 *     <Animated.Fade>
 *       <YourComponent />
 *     </Animated.Fade>
 *   </Animated.Scale>
 * </Animated.Move>
 *
 * Or combined:
 * <Animated in={{ x: -100, scale: 0, opacity: 0 }} delay={15}>
 *   <YourComponent />
 * </Animated>
 */

interface BaseProps {
  children: React.ReactNode;
  delay?: number;
  springConfig?: typeof springs.snap;
}

// === MOVE ===
interface MoveProps extends BaseProps {
  x?: number;
  y?: number;
}

const Move: React.FC<MoveProps> = ({
  children,
  x = 0,
  y = 0,
  delay = 0,
  springConfig = springs.punch,
}) => {
  const frame = useCurrentFrame();
  const progress = spring({ frame: frame - delay, fps: 30, config: springConfig });

  const translateX = interpolate(progress, [0, 1], [x, 0]);
  const translateY = interpolate(progress, [0, 1], [y, 0]);

  return (
    <div style={{ transform: `translate(${translateX}px, ${translateY}px)` }}>
      {children}
    </div>
  );
};

// === SCALE ===
interface ScaleProps extends BaseProps {
  from?: number;
  to?: number;
  overshoot?: boolean;
}

const Scale: React.FC<ScaleProps> = ({
  children,
  from = 0,
  to = 1,
  overshoot = true,
  delay = 0,
  springConfig = springs.punch,
}) => {
  const frame = useCurrentFrame();
  const progress = spring({ frame: frame - delay, fps: 30, config: springConfig });

  const scale = overshoot
    ? interpolate(progress, [0, 0.6, 1], [from, to * 1.1, to])
    : interpolate(progress, [0, 1], [from, to]);

  return (
    <div style={{ transform: `scale(${scale})` }}>
      {children}
    </div>
  );
};

// === FADE ===
interface FadeProps extends BaseProps {
  from?: number;
  to?: number;
}

const Fade: React.FC<FadeProps> = ({
  children,
  from = 0,
  to = 1,
  delay = 0,
  springConfig = springs.snap,
}) => {
  const frame = useCurrentFrame();
  const progress = spring({ frame: frame - delay, fps: 30, config: springConfig });

  const opacity = interpolate(progress, [0, 1], [from, to]);

  return <div style={{ opacity }}>{children}</div>;
};

// === ROTATE ===
interface RotateProps extends BaseProps {
  from?: number;
  to?: number;
}

const Rotate: React.FC<RotateProps> = ({
  children,
  from = 180,
  to = 0,
  delay = 0,
  springConfig = springs.bounce,
}) => {
  const frame = useCurrentFrame();
  const progress = spring({ frame: frame - delay, fps: 30, config: springConfig });

  const rotate = interpolate(progress, [0, 1], [from, to]);

  return (
    <div style={{ transform: `rotate(${rotate}deg)` }}>
      {children}
    </div>
  );
};

// === BLUR ===
interface BlurProps extends BaseProps {
  from?: number;
  to?: number;
}

const Blur: React.FC<BlurProps> = ({
  children,
  from = 20,
  to = 0,
  delay = 0,
  springConfig = springs.snap,
}) => {
  const frame = useCurrentFrame();
  const progress = spring({ frame: frame - delay, fps: 30, config: springConfig });

  const blur = interpolate(progress, [0, 1], [from, to]);

  return <div style={{ filter: `blur(${blur}px)` }}>{children}</div>;
};

// === COMBINED ===
interface CombinedProps extends BaseProps {
  in?: {
    x?: number;
    y?: number;
    scale?: number;
    rotate?: number;
    opacity?: number;
    blur?: number;
  };
  style?: React.CSSProperties;
}

const Combined: React.FC<CombinedProps> = ({
  children,
  in: inProps = {},
  delay = 0,
  springConfig = springs.punch,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const progress = spring({ frame: frame - delay, fps: 30, config: springConfig });

  const {
    x = 0,
    y = 0,
    scale: scaleFrom = 1,
    rotate: rotateFrom = 0,
    opacity: opacityFrom = 1,
    blur: blurFrom = 0,
  } = inProps;

  const translateX = interpolate(progress, [0, 1], [x, 0]);
  const translateY = interpolate(progress, [0, 1], [y, 0]);
  const scale = interpolate(progress, [0, 0.6, 1], [scaleFrom, scaleFrom < 1 ? 1.08 : 0.95, 1]);
  const rotate = interpolate(progress, [0, 1], [rotateFrom, 0]);
  const opacity = interpolate(progress, [0, 0.4], [opacityFrom, 1], { extrapolateRight: "clamp" });
  const blur = interpolate(progress, [0, 1], [blurFrom, 0]);

  return (
    <div
      style={{
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
        opacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// === SEQUENCE (staggered children) ===
interface SequenceProps {
  children: React.ReactNode[];
  staggerDelay?: number;
  startDelay?: number;
}

const Stagger: React.FC<SequenceProps> = ({
  children,
  staggerDelay = beat.framesPerBeat / 2,
  startDelay = 0,
}) => {
  return (
    <>
      {React.Children.map(children, (child, i) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<any>, {
          delay: startDelay + i * staggerDelay,
        });
      })}
    </>
  );
};

// === EXPORTS ===
export const Animated = {
  Move,
  Scale,
  Fade,
  Rotate,
  Blur,
  In: Combined,
  Stagger,
};

export default Animated;
