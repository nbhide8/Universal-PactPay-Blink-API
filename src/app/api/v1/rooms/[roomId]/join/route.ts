import { NextRequest, NextResponse } from 'next/server';
import { joinRoom } from '@/lib/database';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/join — Join a room via join code
 *
 * This is a database-only operation (no on-chain tx needed to join).
 * The joiner will need to stake separately after reviewing terms.
 *
 * Body:
 *   {
 *     walletAddress: string  — Joiner's Solana wallet
 *     joinCode: string       — 6-character room code
 *   }
 *
 * Returns:
 *   { success: true, room: Room }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const body = await request.json();
    const { walletAddress, joinCode } = body;

    if (!walletAddress || !joinCode) {
      return NextResponse.json(
        { success: false, error: 'walletAddress and joinCode are required' },
        { status: 400 }
      );
    }

    const room = await joinRoom(walletAddress, walletAddress, joinCode);

    return NextResponse.json({
      success: true,
      room,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
