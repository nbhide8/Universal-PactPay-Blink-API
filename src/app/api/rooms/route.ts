import { NextRequest, NextResponse } from 'next/server';
import { createRoom, getUserRooms } from '@/lib/database';

/**
 * POST /api/rooms — Create a new room
 * GET  /api/rooms — List user's rooms
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, walletAddress, ...roomData } = body;

    if (!userId || !walletAddress) {
      return NextResponse.json({ error: 'userId and walletAddress required' }, { status: 400 });
    }

    const room = await createRoom(userId, walletAddress, roomData);
    return NextResponse.json(room, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const rooms = await getUserRooms(userId);
    return NextResponse.json(rooms);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
