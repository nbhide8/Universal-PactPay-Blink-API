import { NextRequest, NextResponse } from 'next/server';
import { joinRoom } from '@/lib/database';

/**
 * POST /api/rooms/join — Join a room via join code
 * Body: { userId, walletAddress, joinCode }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, walletAddress, joinCode } = body;

    if (!userId || !walletAddress || !joinCode) {
      return NextResponse.json(
        { error: 'userId, walletAddress, and joinCode are required' },
        { status: 400 }
      );
    }

    const room = await joinRoom(userId, walletAddress, joinCode);
    return NextResponse.json(room);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
