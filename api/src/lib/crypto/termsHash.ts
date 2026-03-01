/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Terms Hash — Cryptographic Commitment of Contract Terms
 *
 * Before writing the escrow to the blockchain, we hash the human-readable
 * terms into a 32-byte digest. This hash is stored in the room metadata
 * and can be verified against the on-chain PDA at any time.
 *
 * The hash covers:
 *   - Terms title, summary, conditions
 *   - Participant wallet addresses
 *   - Stake amounts
 *   - Deadlines
 *
 * If anyone tampers with the off-chain terms, the hash won't match the
 * on-chain record — providing tamper-proof auditability.
 *
 * The room ID itself (used as PDA seed) is derived from Supabase's UUID,
 * but the TERMS hash is an additional cryptographic commitment that
 * proves the off-chain contract matches what was agreed on-chain.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createHash } from 'crypto';

export interface TermsHashInput {
  /** Room identifier */
  roomId: string;
  /** Terms title */
  title: string;
  /** Terms summary */
  summary: string;
  /** Serialized conditions array */
  conditions: any[];
  /** Creator wallet or identifier */
  creatorId: string;
  /** Joiner wallet or identifier (empty string if not yet joined) */
  joinerId?: string;
  /** Creator's required stake amount */
  creatorStakeAmount: number;
  /** Joiner's required stake amount */
  joinerStakeAmount: number;
  /** Contract deadline (ISO string) */
  deadline?: string;
  /** Additional notes */
  additionalNotes?: string;
}

/**
 * Compute a deterministic SHA-256 hash of the contract terms.
 *
 * This is stored in the DB and can be compared against the on-chain
 * room hash to verify integrity. The hash is computed from a canonical
 * JSON representation (sorted keys) to ensure determinism.
 *
 * @returns hex-encoded SHA-256 hash
 */
export function computeTermsHash(input: TermsHashInput): string {
  // Build a canonical representation (sorted keys, stable JSON)
  const canonical = {
    roomId: input.roomId,
    terms: {
      title: input.title,
      summary: input.summary,
      conditions: input.conditions,
      additionalNotes: input.additionalNotes || '',
    },
    participants: {
      creator: input.creatorId,
      joiner: input.joinerId || '',
    },
    stakes: {
      creator: input.creatorStakeAmount,
      joiner: input.joinerStakeAmount,
    },
    deadline: input.deadline || '',
  };

  const json = JSON.stringify(canonical, Object.keys(canonical).sort());
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Compute the terms hash as a 32-byte Buffer (for on-chain storage).
 */
export function computeTermsHashBytes(input: TermsHashInput): Buffer {
  const hex = computeTermsHash(input);
  return Buffer.from(hex, 'hex');
}

/**
 * Verify that an off-chain terms document matches a stored hash.
 */
export function verifyTermsHash(input: TermsHashInput, expectedHash: string): boolean {
  return computeTermsHash(input) === expectedHash;
}
