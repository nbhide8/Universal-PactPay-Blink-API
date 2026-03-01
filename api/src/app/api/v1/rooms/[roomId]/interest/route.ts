import { NextRequest, NextResponse } from 'next/server';
import { markInterest, removeInterest, getRoomFull } from '@/lib/database';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/interest — Mark interest in a room
 *
 * Only works when the room status is 'open' (creator has staked).
 *
 * Body: { walletAddress: string }
 * Returns: { success: true, room: RoomView }
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

    await markInterest(params.roomId, walletAddress);
    const room = await getRoomFull(params.roomId);

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DELETE /api/v1/rooms/[roomId]/interest — Remove interest
 *
 * Body: { walletAddress: string }
 * Returns: { success: true }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function DELETE(
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

    await removeInterest(params.roomId, walletAddress);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
