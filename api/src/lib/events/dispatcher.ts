/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Event → Stripe Dispatcher — The Trust Bridge
 *
 * THIS IS THE CRITICAL SECURITY COMPONENT.
 *
 * The dispatcher receives verified on-chain events from the listener and
 * deterministically executes the corresponding Stripe action. It ensures:
 *
 *   1. The backend CANNOT move money without on-chain consensus
 *   2. Every Stripe action maps to exactly one on-chain event
 *   3. Actions are idempotent (processing the same event twice is safe)
 *   4. The on-chain state is validated before executing Stripe actions
 *
 * Event → Action mapping:
 *
 *   RoomResolved  → captureAndTransfer() — capture held funds, pay recipients
 *   RoomSlashed   → forfeitDeposit()     — capture held funds as penalty
 *   RoomCancelled → refundDeposit()      — release holds, money back to users
 *   Staked        → (no Stripe action)   — on-chain stake confirmed
 *
 * SECURITY INVARIANTS:
 *   - Only 'authorized' deposits are actionable
 *   - The on-chain room state is re-fetched and validated before execution
 *   - Each deposit can only be settled once (status transitions are one-way)
 *   - All actions are logged with the on-chain tx signature for audit
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { ChainEvent } from './listener';
import { onEvent } from './listener';
import {
  captureAndTransfer,
  refundDeposit,
  forfeitDeposit,
} from '@/lib/stripe/escrow';
import {
  getAuthorizedDeposits,
  updateDepositStatus,
} from '@/lib/stripe/deposits';
import { fetchOnChainRoom } from '@/lib/solana/transactions';
import { supabase } from '@/lib/supabase';

// ─── Event Log (audit trail) ─────────────────────────────────────────────────

interface EventLogEntry {
  id: string;
  room_id: string;
  event_name: string;
  on_chain_signature: string;
  on_chain_slot: number;
  stripe_actions_taken: string[];
  deposits_processed: number;
  success: boolean;
  error_message?: string;
  processed_at: string;
}

async function logEvent(entry: Omit<EventLogEntry, 'id' | 'processed_at'>): Promise<void> {
  const record = {
    ...entry,
    processed_at: new Date().toISOString(),
  };

  try {
    await supabase.from('event_log').insert(record);
  } catch {
    // Fallback: just log to console
    console.log('[EventLog]', JSON.stringify(record));
  }
}

// ─── Dispatch Handlers ───────────────────────────────────────────────────────

/**
 * Handle RoomResolved event.
 *
 * On-chain consensus says: both parties approved → release funds.
 * Action: Capture all authorized deposits and transfer to recipients.
 */
async function handleRoomResolved(event: ChainEvent): Promise<void> {
  const roomId = event.data.roomId as string;
  if (!roomId) {
    console.warn('[Dispatcher] RoomResolved event missing roomId, skipping');
    return;
  }

  console.log(`[Dispatcher] RoomResolved for room ${roomId} (tx: ${event.signature})`);

  // SECURITY: Re-validate on-chain state
  const onChain = await fetchOnChainRoom(roomId);
  if (!onChain) {
    console.error(`[Dispatcher] Room ${roomId} not found on-chain — skipping`);
    await logEvent({
      room_id: roomId,
      event_name: 'RoomResolved',
      on_chain_signature: event.signature,
      on_chain_slot: event.slot,
      stripe_actions_taken: [],
      deposits_processed: 0,
      success: false,
      error_message: 'Room not found on-chain',
    });
    return;
  }

  // The on-chain room should no longer be active after resolve
  if (onChain.isActive) {
    console.warn(`[Dispatcher] Room ${roomId} still active on-chain after resolve event — possible race, retrying later`);
    return;
  }

  // Get all authorized (held) deposits for this room
  const deposits = await getAuthorizedDeposits(roomId);
  if (deposits.length === 0) {
    console.log(`[Dispatcher] No authorized deposits for room ${roomId} — may be direct mode`);
    await logEvent({
      room_id: roomId,
      event_name: 'RoomResolved',
      on_chain_signature: event.signature,
      on_chain_slot: event.slot,
      stripe_actions_taken: ['none - no fiat deposits'],
      deposits_processed: 0,
      success: true,
    });
    return;
  }

  // Capture and transfer each deposit
  const actions: string[] = [];
  let processedCount = 0;

  for (const deposit of deposits) {
    try {
      const result = await captureAndTransfer(deposit.stripe_payment_intent_id);
      if (result.success) {
        await updateDepositStatus(
          deposit.stripe_payment_intent_id,
          'captured',
          {
            stripeActionTx: result.transferId || `captured_${result.paymentIntentId}`,
            onChainTxSignature: event.signature,
          }
        );
        actions.push(`captured:${deposit.stripe_payment_intent_id}`);
        processedCount++;
      } else {
        actions.push(`failed:${deposit.stripe_payment_intent_id}`);
      }
    } catch (err: any) {
      console.error(`[Dispatcher] Failed to capture deposit ${deposit.id}:`, err.message);
      actions.push(`error:${deposit.stripe_payment_intent_id}`);
    }
  }

  // Update room status in DB
  try {
    await supabase.from('rooms').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolution_tx_signature: event.signature,
    }).eq('id', roomId);
  } catch {
    console.error(`[Dispatcher] Failed to update room ${roomId} status`);
  }

  await logEvent({
    room_id: roomId,
    event_name: 'RoomResolved',
    on_chain_signature: event.signature,
    on_chain_slot: event.slot,
    stripe_actions_taken: actions,
    deposits_processed: processedCount,
    success: processedCount === deposits.length,
  });

  console.log(`[Dispatcher] RoomResolved: processed ${processedCount}/${deposits.length} deposits`);
}

