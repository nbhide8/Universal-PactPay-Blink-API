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
      // Mark escrow as initialized in metadata
      const { supabase } = await import('@/lib/supabase');
      const { data: initRoom } = await supabase
        .from('rooms')
        .select('metadata')
        .eq('id', roomId)
        .single();
      if (initRoom) {
        const meta = (initRoom.metadata || {}) as Record<string, any>;
        meta.escrow_initialized = true;
        meta.init_tx_sig = txSignature;
        await supabase
          .from('rooms')
          .update({ metadata: meta })
          .eq('id', roomId);
      }
      break;
    }
    case 'stake': {
      const room = await getRoomPublic(roomId);
      if (room) {
        const isCreator = metadata?.isCreator ?? false;
        // Creator stakes collateral + reward; joiner stakes just their collateral
        const amount = isCreator
          ? room.creator_stake_amount + (room.reward_amount || 0)
          : room.joiner_stake_amount;
        await recordStake(roomId, walletAddress, amount, txSignature);
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
      // Update status + store terminal metadata
      const { data: termRoom } = await supabase
        .from('rooms')
        .select('metadata')
        .eq('id', roomId)
        .single();
      const meta = ((termRoom?.metadata || {}) as Record<string, any>);
      meta.resolution_tx_sig = txSignature;
      if (action === 'resolve') meta.resolved_at = new Date().toISOString();
      if (action === 'slash') {
        meta.slashed_at = new Date().toISOString();
        meta.slashed_by = walletAddress;
      }
      await supabase
        .from('rooms')
        .update({
          status: statusMap[action],
          metadata: meta,
        })
        .eq('id', roomId);
      break;
    }
    case 'resolveapprove': {
      // On-chain approveResolve confirmed — record in DB via system message
      const { supabase: sb } = await import('@/lib/supabase');
      const { getRoomFull: getRoomFullForApprove } = await import('@/lib/database');
      const room = await getRoomFullForApprove(roomId);
      if (room) {
        const isCreator = room.creator_wallet === walletAddress;
        const isJoiner = room.joiner_wallet === walletAddress;
        const creatorApproved = isCreator ? true : !!room.creator_resolve_approved;
        const joinerApproved = isJoiner ? true : !!room.joiner_resolve_approved;
        const bothApproved = creatorApproved && joinerApproved;
        await sb.from('messages').insert({
          room_id: roomId,
          sender_wallet: walletAddress,
          type: 'system',
          content: bothApproved
            ? 'Both parties approved resolution on-chain! Creator must now sign the resolve transaction.'
            : `${isCreator ? 'Creator' : 'Joiner'} approved resolution on-chain. Waiting for the other party.`,
          metadata: {
            action: bothApproved ? 'both_approved' : 'resolve_approved',
            approve_tx_sig: txSignature,
          },
        });
      }
      break;
    }
  }
}
