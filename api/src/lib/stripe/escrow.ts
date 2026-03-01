/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe Escrow Service — Fiat Custody Layer
 *
 * This is the fiat side of the hybrid escrow. Stripe securely holds
 * users' money while the blockchain provides consensus.
 *
 * HOW IT WORKS:
 *
 *   DEPOSIT (Stake):
 *     1. User stakes → API creates Stripe PaymentIntent with capture_method: 'manual'
 *     2. User confirms payment on client (Stripe.js)
 *     3. Stripe webhook confirms → money is AUTHORIZED (held) but NOT captured
 *     4. Platform wallet stakes equivalent SOL on-chain
 *     5. DB links: payment_intent_id ↔ room_id ↔ on-chain PDA
 *
 *   RELEASE (Resolve):
 *     On-chain RoomResolved event fires →
 *     Event listener catches it →
 *     Dispatcher calls captureAndTransfer() →
 *     Stripe captures the held funds and transfers to recipients
 *
 *   REFUND (Cancel / Mutual Cancel):
 *     On-chain RoomCancelled event fires →
 *     Event listener catches it →
 *     Dispatcher calls refundDeposit() →
 *     Stripe cancels the PaymentIntent (releases the hold)
 *
 *   FORFEIT (Slash):
 *     On-chain RoomSlashed event fires →
 *     Event listener catches it →
 *     Dispatcher calls forfeitDeposit() →
 *     Stripe captures the funds to the platform (penalty revenue)
 *
 * IMPORTANT: The backend NEVER moves money without on-chain consensus.
 * The event listener validates that the on-chain event matches a funded
 * escrow before executing any Stripe action.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import Stripe from 'stripe';
import { getStripe, isStripeAvailable } from './client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateDepositParams {
  /** Room ID (links to on-chain PDA) */
  roomId: string;
  /** User identifier (email, account ID, etc.) */
  userId: string;
  /** Amount in smallest currency unit (cents for USD) */
  amountCents: number;
  /** ISO 4217 currency code */
  currency: string;
  /** 'creator' or 'joiner' */
  role: 'creator' | 'joiner';
  /** Optional Stripe customer ID */
  customerId?: string;
  /** On-chain escrow PDA address */
  escrowPda?: string;
}

export interface DepositResult {
  /** Stripe PaymentIntent ID — the escrow receipt */
  paymentIntentId: string;
  /** Client secret for client-side confirmation */
  clientSecret: string;
  /** Amount held */
  amountCents: number;
  currency: string;
  /** Status: requires_confirmation means client must confirm */
  status: string;
}

export interface TransferResult {
  success: boolean;
  paymentIntentId: string;
  amountCaptured: number;
  transferId?: string;
}

// ─── Deposit (Create PaymentIntent with manual capture) ──────────────────────

/**
 * Create a Stripe PaymentIntent with manual capture.
 * This AUTHORIZES the payment (holds funds on the card) but does NOT
 * capture (charge) until the on-chain consensus is reached.
 *
 * The hold typically lasts 7 days (can be extended to 31 with Stripe).
 *
 * Returns a client_secret that the frontend uses with Stripe.js to
 * confirm the payment and authenticate the cardholder.
 */
export async function createDeposit(params: CreateDepositParams): Promise<DepositResult> {
  if (!isStripeAvailable()) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }

  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: params.currency.toLowerCase(),
    capture_method: 'manual', // ← KEY: hold funds, don't capture yet
    metadata: {
      stakeguard_room_id: params.roomId,
      stakeguard_user_id: params.userId,
      stakeguard_role: params.role,
      stakeguard_escrow_pda: params.escrowPda || '',
      stakeguard_type: 'escrow_deposit',
    },
    description: `StakeGuard escrow deposit — Room ${params.roomId} (${params.role})`,
    ...(params.customerId ? { customer: params.customerId } : {}),
    // Enable automatic payment methods for maximum compatibility
    automatic_payment_methods: {
      enabled: true,
    },
  });

  return {
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret!,
    amountCents: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
  };
}