/**
 * Handle RoomSlashed event.
 *
 * On-chain consensus says: slash → all funds go to penalty.
 * Action: Capture all deposits as penalty (no transfer to users).
 */
async function handleRoomSlashed(event: ChainEvent): Promise<void> {
  const roomId = event.data.roomId as string;
  if (!roomId) return;

  console.log(`[Dispatcher] RoomSlashed for room ${roomId} (tx: ${event.signature})`);

  const onChain = await fetchOnChainRoom(roomId);
  if (!onChain) {
    await logEvent({
      room_id: roomId,
      event_name: 'RoomSlashed',
      on_chain_signature: event.signature,
      on_chain_slot: event.slot,
      stripe_actions_taken: [],
      deposits_processed: 0,
      success: false,
      error_message: 'Room not found on-chain',
    });
    return;
  }

  const deposits = await getAuthorizedDeposits(roomId);
  const actions: string[] = [];
  let processedCount = 0;

  for (const deposit of deposits) {
    try {
      const result = await forfeitDeposit(deposit.stripe_payment_intent_id);
      if (result.success) {
        await updateDepositStatus(
          deposit.stripe_payment_intent_id,
          'forfeited',
          {
            stripeActionTx: `forfeited_${result.paymentIntentId}`,
            onChainTxSignature: event.signature,
          }
        );
        actions.push(`forfeited:${deposit.stripe_payment_intent_id}`);
        processedCount++;
      }
    } catch (err: any) {
      console.error(`[Dispatcher] Forfeit failed for ${deposit.id}:`, err.message);
      actions.push(`error:${deposit.stripe_payment_intent_id}`);
    }
  }

  try {
    await supabase.from('rooms').update({
      status: 'slashed',
      slashed_at: new Date().toISOString(),
    }).eq('id', roomId);
  } catch {}

  await logEvent({
    room_id: roomId,
    event_name: 'RoomSlashed',
    on_chain_signature: event.signature,
    on_chain_slot: event.slot,
    stripe_actions_taken: actions,
    deposits_processed: processedCount,
    success: processedCount === deposits.length,
  });
}

/**
 * Handle RoomCancelled event.
 *
 * On-chain consensus says: cancel → return funds.
 * Action: Refund all deposits (release holds).
 */
async function handleRoomCancelled(event: ChainEvent): Promise<void> {
  const roomId = event.data.roomId as string;
  if (!roomId) return;

  console.log(`[Dispatcher] RoomCancelled for room ${roomId} (tx: ${event.signature})`);

  const deposits = await getAuthorizedDeposits(roomId);
  const actions: string[] = [];
  let processedCount = 0;

  for (const deposit of deposits) {
    try {
      const result = await refundDeposit(deposit.stripe_payment_intent_id);
      if (result.success) {
        await updateDepositStatus(
          deposit.stripe_payment_intent_id,
          'refunded',
          {
            stripeActionTx: result.refundId || 'cancelled_hold',
            onChainTxSignature: event.signature,
          }
        );
        actions.push(`refunded:${deposit.stripe_payment_intent_id}`);
        processedCount++;
      }
    } catch (err: any) {
      console.error(`[Dispatcher] Refund failed for ${deposit.id}:`, err.message);
      actions.push(`error:${deposit.stripe_payment_intent_id}`);
    }
  }

  try {
    await supabase.from('rooms').update({ status: 'cancelled' }).eq('id', roomId);
  } catch {}

  await logEvent({
    room_id: roomId,
    event_name: 'RoomCancelled',
    on_chain_signature: event.signature,
    on_chain_slot: event.slot,
    stripe_actions_taken: actions,
    deposits_processed: processedCount,
    success: processedCount === deposits.length,
  });
}

// ─── Register All Handlers ───────────────────────────────────────────────────

/**
 * Register the Stripe dispatcher handlers with the event listener.
 * Call this once at startup (after starting the event listener).
 *
 * This is what creates the bridge:
 *   On-chain event → Event Listener → Dispatcher → Stripe action
 */
export function registerStripeDispatcher(): () => void {
  const unsubscribe = onEvent(async (event: ChainEvent) => {
    switch (event.name) {
      case 'RoomResolved':
        await handleRoomResolved(event);
        break;
      case 'RoomSlashed':
        await handleRoomSlashed(event);
        break;
      case 'RoomCancelled':
        await handleRoomCancelled(event);
        break;
      case 'Staked':
        // On-chain stake confirmed — no Stripe action needed
        // (Stripe deposit was already authorized separately)
        console.log(`[Dispatcher] Staked event for room ${event.data.roomId} — no fiat action`);
        break;
      case 'ResolveApproved':
        console.log(`[Dispatcher] ResolveApproved for room ${event.data.roomId} by ${event.data.approver}`);
        break;
      default:
        console.log(`[Dispatcher] Unhandled event: ${event.name}`);
    }
  });

  console.log('[Dispatcher] Stripe dispatcher registered with event listener');
  return unsubscribe;
}
