/**
 * Apple-style easing functions for masterclass motion design
 */

import { interpolate, Easing } from "remotion";

// Apple's signature easings
export const appleEase = Easing.bezier(0.25, 0.1, 0.25, 1.0); // Smooth decel
export const appleSnap = Easing.bezier(0.68, -0.55, 0.27, 1.55); // Overshoot settle
export const appleSlow = Easing.bezier(0.16, 1, 0.3, 1); // Dramatic slow-in
export const appleSmooth = Easing.bezier(0.4, 0, 0.2, 1); // Material-like

// Zen motion - restrained, elegant
export const zenEase = Easing.bezier(0.25, 0.1, 0.25, 1.0);
export const zenSpring = Easing.bezier(0.34, 1.56, 0.64, 1);

/**
 * Fade in with optional delay
 */
export function fadeIn(
  frame: number,
  start: number,
  duration: number = 20,
  easing = zenEase
): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/**
 * Fade out with optional delay
 */
export function fadeOut(
  frame: number,
  start: number,
  duration: number = 20,
  easing = zenEase
): number {
  return interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/**
 * Slide up entrance
 */
export function slideUp(
  frame: number,
  start: number,
  duration: number = 30,
  distance: number = 40
): { y: number; opacity: number } {
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: appleSlow,
  });

  return {
    y: interpolate(progress, [0, 1], [distance, 0]),
    opacity: interpolate(progress, [0, 0.5], [0, 1], {
      extrapolateRight: "clamp",
    }),
  };
}

/**
 * Scale entrance with overshoot
 */
export function scaleIn(
  frame: number,
  start: number,
  duration: number = 25
): { scale: number; opacity: number } {
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: zenSpring,
  });

  return {
    scale: interpolate(progress, [0, 1], [0.85, 1]),
    opacity: interpolate(progress, [0, 0.3], [0, 1], {
      extrapolateRight: "clamp",
    }),
  };
}

/**
 * Stroke draw animation (for SVG paths)
 */
export function strokeDraw(
  frame: number,
  start: number,
  duration: number = 40,
  pathLength: number = 100
): { dashOffset: number; opacity: number } {
  const progress = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: appleSlow,
  });

  return {
    dashOffset: interpolate(progress, [0, 1], [pathLength, 0]),
    opacity: interpolate(progress, [0, 0.1], [0, 1], {
      extrapolateRight: "clamp",
    }),
  };
}

/**
 * Staggered animation helper
 */
export function stagger(
  frame: number,
  start: number,
  index: number,
  staggerDelay: number = 3 // frames between each item
): number {
  return start + index * staggerDelay;
}

/**
 * Pulse animation (looping)
 */
export function pulse(
  frame: number,
  speed: number = 60, // frames per cycle
  min: number = 1,
  max: number = 1.05
): number {
  const cycle = (frame % speed) / speed;
  const wave = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5;
  return interpolate(wave, [0, 1], [min, max]);
}

/**
 * Breathing opacity animation
 */
export function breathe(
  frame: number,
  speed: number = 90,
  min: number = 0.3,
  max: number = 0.5
): number {
  const cycle = (frame % speed) / speed;
  const wave = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5;
  return interpolate(wave, [0, 1], [min, max]);
}
