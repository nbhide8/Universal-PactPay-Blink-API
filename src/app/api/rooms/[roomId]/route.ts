import { NextRequest, NextResponse } from 'next/server';
import { getRoomView, approveTerms, recordStake, createActionRequest, respondToAction } from '@/lib/database';

/**
 * GET  /api/rooms/[roomId] — Get room details
 * POST /api/rooms/[roomId] — Perform actions (approve terms, record stake, etc.)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const room = await getRoomView(params.roomId, userId);
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    return NextResponse.json(room);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const body = await request.json();
    const { action, userId, ...data } = body;

    if (!action || !userId) {
      return NextResponse.json({ error: 'action and userId required' }, { status: 400 });
    }

    switch (action) {
      case 'approve_terms':
        await approveTerms(params.roomId, userId);
        return NextResponse.json({ success: true, message: 'Terms approved' });

      case 'record_stake':
        const stake = await recordStake(
          params.roomId,
          userId,
          data.participantId,
          data.amountSol,
          data.txSignature,
          data.walletAddress
        );
        return NextResponse.json(stake);

      case 'create_action':
        const actionRequest = await createActionRequest(
          params.roomId,
          userId,
          data.actionType,
          data.reason,
          data.evidenceUrls
        );
        return NextResponse.json(actionRequest);

      case 'respond_action':
        await respondToAction(data.actionRequestId, userId, data.approved, data.message);
        return NextResponse.json({ success: true });

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
