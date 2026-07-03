// Gate-mode resolver. The load-bearing email-mode safety lever: a blank or
// garbage GATE_MODE degrades to the credential-free 'email' path, so a deploy
// with ZERO X secrets never tries to use X and never 500s. setup.mjs's
// var-pruning is cosmetic; these runtime guards are what enforce inertness.
export type GateMode = 'email' | 'x-follow' | 'email+x';

export function resolveGateMode(env: { GATE_MODE?: string } | undefined): GateMode {
  const m = env?.GATE_MODE;
  // default-safe: anything not an exact known X-bearing mode → 'email'
  return m === 'x-follow' || m === 'email+x' ? m : 'email';
}

export const gateAllowsEmail = (m: GateMode): boolean => m === 'email' || m === 'email+x';
export const gateAllowsX = (m: GateMode): boolean => m === 'x-follow' || m === 'email+x';
