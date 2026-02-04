/**
 * Zarf Design Tokens for Video
 * 120 BPM Beat-Synced Motion Design
 */

// =============================================================================
// BEAT SYSTEM - 120 BPM
// =============================================================================

export const beat = {
  bpm: 120,
  fps: 30,
  framesPerBeat: 15,  // 30fps / 2 beats per second = 15 frames

  // Convert beats to frames
  toFrames: (beats: number) => Math.round(beats * 15),

  // Get frame for specific beat number
  at: (beatNumber: number) => beatNumber * 15,

  // Check if frame is on a beat
  isOnBeat: (frame: number) => frame % 15 === 0,

  // Get beat number from frame
  fromFrame: (frame: number) => Math.floor(frame / 15),

  // Subdivisions
  half: 7.5,    // Half beat = 7-8 frames
  quarter: 3.75, // Quarter beat
};

// =============================================================================
// SNAPPY SPRING CONFIGS
// =============================================================================

export const springs = {
  // Ultra fast - for hits and impacts (6-8 frames)
  hit: { damping: 20, stiffness: 400, mass: 0.3 },

  // Fast snap - for quick entrances (10-12 frames)
  snap: { damping: 15, stiffness: 350, mass: 0.4 },

  // Punchy - slight overshoot (12-15 frames)
  punch: { damping: 12, stiffness: 300, mass: 0.5 },

  // Bouncy - visible overshoot (15-20 frames)
  bounce: { damping: 8, stiffness: 250, mass: 0.6 },

  // Smooth - no overshoot, elegant (20-25 frames)
  smooth: { damping: 25, stiffness: 200, mass: 0.5 },
};

// =============================================================================
// COLORS
// =============================================================================

export const colors = {
  // Backgrounds
  bg: "#0A0A0B",
  bgElevated: "#131315",
  bgSunken: "#1A1A1D",

  // Foregrounds
  fg: "rgba(230, 230, 232, 1)",
  fgMuted: "rgba(230, 230, 232, 0.7)",
  fgSubtle: "rgba(230, 230, 232, 0.5)",
  fgFaint: "rgba(230, 230, 232, 0.3)",

  // Borders
  border: "rgba(230, 230, 232, 0.1)",
  borderSubtle: "rgba(230, 230, 232, 0.05)",
  borderStrong: "rgba(230, 230, 232, 0.2)",

  // Effects
  grain: "rgba(230, 230, 232, 0.35)",
  ripple: "rgba(230, 230, 232, 0.03)",

  // Semantic
  primary: "rgba(230, 230, 232, 1)",
  primaryContent: "#0A0A0B",
};

// =============================================================================
// VIDEO CONFIG
// =============================================================================

export const video = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 900, // 30 seconds = 60 beats
};

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  sans: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",

  // Sizes - larger for video
  hero: 72,
  display: 56,
  h1: 48,
  h2: 36,
  h3: 28,
  body: 20,
  small: 16,
  caption: 12,
  hash: 11,

  // Weights
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

// =============================================================================
// SPACING & RADIUS
// =============================================================================

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, "2xl": 48, "3xl": 64,
};

export const radius = {
  sm: 6, md: 8, lg: 12, xl: 16, "2xl": 24, "3xl": 32, full: 9999,
};

// =============================================================================
// LAYOUT GRID
// =============================================================================

export const layout = {
  width: video.width,
  height: video.height,
  columns: 12,
  columnWidth: video.width / 12,
  gutter: 40,
  baseline: 8,

  margin: {
    x: Math.round(video.width * 0.08),
    y: Math.round(video.height * 0.08),
  },

  safe: {
    left: Math.round(video.width * 0.08),
    right: video.width - Math.round(video.width * 0.08),
    top: Math.round(video.height * 0.08),
    bottom: video.height - Math.round(video.height * 0.08),
    width: video.width - Math.round(video.width * 0.16),
    height: video.height - Math.round(video.height * 0.16),
  },

  center: { x: video.width / 2, y: video.height / 2 },

  thirds: {
    x1: video.width / 3,
    x2: (video.width / 3) * 2,
    y1: video.height / 3,
    y2: (video.height / 3) * 2,
  },

  golden: {
    x: video.width * 0.618,
    y: video.height * 0.618,
  },

  sizes: {
    iconSm: 48,
    iconMd: 80,
    iconLg: 120,
    iconXl: 160,
    cardSm: { w: 240, h: 160 },
    cardMd: { w: 300, h: 200 },
    cardLg: { w: 380, h: 260 },
  },
};

