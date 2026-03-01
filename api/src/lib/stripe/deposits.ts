/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Escrow Deposits — Database layer linking Stripe ↔ Blockchain
 *
 * Every fiat deposit creates a record that links:
 *   - Stripe PaymentIntent ID (fiat custody proof)
 *   - On-chain room ID / PDA (blockchain consensus proof)
 *   - User identity + role
 *   - Amount + currency
 *   - Status lifecycle
 *
 * The event listener uses these records to:
 *   1. Find which PaymentIntents correspond to a resolved/slashed room
 *   2. Execute the deterministic Stripe action (capture/refund/forfeit)
 *   3. Mark the deposit as settled
 *
 * Status lifecycle:
 *   authorized → captured (resolve) | refunded (cancel) | forfeited (slash)
 *
 * Uses the 'escrow_deposits' table in Supabase (created via migration).
 * Falls back gracefully to in-memory tracking if table doesn't exist yet.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabase } from '../supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DepositStatus =
  | 'pending'        // PaymentIntent created, not yet confirmed
  | 'authorized'     // Payment confirmed, funds held (not captured)
  | 'captured'       // Funds captured (resolve/forfeit)
  | 'refunded'       // Funds released back to user (cancel)
  | 'forfeited'      // Funds captured as penalty (slash)
  | 'failed';        // Payment failed

export interface EscrowDeposit {
  id: string;
  room_id: string;
  user_id: string;
  role: 'creator' | 'joiner';
  stripe_payment_intent_id: string;
  amount_cents: number;
  currency: string;
  status: DepositStatus;
  escrow_pda: string | null;
  terms_hash: string | null;
  on_chain_staked: boolean;
  on_chain_tx_signature: string | null;
  stripe_action_tx: string | null;    // stripe transfer/refund ID
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── In-memory fallback (for when DB table doesn't exist yet) ────────────────

const memoryStore = new Map<string, EscrowDeposit>();

// ─── Record a new deposit ────────────────────────────────────────────────────

export async function recordDeposit(params: {
  roomId: string;
  userId: string;
  role: 'creator' | 'joiner';
  stripePaymentIntentId: string;
  amountCents: number;
  currency: string;
  escrowPda?: string;
  termsHash?: string;
}): Promise<EscrowDeposit> {
  const deposit: Partial<EscrowDeposit> = {
    room_id: params.roomId,
    user_id: params.userId,
    role: params.role,
    stripe_payment_intent_id: params.stripePaymentIntentId,
    amount_cents: params.amountCents,
    currency: params.currency,
    status: 'pending',
    escrow_pda: params.escrowPda || null,
    terms_hash: params.termsHash || null,
    on_chain_staked: false,
    on_chain_tx_signature: null,
  };

  try {
    const { data, error } = await supabase
      .from('escrow_deposits')
      .insert(deposit)
      .select()
      .single();

    if (error) throw error;
    return data as EscrowDeposit;
  } catch {
    // Fallback to in-memory if table doesn't exist
    const id = `dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mem: EscrowDeposit = {
      id,
      ...deposit,
      stripe_action_tx: null,
      settled_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as EscrowDeposit;
    memoryStore.set(id, mem);
    return mem;
  }
}

// ─── Update deposit status ───────────────────────────────────────────────────

export async function updateDepositStatus(
  paymentIntentId: string,
  status: DepositStatus,
  extra?: {
    onChainTxSignature?: string;
    stripeActionTx?: string;
    onChainStaked?: boolean;
  }
): Promise<void> {
  const updates: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (extra?.onChainTxSignature) updates.on_chain_tx_signature = extra.onChainTxSignature;
  if (extra?.stripeActionTx) updates.stripe_action_tx = extra.stripeActionTx;
  if (extra?.onChainStaked !== undefined) updates.on_chain_staked = extra.onChainStaked;
  if (['captured', 'refunded', 'forfeited'].includes(status)) {
    updates.settled_at = new Date().toISOString();
  }

  try {
    await supabase
      .from('escrow_deposits')
      .update(updates)
      .eq('stripe_payment_intent_id', paymentIntentId);
  } catch {
    // Fallback to in-memory
    for (const dep of Array.from(memoryStore.values())) {
      if (dep.stripe_payment_intent_id === paymentIntentId) {
        Object.assign(dep, updates);
        break;
      }
    }
  }
}

// ─── Query deposits by room ─────────────────────────────────────────────────

export async function getDepositsByRoom(roomId: string): Promise<EscrowDeposit[]> {
  try {
    const { data, error } = await supabase
      .from('escrow_deposits')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as EscrowDeposit[];
  } catch {
    // Fallback
    return Array.from(memoryStore.values()).filter(d => d.room_id === roomId);
  }
}

/**
 * Get all authorized (held) deposits for a room.
 * These are the deposits that can be captured/refunded/forfeited
 * when an on-chain event fires.
 */
export async function getAuthorizedDeposits(roomId: string): Promise<EscrowDeposit[]> {
  try {
    const { data, error } = await supabase
      .from('escrow_deposits')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'authorized')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as EscrowDeposit[];
  } catch {
    return Array.from(memoryStore.values())
      .filter(d => d.room_id === roomId && d.status === 'authorized');
  }
}

/**
 * Get a deposit by Stripe PaymentIntent ID.
 */
export async function getDepositByPaymentIntent(
  paymentIntentId: string
): Promise<EscrowDeposit | null> {
  try {
    const { data, error } = await supabase
      .from('escrow_deposits')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single();

    if (error) throw error;
    return data as EscrowDeposit;
  } catch {
    for (const dep of Array.from(memoryStore.values())) {
      if (dep.stripe_payment_intent_id === paymentIntentId) return dep;
    }
    return null;
  }
}
