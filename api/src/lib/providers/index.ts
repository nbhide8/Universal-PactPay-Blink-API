/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Escrow Engine Registry
 *
 * Two modes, ONE blockchain (Solana):
 *
 *   getEngine('direct')    → DirectEngine    (user signs Solana txs)
 *   getEngine('custodial') → CustodialEngine (API signs via platform wallet)
 *
 * Both modes create the SAME on-chain PDA escrow on Solana.
 * The mode determines WHO signs the transactions.
 *
 * Usage in API routes:
 *   import { getEngine } from '@/lib/providers';
 *   const engine = getEngine(room.mode ?? 'direct');
 *   const result = await engine.createLockbox({ ... });
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { EscrowMode, EscrowEngine } from './types';
import { DirectEngine } from './direct';
import { CustodialEngine } from './custodial';

/* ── Singleton instances ─────────────────────────────────────────────────── */

const engines: Record<EscrowMode, EscrowEngine> = {
  direct: new DirectEngine(),
  custodial: new CustodialEngine(),
};

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * Get an escrow engine by mode.
 * Defaults to 'direct' if the mode is unrecognized.
 */
export function getEngine(mode?: EscrowMode | string | null): EscrowEngine {
  if (mode && mode in engines) {
    return engines[mode as EscrowMode];
  }
  // Backward compat: map old provider names to modes
  if (mode === 'solana') return engines.direct;
  if (mode === 'stripe') return engines.custodial;
  if (mode === 'ledger') return engines.custodial;
  return engines.direct;
}

// Backward compat alias
export const getProvider = getEngine;

/**
 * Check if a mode string is valid.
 */
export function isValidMode(mode: string): mode is EscrowMode {
  return mode in engines || mode === 'solana' || mode === 'stripe' || mode === 'ledger';
}

// Backward compat alias
export const isValidProvider = isValidMode;

/**
 * List all available modes.
 */
export function listModes(): EscrowMode[] {
  return Object.keys(engines) as EscrowMode[];
}

export const listProviders = listModes;

/* ── Re-exports ──────────────────────────────────────────────────────────── */

export type { EscrowMode, EscrowEngine, EscrowProvider, ProviderType } from './types';
export type {
  CreateLockboxParams,
  FundLockboxParams,
  ApproveParams,
  ResolveParams,
  SlashParams,
  CancelParams,
  GetStateParams,
  LockboxResult,
  LockboxState,
  ClientAction,
  PaymentRail,
} from './types';
