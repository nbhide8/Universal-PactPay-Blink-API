import { NextRequest, NextResponse } from 'next/server';
import { getRoomFull } from '@/lib/database';
import { getEngine } from '@/lib/providers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms/[roomId]/resolve-approve — Approve resolution ON-CHAIN
 *
 * Each party (creator & joiner) calls this endpoint to approve resolution.
 * The API builds an unsigned `approveResolve` Solana transaction and returns
 * it as a lockbox. The user signs and submits it via /tx/submit.
 *
 * The on-chain program tracks approval flags in the RoomEscrow PDA.
 * The /tx/submit handler records the approval in the DB after confirmation.
 *
 * When BOTH have approved on-chain, the creator can then call /resolve
 * to finalize and release funds.
 *
 * Body: { walletAddress: string }
 * Returns: { success, lockbox, creatorApproved, joinerApproved, bothApproved }
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

    const room = await getRoomFull(params.roomId);
    if (!room) {
      return NextResponse.json(
        { success: false, error: 'Room not found' },
        { status: 404 }
      );
    }

    // Must be active (both parties staked) to approve resolution
    if (room.status !== 'active') {
      return NextResponse.json(
        { success: false, error: `Cannot approve resolution in status: ${room.status}. Both parties must stake first.` },
        { status: 400 }
      );
    }

    // Determine who is calling
    const isCreator = room.creator_wallet === walletAddress;
    const isJoiner = room.joiner_wallet === walletAddress;

    if (!isCreator && !isJoiner) {
      return NextResponse.json(
        { success: false, error: 'Only participants can approve resolution' },
        { status: 403 }
      );
    }

    // Check if already approved in DB (derived from system messages)
    const creatorApproved = (room as any).creator_resolve_approved ?? false;
    const joinerApproved = (room as any).joiner_resolve_approved ?? false;

    if (isCreator && creatorApproved) {
      return NextResponse.json(
        { success: false, error: 'You have already approved resolution' },
        { status: 400 }
      );
    }
    if (isJoiner && joinerApproved) {
      return NextResponse.json(
        { success: false, error: 'You have already approved resolution' },
        { status: 400 }
      );
    }

    // Build on-chain approveResolve transaction via engine
    const engine = getEngine((room as any).mode || (room as any).provider);
    const lockbox = await engine.approveLockbox({
      approverId: walletAddress,
      roomId: params.roomId,
    });

    // Predict new approval state after this tx confirms
    const newCreatorApproved = isCreator ? true : creatorApproved;
    const newJoinerApproved = isJoiner ? true : joinerApproved;
    const bothApproved = newCreatorApproved && newJoinerApproved;

    return NextResponse.json({
      success: true,
      lockbox,
      creatorApproved: newCreatorApproved,
      joinerApproved: newJoinerApproved,
      bothApproved,
      resolved: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
