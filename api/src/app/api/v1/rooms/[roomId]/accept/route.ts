import { NextRequest, NextResponse } from 'next/server';
import { acceptJoiner, getRoomFull } from '@/lib/database';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/accept — Creator accepts an interested joiner
 *
 * Only the room creator can call this. The room must be 'open'.
 * Sets joiner_wallet, transitions status to 'awaiting_joiner_stake'.
 *
 * Body: { walletAddress: string, joinerWallet: string }
 * Returns: { success: true, room: RoomView }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const body = await request.json();
    const { walletAddress, joinerWallet } = body;

    if (!walletAddress || !joinerWallet) {
      return NextResponse.json(
        { success: false, error: 'walletAddress (creator) and joinerWallet are required' },
        { status: 400 }
      );
    }

    await acceptJoiner(params.roomId, walletAddress, joinerWallet);
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
