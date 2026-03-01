import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/lib/providers';
import { getRoomFull } from '@/lib/database';
import { verifyRequestSignature, isSignatureRequired } from '@/lib/auth/verify';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/cancel — Cancel the escrow
 *
 * Creator cancels before fully funded. Returns any staked SOL.
 *   - direct:    returns unsigned cancel Solana transaction
 *   - custodial: platform wallet signs & submits the cancellation
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
    const sigResult = await verifyRequestSignature(body, 'cancel', params.roomId);
    if (sigResult && !sigResult.valid) {
      return NextResponse.json(
        { success: false, error: sigResult.error },
        { status: 401 }
      );
    }
    if (!sigResult && isSignatureRequired()) {
      return NextResponse.json(
        { success: false, error: 'Signature required. Sign message: blink:cancel:<roomId>:<timestamp>' },
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

    const joiner = room.participants?.find((p) => p.role === 'joiner');

    // Delegate to escrow engine
    const engine = getEngine((room as any).mode || (room as any).provider);
    const lockbox = await engine.cancelLockbox({
      roomId: params.roomId,
      callerAddress: walletAddress,
      joinerAddress: joiner?.wallet_address,
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
