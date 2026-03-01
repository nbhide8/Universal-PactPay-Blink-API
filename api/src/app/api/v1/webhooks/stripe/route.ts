/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/webhooks/stripe — Stripe Webhook Handler
 *
 * Receives webhook events from Stripe and updates deposit status.
 * Critical events:
 *
 *   payment_intent.amount_capturable_updated
 *     → Payment confirmed, funds are held. Mark deposit as 'authorized'.
 *       This triggers the platform wallet to stake SOL on-chain.
 *
 *   payment_intent.payment_failed
 *     → Payment failed. Mark deposit as 'failed'.
 *
 *   payment_intent.canceled
 *     → Payment canceled externally.
 *
 * SECURITY:
 *   - Verifies webhook signature using STRIPE_WEBHOOK_SECRET
 *   - Only processes events with Blink metadata
 *   - Idempotent: safe to receive the same event multiple times
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getWebhookSecret, isStripeAvailable } from '@/lib/stripe/client';
import { updateDepositStatus, getDepositByPaymentIntent } from '@/lib/stripe/deposits';
import { custodialSignAndSubmit, isCustodialAvailable, getPlatformWalletAddress } from '@/lib/solana/custodial';
import { buildStakeTx } from '@/lib/solana/transactions';
import { getRoomPublic } from '@/lib/database';

export async function POST(request: NextRequest) {
  if (!isStripeAvailable()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  // Read raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, getWebhookSecret());
  } catch (err: any) {
    console.error('[StripeWebhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Only process Blink-related events
  const pi = (event.data.object as any);
  const roomId = pi?.metadata?.blink_room_id;

  if (!roomId) {
    // Not a Blink payment — acknowledge and ignore
    return NextResponse.json({ received: true });
  }

  console.log(`[StripeWebhook] ${event.type} for room ${roomId} (PI: ${pi.id})`);

  try {
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated': {
        // Payment confirmed → funds are held on the card
        // Mark deposit as authorized
        await updateDepositStatus(pi.id, 'authorized');

        // AUTO-STAKE: Platform wallet stakes SOL on-chain for this user
        if (isCustodialAvailable()) {
          const userId = pi.metadata.blink_user_id;
          const role = pi.metadata.blink_role as 'creator' | 'joiner';

          const room = await getRoomPublic(roomId);
          if (room) {
            const amount = role === 'creator'
              ? room.creator_stake_amount
              : room.joiner_stake_amount;

            const platformWallet = getPlatformWalletAddress();

            try {
              const txResult = await buildStakeTx({
                walletAddress: platformWallet,
                roomId,
                participantId: userId,
                amount,
                isCreator: role === 'creator',
              });

              const { signature: txSig } = await custodialSignAndSubmit(txResult.transaction);

              await updateDepositStatus(pi.id, 'authorized', {
                onChainStaked: true,
                onChainTxSignature: txSig,
              });

              console.log(`[StripeWebhook] Auto-staked ${amount} SOL for ${role} (tx: ${txSig})`);
            } catch (stakeErr: any) {
              console.error(`[StripeWebhook] Auto-stake failed:`, stakeErr.message);
              // Deposit is still authorized — will need manual stake or retry
            }
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        await updateDepositStatus(pi.id, 'failed');
        console.log(`[StripeWebhook] Payment failed for room ${roomId}`);
        break;
      }

      case 'payment_intent.canceled': {
        await updateDepositStatus(pi.id, 'refunded');
        console.log(`[StripeWebhook] Payment canceled for room ${roomId}`);
        break;
      }

      default:
        // Acknowledge but don't process
        break;
    }
  } catch (err: any) {
    console.error(`[StripeWebhook] Processing error:`, err.message);
    // Still return 200 to prevent Stripe retries for our errors
  }

  return NextResponse.json({ received: true });
}
