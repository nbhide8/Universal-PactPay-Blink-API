import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/lib/providers';
import { getRoomFull } from '@/lib/database';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/slash — Slash the escrow (penalty)
 *
 * Sends ALL staked SOL to the penalty wallet. Both parties lose.
 *   - direct:    returns unsigned slash Solana transaction
 *   - custodial: platform wallet signs & submits the slash
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

    const room = await getRoomFull(params.roomId);
    if (!room) {
      return NextResponse.json(
        { success: false, error: 'Room not found' },
        { status: 404 }
      );
    }

    const creator = room.participants?.find((p) => p.role === 'creator');
    const joiner = room.participants?.find((p) => p.role === 'joiner');

    if (!creator || !joiner) {
      return NextResponse.json(
        { success: false, error: 'Both participants required' },
        { status: 400 }
      );
    }

    // Delegate to escrow engine
    const engine = getEngine((room as any).mode || (room as any).provider);
    const lockbox = await engine.slashLockbox({
      roomId: params.roomId,
      callerAddress: walletAddress,
      creatorParticipantId: creator.id,
      joinerParticipantId: joiner.id,
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
