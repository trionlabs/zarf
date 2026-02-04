import { z } from "zod";

/**
 * Zod Schemas for Remotion Studio Interactive Props
 */

export const launchVideoSchema = z.object({
  // Copy - editable in Studio
  badge: z.string().default("Confidential Vesting"),
  headline: z.string().default("Confidential Token Distributions"),
  subhead: z.string().default("Distribute tokens to emails with ZK proofs."),
  tagline: z.string().default("No wallet exposure. No identity leaks."),
  cta: z.string().default("zarf.to"),
  ctaSub: z.string().default("Privacy-preserving token distribution"),

  // Use cases
  useCases: z.array(z.object({
    label: z.string(),
    title: z.string(),
  })).default([
    { label: "SYNDICATES", title: "Private Cap Tables" },
    { label: "PAYROLL", title: "Global Payroll" },
    { label: "AIRDROPS", title: "Stealth Rewards" },
  ]),

  // Timing
  bpm: z.number().min(60).max(180).default(120),

  // Colors (for easy theming)
  bgColor: z.string().default("#0A0A0B"),
  fgColor: z.string().default("rgba(230, 230, 232, 1)"),
});

export type LaunchVideoProps = z.infer<typeof launchVideoSchema>;
