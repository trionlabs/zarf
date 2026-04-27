import React from "react";
import { useCurrentFrame, interpolate, spring, Easing } from "remotion";
import { colors, layout, springs } from "../lib/tokens";

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  delay: number;
  lifetime: number;
  color?: string;
}

interface ParticleSystemProps {
  /** Trigger frame for particle emission */
  triggerFrame?: number;
  /** Number of particles */
  count?: number;
  /** Center X position */
  originX?: number;
  /** Center Y position */
  originY?: number;
  /** Emission pattern */
  pattern?: "burst" | "spiral" | "trail" | "rain" | "converge";
  /** Particle size range [min, max] */
  sizeRange?: [number, number];
  /** Speed multiplier */
  speed?: number;
  /** Particle lifetime in frames */
  lifetime?: number;
  /** Particle color */
  color?: string;
  /** Enable particle trails */
  trails?: boolean;
  /** Trail length */
  trailLength?: number;
  /** Custom particle generator */
  generateParticle?: (index: number, count: number) => Partial<Particle>;
}

/**
 * ParticleSystem - Reusable particle emitter for sparks, trails, dust
 */
export const ParticleSystem: React.FC<ParticleSystemProps> = ({
  triggerFrame = 0,
  count = 12,
  originX = layout.center.x,
  originY = layout.center.y,
  pattern = "burst",
  sizeRange = [3, 8],
  speed = 1,
  lifetime = 30,
  color = colors.fg,
  trails = false,
  trailLength = 5,
  generateParticle,
}) => {
  const frame = useCurrentFrame();
  const relativeFrame = frame - triggerFrame;

  // Generate particles based on pattern
  const particles: Particle[] = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      if (generateParticle) {
        return {
          id: i,
          x: originX,
          y: originY,
          vx: 0,
          vy: 0,
          size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
          delay: 0,
          lifetime,
          ...generateParticle(i, count),
        };
      }

      const angle = (i / count) * Math.PI * 2;
      const randomAngle = angle + (Math.random() - 0.5) * 0.5;
      const baseSpeed = 5 + Math.random() * 10;

      switch (pattern) {
        case "burst":
          return {
            id: i,
            x: originX,
            y: originY,
            vx: Math.cos(randomAngle) * baseSpeed * speed,
            vy: Math.sin(randomAngle) * baseSpeed * speed,
            size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
            delay: Math.random() * 3,
            lifetime: lifetime + Math.random() * 10,
          };

        case "spiral":
          return {
            id: i,
            x: originX,
            y: originY,
            vx: Math.cos(angle) * 3 * speed,
            vy: Math.sin(angle) * 3 * speed,
            size: sizeRange[0] + (i / count) * (sizeRange[1] - sizeRange[0]),
            delay: i * 2,
            lifetime: lifetime * 1.5,
          };

        case "trail":
          return {
            id: i,
            x: originX,
            y: originY,
            vx: (Math.random() - 0.5) * 2 * speed,
            vy: -2 - Math.random() * 3 * speed,
            size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
            delay: i * 1.5,
            lifetime,
          };

        case "rain":
          return {
            id: i,
            x: Math.random() * layout.width,
            y: -20,
            vx: (Math.random() - 0.5) * 0.5,
            vy: 3 + Math.random() * 4 * speed,
            size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]) * 0.5,
            delay: i * 3,
            lifetime: lifetime * 2,
          };

        case "converge":
          const startRadius = 300 + Math.random() * 200;
          return {
            id: i,
            x: originX + Math.cos(angle) * startRadius,
            y: originY + Math.sin(angle) * startRadius,
            vx: -Math.cos(angle) * baseSpeed * speed * 0.7,
            vy: -Math.sin(angle) * baseSpeed * speed * 0.7,
            size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
            delay: i * 1.5,
            lifetime,
          };

        default:
          return {
            id: i,
            x: originX,
            y: originY,
            vx: 0,
            vy: 0,
            size: sizeRange[0],
            delay: 0,
            lifetime,
          };
      }
    });
  }, [count, originX, originY, pattern, sizeRange, speed, lifetime, generateParticle]);

  // Early return AFTER hooks
  if (relativeFrame < 0) return null;

  return (
    <>
      {particles.map((particle) => {
        const particleFrame = relativeFrame - particle.delay;
        if (particleFrame < 0 || particleFrame > particle.lifetime) return null;

        const progress = particleFrame / particle.lifetime;

        // Position with physics
        const gravity = pattern === "trail" ? 0.1 : pattern === "rain" ? 0 : 0.15;
        const friction = 0.98;

        let x = particle.x;
        let y = particle.y;
        let vx = particle.vx;
        let vy = particle.vy;

        for (let t = 0; t < particleFrame; t++) {
          x += vx;
          y += vy;
          vy += gravity;
          vx *= friction;
          vy *= friction;
        }

        // Opacity fade
        const opacity = interpolate(
          progress,
          [0, 0.1, 0.7, 1],
          [0, 1, 0.8, 0],
          { extrapolateRight: "clamp" }
        );

        // Size variation
        const size = particle.size * interpolate(
          progress,
          [0, 0.2, 1],
          [0.5, 1, 0.3]
        );

        return (
          <React.Fragment key={particle.id}>
            {/* Trail */}
            {trails && particleFrame > 2 && (
              <>
                {Array.from({ length: trailLength }, (_, ti) => {
                  const trailFrame = particleFrame - (ti + 1) * 2;
                  if (trailFrame < 0) return null;

                  let tx = particle.x;
                  let ty = particle.y;
                  let tvx = particle.vx;
                  let tvy = particle.vy;

                  for (let t = 0; t < trailFrame; t++) {
                    tx += tvx;
                    ty += tvy;
                    tvy += gravity;
                    tvx *= friction;
                    tvy *= friction;
                  }

                  return (
                    <div
                      key={`trail-${particle.id}-${ti}`}
                      style={{
                        position: "absolute",
                        left: tx - size * 0.3,
                        top: ty - size * 0.3,
                        width: size * 0.6,
                        height: size * 0.6,
                        borderRadius: "50%",
                        backgroundColor: color,
                        opacity: opacity * (1 - (ti + 1) / (trailLength + 1)) * 0.5,
                      }}
                    />
                  );
                })}
              </>
            )}

            {/* Main particle */}
            <div
              style={{
                position: "absolute",
                left: x - size / 2,
                top: y - size / 2,
                width: size,
                height: size,
                borderRadius: "50%",
                backgroundColor: color,
                opacity,
                boxShadow: `0 0 ${size * 2}px ${color}`,
              }}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

/**
 * Spark - Quick burst of particles for impacts
 */
export const Spark: React.FC<{
  triggerFrame: number;
  x: number;
  y: number;
  count?: number;
  color?: string;
}> = ({ triggerFrame, x, y, count = 8, color = colors.fg }) => (
  <ParticleSystem
    triggerFrame={triggerFrame}
    originX={x}
    originY={y}
    count={count}
    pattern="burst"
    sizeRange={[2, 5]}
    speed={0.8}
    lifetime={20}
    color={color}
  />
);

/**
 * Dust - Subtle ambient particles
 */
export const Dust: React.FC<{
  count?: number;
  color?: string;
}> = ({ count = 20, color = colors.fgFaint }) => (
  <ParticleSystem
    triggerFrame={0}
    count={count}
    pattern="rain"
    sizeRange={[1, 3]}
    speed={0.3}
    lifetime={120}
    color={color}
  />
);

export default ParticleSystem;
