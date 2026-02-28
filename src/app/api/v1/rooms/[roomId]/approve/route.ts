import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/lib/providers';
import { approveTerms, getRoomPublic } from '@/lib/database';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/approve — Approve resolution
 *
 * Records approval in DB + triggers on-chain approval:
 *   - direct:    returns unsigned approve_resolve Solana transaction
 *   - custodial: platform wallet signs & submits the approval on-chain
 *
 * Both parties must approve before the escrow can be resolved.
 *
 * Body:
 *   { walletAddress: string }
 *
 * Returns:
 *   { success: true, lockbox: { mode, blockchain, action } }
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

    const room = await getRoomPublic(params.roomId);
    if (!room) {
      return NextResponse.json(
        { success: false, error: 'Room not found' },
        { status: 404 }
      );
    }

    // 1. Record approval in database
    try {
      await approveTerms(params.roomId, walletAddress);
    } catch {
      // Non-fatal — might already be approved in DB
    }

    // 2. Delegate to escrow engine
    const engine = getEngine((room as any).mode || (room as any).provider);
    const lockbox = await engine.approveLockbox({
      roomId: params.roomId,
      approverId: walletAddress,
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
