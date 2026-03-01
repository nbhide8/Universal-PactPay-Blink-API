import { NextRequest, NextResponse } from 'next/server';
import { getRoomFull } from '@/lib/database';
import { fetchOnChainRoom } from '@/lib/solana/transactions';

// Never cache this route — always query the database fresh
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/v1/rooms/[roomId] — Get complete room details
 *
 * Returns the database record merged with live on-chain escrow data.
 * No authentication required — all rooms are viewable via the API.
 *
 * Returns:
 *   {
 *     success: true,
 *     room: RoomView,               — Database record with participants, terms, stakes
 *     onChain: OnChainRoomData|null  — Live Solana escrow state (null if not yet initialized)
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const roomId = params.roomId;

    // Fetch database record
    const room = await getRoomFull(roomId);
    if (!room) {
      return NextResponse.json(
        { success: false, error: 'Room not found' },
        { status: 404 }
      );
    }

    // Fetch on-chain data (may be null if escrow not yet initialized)
    const onChain = await fetchOnChainRoom(roomId);

    const response = NextResponse.json({
      success: true,
      room,
      onChain,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