// ─── Capture (Release held funds after on-chain resolve) ─────────────────────

/**
 * Capture a previously authorized PaymentIntent.
 * Called by the event dispatcher when a RoomResolved event is detected.
 *
 * This actually charges the card and makes the funds available
 * in the Stripe account for transfer.
 */
export async function captureDeposit(paymentIntentId: string): Promise<TransferResult> {
  const stripe = getStripe();

  try {
    const captured = await stripe.paymentIntents.capture(paymentIntentId);
    return {
      success: true,
      paymentIntentId: captured.id,
      amountCaptured: captured.amount_received,
    };
  } catch (error: any) {
    console.error(`[Stripe] Failed to capture PI ${paymentIntentId}:`, error.message);
    return {
      success: false,
      paymentIntentId,
      amountCaptured: 0,
    };
  }
}

/**
 * Capture and transfer to a connected Stripe account (if using Stripe Connect).
 * For simpler setups, just capture to the platform account.
 */
export async function captureAndTransfer(
  paymentIntentId: string,
  destinationAccountId?: string
): Promise<TransferResult> {
  const stripe = getStripe();

  // First capture the held funds
  const captured = await captureDeposit(paymentIntentId);
  if (!captured.success) return captured;

  // If no destination, funds stay in platform account (to be disbursed manually)
  if (!destinationAccountId) {
    return captured;
  }

  // Transfer to the recipient's connected account
  try {
    const transfer = await stripe.transfers.create({
      amount: captured.amountCaptured,
      currency: 'usd',
      destination: destinationAccountId,
      metadata: {
        source_payment_intent: paymentIntentId,
        stakeguard_type: 'escrow_payout',
      },
    });

    return {
      ...captured,
      transferId: transfer.id,
    };
  } catch (error: any) {
    console.error(`[Stripe] Transfer failed for PI ${paymentIntentId}:`, error.message);
    return {
      ...captured,
      transferId: undefined,
    };
  }
}

// ─── Refund (Cancel escrow — release hold) ───────────────────────────────────

/**
 * Cancel/refund a PaymentIntent.
 * If the PI was authorized but not captured: cancels the hold (free).
 * If the PI was captured: creates a refund.
 *
 * Called by the event dispatcher when RoomCancelled event is detected.
 */
export async function refundDeposit(
  paymentIntentId: string
): Promise<{ success: boolean; refundId?: string }> {
  const stripe = getStripe();

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (pi.status === 'requires_capture') {
      // Authorized but not captured — just cancel the hold
      await stripe.paymentIntents.cancel(paymentIntentId);
      return { success: true };
    }

    if (pi.status === 'succeeded') {
      // Already captured — create a refund
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        metadata: {
          stakeguard_type: 'escrow_refund',
        },
      });
      return { success: true, refundId: refund.id };
    }

    // PI in some other state — try to cancel
    await stripe.paymentIntents.cancel(paymentIntentId);
    return { success: true };
  } catch (error: any) {
    console.error(`[Stripe] Refund failed for PI ${paymentIntentId}:`, error.message);
    return { success: false };
  }
}

// ─── Forfeit (Slash — capture to platform as penalty) ────────────────────────

/**
 * Forfeit (slash) a deposit. Captures the held funds to the platform account.
 * No transfer to either party — the funds stay as penalty revenue.
 *
 * Called by the event dispatcher when RoomSlashed event is detected.
 */
export async function forfeitDeposit(
  paymentIntentId: string
): Promise<TransferResult> {
  // Forfeit = capture to platform. No outgoing transfer.
  return captureDeposit(paymentIntentId);
}

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * Get the status of a PaymentIntent.
 */
export async function getDepositStatus(
  paymentIntentId: string
): Promise<{
  status: string;
  amount: number;
  currency: string;
  roomId: string | null;
}> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  return {
    status: pi.status,
    amount: pi.amount,
    currency: pi.currency,
    roomId: (pi.metadata?.stakeguard_room_id as string) || null,
  };
}