export const grid = {
  col: (n: number) => layout.margin.x + n * layout.columnWidth,
  span: (n: number) => n * layout.columnWidth - layout.gutter,
  centerX: (width: number) => layout.center.x - width / 2,
  centerY: (height: number) => layout.center.y - height / 2,
  baseline: (n: number) => Math.round(n / layout.baseline) * layout.baseline,
  fromLeft: (percent: number) => layout.width * percent,
  fromTop: (percent: number) => layout.height * percent,
  distribute: (count: number, itemWidth: number) => {
    const totalWidth = layout.safe.width;
    const gap = (totalWidth - itemWidth * count) / (count + 1);
    return Array.from({ length: count }, (_, i) =>
      layout.safe.left + gap + i * (itemWidth + gap)
    );
  },
};

// =============================================================================
// SCENE TIMING - Beat Aligned (120 BPM = 15 frames/beat)
// Extended to 45 seconds / 90 beats
// =============================================================================

export const scenes = {
  // Scene 1: Void + Grain (Beats 1-4 = 60 frames)
  void: { start: 0, duration: beat.toFrames(4) },

  // Scene 2: Fingerprint (Beats 5-10 = 90 frames)
  fingerprint: { start: beat.at(4), duration: beat.toFrames(6) },

  // Scene 3: Bolt + Name (Beats 11-18 = 120 frames)
  bolt: { start: beat.at(10), duration: beat.toFrames(8) },

  // Scene 4: Flow Email→ZK→Wallet (Beats 19-28 = 150 frames)
  flow: { start: beat.at(18), duration: beat.toFrames(10) },

  // Scene 5: Headline "Confidential Token Distributions" (Beats 29-38 = 150 frames)
  headline: { start: beat.at(28), duration: beat.toFrames(10) },

  // Scene 6: Use Case Cards (Beats 39-46 = 120 frames)
  cards: { start: beat.at(38), duration: beat.toFrames(8) },

  // Scene 7: Create Flow Demo (Beats 47-56 = 150 frames)
  createDemo: { start: beat.at(46), duration: beat.toFrames(10) },

  // Scene 8: Claim Flow Demo (Beats 57-66 = 150 frames)
  claimDemo: { start: beat.at(56), duration: beat.toFrames(10) },

  // Scene 9: Resolve + CTA (Beats 67-78 = 180 frames)
  resolve: { start: beat.at(66), duration: beat.toFrames(12) },

  // Buffer/Transitions (Beats 79-90 = 180 frames) - handled by transitions
};

// =============================================================================
// COPY - From Landing Page
// =============================================================================

export const copy = {
  badge: "Confidential Vesting",
  headline: "Confidential Token\nDistributions",
  subhead: "Distribute tokens to emails with ZK proofs.",
  tagline: "No wallet exposure. No identity leaks.",

  features: [
    { label: "EMAIL-FIRST", title: "Email Distribution", desc: "Send to any email" },
    { label: "ZK PRIVACY", title: "Zero Knowledge", desc: "Unlinkable claims" },
    { label: "NO EXPOSURE", title: "Private Claims", desc: "No wallet leak" },
  ],

  useCases: [
    { label: "SYNDICATES", title: "Private Cap Tables" },
    { label: "PAYROLL", title: "Global Payroll" },
    { label: "AIRDROPS", title: "Stealth Rewards" },
  ],

  cta: "zarf.to",
  ctaSub: "Privacy-preserving token distribution",
};

// Legacy timing export for compatibility
export const timing = {
  voidStart: scenes.void.start,
  voidEnd: scenes.void.start + scenes.void.duration,
  fingerprintStart: scenes.fingerprint.start,
  fingerprintEnd: scenes.fingerprint.start + scenes.fingerprint.duration,
  boltStart: scenes.bolt.start,
  boltEnd: scenes.bolt.start + scenes.bolt.duration,
  flowStart: scenes.flow.start,
  flowEnd: scenes.flow.start + scenes.flow.duration,
};
