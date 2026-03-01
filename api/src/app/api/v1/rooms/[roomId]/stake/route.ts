import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/lib/providers';
import { getRoomPublic } from '@/lib/database';
import { verifyRequestSignature, isSignatureRequired } from '@/lib/auth/verify';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/stake — Fund the escrow lockbox
 *
 * Stakes SOL into the on-chain PDA escrow. The mode determines who signs:
 *   - direct:    returns unsigned Solana transaction for user to sign
 *   - custodial: platform wallet signs & submits; user pays via payment rail
 *
 * Both modes lock real SOL on the Solana blockchain.
 *
 * Body:
 *   {
 *     walletAddress: string    — Staker's wallet / account ID
 *     participantId: string    — Participant record ID (from join)
 *     isCreator: boolean       — Whether this is the creator staking
 *   }
 *
 * Returns:
 *   {
 *     success: true,
 *     lockbox: { mode, blockchain: 'solana', onChain: true, action },
 *     stakeAmount: number
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const body = await request.json();
    const { walletAddress, participantId, isCreator } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'walletAddress is required' },
        { status: 400 }
      );
    }

    // Verify wallet signature (proves caller owns the wallet)
    const sigResult = await verifyRequestSignature(body, 'stake', params.roomId);
    if (sigResult && !sigResult.valid) {
      return NextResponse.json(
        { success: false, error: sigResult.error },
        { status: 401 }
      );
    }
    if (!sigResult && isSignatureRequired()) {
      return NextResponse.json(
        { success: false, error: 'Signature required. Sign message: stakeguard:stake:<roomId>:<timestamp>' },
        { status: 401 }
      );
    }

    // Look up the room to get stake amounts and mode
    const room = await getRoomPublic(params.roomId);
    if (!room) {
      return NextResponse.json(
        { success: false, error: 'Room not found' },
        { status: 404 }
      );
    }

    // Prevent double staking
    if (isCreator && room.creator_funded) {
      return NextResponse.json(
        { success: false, error: 'Creator has already staked' },
        { status: 400 }
      );
    }
    if (!isCreator && room.joiner_funded) {
      return NextResponse.json(
        { success: false, error: 'Joiner has already staked' },
        { status: 400 }
      );
    }

    // Creator stakes collateral + reward (reward is locked in escrow for the worker)
    // Joiner stakes their collateral only
    const amount = isCreator
      ? room.creator_stake_amount + (room.reward_amount || 0)
      : room.joiner_stake_amount;

    // Use walletAddress as participantId if not provided
    const pid = participantId || walletAddress;

    // Delegate to the escrow engine (mode stored on room, defaults to direct)
    const engine = getEngine((room as any).mode || (room as any).provider);
    const lockbox = await engine.fundLockbox({
      roomId: params.roomId,
      funderId: walletAddress,
      participantId: pid,
      amount,
      isCreator: !!isCreator,
      paymentRail: (room as any).paymentRail,
    });

    return NextResponse.json({
      success: true,
      lockbox,
      stakeAmount: amount,
      // Backward-compatible Solana fields for direct mode
      ...(lockbox.mode === 'direct' && lockbox.action.payload
        ? {
            transaction: lockbox.action.payload,
            message: lockbox.action.instructions,
            accounts: lockbox.action.metadata,
            stakeAmountSol: amount,
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
