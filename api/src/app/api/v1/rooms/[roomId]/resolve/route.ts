import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/lib/providers';
import { getRoomFull } from '@/lib/database';
import { verifyRequestSignature, isSignatureRequired } from '@/lib/auth/verify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/resolve — Resolve the escrow
 *
 * Returns staked SOL to both parties. Both must have approved first.
 *   - direct:    returns unsigned resolve Solana transaction
 *   - custodial: platform wallet signs & submits; SOL returns to treasury
 *
 * Body: { walletAddress: string }
 * Returns: { success, lockbox: { mode, blockchain, action } }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'walletAddress is required' },
        { status: 400 }
      );
    }

    // Verify wallet signature
    const sigResult = await verifyRequestSignature(body, 'resolve', params.roomId);
    if (sigResult && !sigResult.valid) {
      return NextResponse.json(
        { success: false, error: sigResult.error },
        { status: 401 }
      );
    }
    if (!sigResult && isSignatureRequired()) {
      return NextResponse.json(
        { success: false, error: 'Signature required. Sign message: stakeguard:resolve:<roomId>:<timestamp>' },
        { status: 401 }
      );
    }

    const room = await getRoomFull(params.roomId);
    if (!room) {
      return NextResponse.json(
        { success: false, error: 'Room not found' },
        { status: 404 }
      );
    }

    if (!room.creator_wallet || !room.joiner_wallet) {
      return NextResponse.json(
        { success: false, error: 'Both creator and joiner must be in the room' },
        { status: 400 }
      );
    }

    // Only the creator can sign the resolve tx (they authorize the reward transfer)
    if (walletAddress !== room.creator_wallet) {
      return NextResponse.json(
        { success: false, error: 'Only the room creator can sign the resolve transaction (reward transfer requires creator authorization)' },
        { status: 403 }
      );
    }

    // Delegate to escrow engine — wallet addresses are participant IDs
    const engine = getEngine((room as any).mode || (room as any).provider);
    const lockbox = await engine.resolveLockbox({
      roomId: params.roomId,
      callerAddress: walletAddress,
      creatorParticipantId: room.creator_wallet,
      joinerParticipantId: room.joiner_wallet,
      creatorAddress: room.creator_wallet,
      joinerAddress: room.joiner_wallet,
      rewardAmount: room.reward_amount || 0,
    });

    return NextResponse.json({
      success: true,
      lockbox,
      // Backward-compatible Solana fields for direct mode
      ...(lockbox.mode === 'direct' && lockbox.action.payload
        ? {
            transaction: lockbox.action.payload,
            message: lockbox.action.instructions,
            accounts: lockbox.action.metadata,
          }
        : {}),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
