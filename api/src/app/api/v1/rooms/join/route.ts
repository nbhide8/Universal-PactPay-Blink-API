import { NextRequest, NextResponse } from 'next/server';
import { joinRoom } from '@/lib/database';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/join — Join a room by join code (no roomId needed)
 *
 * The caller provides a 6-character join code. The API looks up the room
 * and adds the joiner.
 *
 * Body:
 *   {
 *     walletAddress: string   — Joiner's wallet address or account ID
 *     joinCode: string        — 6-character room code
 *   }
 *
 * Returns:
 *   { success: true, room: Room }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, userId, joinCode } = body;

    const wallet = walletAddress || userId;
    if (!wallet || !joinCode) {
      return NextResponse.json(
        { success: false, error: 'walletAddress and joinCode are required' },
        { status: 400 }
      );
    }

    const room = await joinRoom(wallet, wallet, joinCode);

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
