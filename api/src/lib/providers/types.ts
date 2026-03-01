/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Blink Escrow Types
 *
 * CORE PRINCIPLE: Solana blockchain is ALWAYS the escrow mechanism.
 * Every lockbox = an on-chain PDA that holds real SOL.
 * The blockchain provides trustless, verifiable escrow guarantees.
 *
 * The "mode" determines HOW users interact with the escrow:
 *
 *   DIRECT MODE (crypto users):
 *     User has a Solana wallet → API returns unsigned transactions →
 *     User signs with wallet → submits to /api/v1/tx/submit →
 *     SOL locked in on-chain PDA
 *
 *   CUSTODIAL MODE (non-crypto users):
 *     User pays via fiat (Stripe) or company credits →
 *     API's platform wallet signs & submits Solana transactions →
 *     SOL locked in on-chain PDA (same escrow!) →
 *     On resolve: API converts SOL back to fiat payout
 *
 * Both modes → same on-chain escrow → same guarantees.
 * The only difference is WHO signs the Solana transactions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Mode & Rail Types ───────────────────────────────────────────────────────

/**
 * How the user interacts with the escrow.
 *   - direct:    User signs Solana transactions with their own wallet
 *   - custodial: API signs Solana transactions on behalf of the user
 */
export type EscrowMode = 'direct' | 'custodial';

/**
 * How non-crypto users pay in custodial mode.
 *   - stripe:  Card/bank payment via Stripe PaymentIntents
 *   - credits: Company-managed internal balance (no external payment rail)
 */
export type PaymentRail = 'stripe' | 'credits';

// Backward compat alias
export type ProviderType = EscrowMode;

// ─── Client Action ───────────────────────────────────────────────────────────

/**
 * ClientAction tells the API consumer what they need to do AFTER the API call.
 *
 * Direct mode:    "sign_transaction" → sign the Solana tx and submit
 * Custodial mode: "confirm_payment" (Stripe) or "none" (credits/instant)
 *
 * When action.type is "none", the API has ALREADY handled everything,
 * including the on-chain Solana transaction (platform wallet signed it).
 */
export interface ClientAction {
  type: 'sign_transaction' | 'confirm_payment' | 'none';

  /** Mode-specific payload:
   *  - sign_transaction: base64-encoded unsigned Solana transaction
   *  - confirm_payment:  Stripe PaymentIntent client_secret
   *  - none:             null (already handled)
   */
  payload: string | null;

  /** Human-readable instructions for the API consumer */
  instructions: string;

  /** Additional metadata (accounts, amounts, signatures, etc.) */
  metadata?: Record<string, any>;
}

// ─── Common Params ───────────────────────────────────────────────────────────

export interface CreateLockboxParams {
  /** Creator's identity (wallet address for direct, user ID for custodial) */
  creatorId: string;
  roomId: string;
  creatorStakeAmount: number;
  joinerStakeAmount: number;
  /** Currency code: "SOL" for direct, "USD"/"EUR" for custodial */
  currency?: string;
  /** Payment rail for custodial mode */
  paymentRail?: PaymentRail;
}

export interface FundLockboxParams {
  /** Funder's identity */
  funderId: string;
  roomId: string;
  participantId: string;
  amount: number;
  isCreator: boolean;
  currency?: string;
  paymentRail?: PaymentRail;
}

export interface ApproveParams {
  approverId: string;
  roomId: string;
}

export interface ResolveParams {
  callerAddress: string;
  roomId: string;
  creatorAddress: string;
  joinerAddress: string;
  creatorParticipantId: string;
  joinerParticipantId: string;
}

export interface SlashParams {
  callerAddress: string;
  roomId: string;
  creatorParticipantId: string;
  joinerParticipantId: string;
}

export interface CancelParams {
  callerAddress: string;
  roomId: string;
  joinerAddress?: string;
}

export interface GetStateParams {
  roomId: string;
}

// ─── Result Types ────────────────────────────────────────────────────────────

export interface LockboxResult {
  /** How the user interacts (direct or custodial) */
  mode: EscrowMode;
  /** Always 'solana' — the blockchain backing every escrow */
  blockchain: 'solana';
  /** Always true — every escrow is on-chain */
  onChain: true;
  /** Payment rail (only for custodial mode) */
  paymentRail?: PaymentRail;
  /** What the client needs to do next */
  action: ClientAction;
  /** On-chain tx signature (only for custodial — API already submitted) */
  onChainSignature?: string;
}

export interface LockboxState {
  mode: EscrowMode;
  blockchain: 'solana';
  exists: boolean;
  status?: string;
  creatorFunded?: boolean;
  joinerFunded?: boolean;
  creatorApproved?: boolean;
  joinerApproved?: boolean;
  totalLocked?: number;
  currency?: string;
  raw?: any; // On-chain escrow state
}

// ─── Engine Interface ────────────────────────────────────────────────────────

/**
 * The EscrowEngine interface. Both modes implement this.
 * The API routes call engine methods — never blockchain code directly.
 *
 * Direct engine: builds unsigned Solana transactions for the user to sign
 * Custodial engine: signs + submits Solana transactions via platform wallet
 */
export interface EscrowEngine {
  readonly mode: EscrowMode;

  /** Create the escrow lockbox (on-chain PDA) */
  createLockbox(params: CreateLockboxParams): Promise<LockboxResult>;

  /** Fund the lockbox (stake SOL into PDA) */
  fundLockbox(params: FundLockboxParams): Promise<LockboxResult>;

  /** Approve resolution */
  approveLockbox(params: ApproveParams): Promise<LockboxResult>;

  /** Resolve — release SOL back to both parties */
  resolveLockbox(params: ResolveParams): Promise<LockboxResult>;

  /** Slash — send all SOL to penalty wallet */
  slashLockbox(params: SlashParams): Promise<LockboxResult>;

  /** Cancel the lockbox */
  cancelLockbox(params: CancelParams): Promise<LockboxResult>;

  /** Get current on-chain lockbox state */
  getLockboxState(params: GetStateParams): Promise<LockboxState>;
}

// Backward compat alias
export type EscrowProvider = EscrowEngine;
