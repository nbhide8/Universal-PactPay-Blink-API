import { NextRequest, NextResponse } from 'next/server';
import { submitSignedTransaction } from '@/lib/solana/transactions';
import { recordStake, getRoomPublic } from '@/lib/database';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/tx/submit — Submit a signed transaction to Solana
 *
 * This is the transaction relay endpoint. After receiving an unsigned
 * transaction from any Blink API endpoint, the client:
 *   1. Deserializes the base64 transaction
 *   2. Signs it with their wallet
 *   3. Re-serializes it
 *   4. POSTs the signed base64 here
 *
 * The API submits it to the Solana network and waits for confirmation.
 *
 * Optionally, pass `roomId` and `action` to trigger post-confirmation
 * database updates (e.g., recording a stake).
 *
 * Body:
 *   {
 *     signedTransaction: string    — Base64-encoded signed transaction
 *     roomId?: string              — Room ID (for post-tx DB updates)
 *     action?: string              — What action this tx represents
 *     walletAddress?: string       — Submitter's wallet
 *     metadata?: Record<string, any>
 *   }
 *
 * Returns:
 *   {
 *     success: true,
 *     signature: string,           — Solana tx signature
 *     confirmationStatus: string   — "confirmed" | "failed"
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signedTransaction, roomId, action, walletAddress, metadata } = body;

    if (!signedTransaction) {
      return NextResponse.json(
        { success: false, error: 'signedTransaction (base64) is required' },
        { status: 400 }
      );
    }

    // Submit to Solana
    const result = await submitSignedTransaction(signedTransaction);

    if (result.confirmationStatus === 'failed') {
      return NextResponse.json(
        { success: false, error: 'Transaction failed on-chain', signature: result.signature },
        { status: 400 }
      );
    }

    // Post-confirmation database updates
    if (roomId && action && walletAddress) {
      try {
        await handlePostConfirmation(roomId, action, walletAddress, result.signature, metadata);
      } catch (dbError: any) {
        // Non-fatal: tx succeeded on-chain even if DB update fails
        console.error('Post-confirmation DB update failed:', dbError.message);
      }
    }

    return NextResponse.json({
      success: true,
      signature: result.signature,
      confirmationStatus: result.confirmationStatus,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}

/**
 * Handle post-confirmation database updates based on the action type.
 */
async function handlePostConfirmation(
  roomId: string,
  action: string,
  walletAddress: string,
  txSignature: string,
  metadata?: Record<string, any>
) {
  switch (action) {
    case 'initialize_room': {
      // Room was already created in DB during POST /api/v1/rooms
      // Just update the escrow status
      const { supabase } = await import('@/lib/supabase');
      await supabase
        .from('rooms')
        .update({
          escrow_initialized: true,
          resolution_tx_signature: txSignature,
        })
        .eq('id', roomId);
      break;
    }
    case 'stake': {
      const room = await getRoomPublic(roomId);
      if (room) {
        const isCreator = metadata?.isCreator ?? false;
        const amount = isCreator ? room.creator_stake_amount : room.joiner_stake_amount;
        await recordStake(
          roomId,
          walletAddress,
          metadata?.participantId || walletAddress,
          amount,
          txSignature,
          walletAddress
        );
      }
      break;
    }
    case 'resolve':
    case 'slash':
    case 'cancel': {
      const { supabase } = await import('@/lib/supabase');
      const statusMap: Record<string, string> = {
        resolve: 'resolved',
        slash: 'slashed',
        cancel: 'cancelled',
      };
      await supabase
        .from('rooms')
        .update({
          status: statusMap[action],
          resolution_tx_signature: txSignature,
          ...(action === 'resolve' ? { resolved_at: new Date().toISOString() } : {}),
          ...(action === 'slash'
            ? { slashed_at: new Date().toISOString(), slashed_by: walletAddress }
            : {}),
        })
        .eq('id', roomId);
      break;
    }
  }
}
