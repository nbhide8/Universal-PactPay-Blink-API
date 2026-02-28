import { NextRequest, NextResponse } from 'next/server';
import { getMessages, sendMessage, markMessagesRead } from '@/lib/database';

/**
 * GET  /api/rooms/[roomId]/messages — Get messages for a room
 * POST /api/rooms/[roomId]/messages — Send a message
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
    const before = request.nextUrl.searchParams.get('before') || undefined;

    const messages = await getMessages(params.roomId, limit, before);
    return NextResponse.json(messages);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const body = await request.json();
    const { userId, content, markRead, role } = body;

    if (markRead && role) {
      await markMessagesRead(params.roomId, userId, role);
      return NextResponse.json({ success: true });
    }

    if (!userId || !content) {
      return NextResponse.json({ error: 'userId and content required' }, { status: 400 });
    }

    const message = await sendMessage(params.roomId, userId, content);
    return NextResponse.json(message, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
