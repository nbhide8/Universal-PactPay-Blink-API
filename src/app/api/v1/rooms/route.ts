import { NextRequest, NextResponse } from 'next/server';
import { getAllPublicRooms, createRoom } from '@/lib/database';
import { getEngine, isValidMode } from '@/lib/providers';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /api/v1/rooms — Browse all public escrow rooms
 *
 * Query params:
 *   page     (number, default 1)
 *   limit    (number, default 20, max 100)
 *   status   (string, e.g. "pending", "active", "funding")
 *   search   (string, searches title/description)
 *   sortBy   ("created_at" | "creator_stake_amount")
 *   sortOrder ("asc" | "desc", default "desc")
 *
 * Returns:
 *   { rooms: Room[], total: number, page: number, limit: number }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const result = await getAllPublicRooms({
      page: sp.get('page') ? parseInt(sp.get('page')!) : undefined,
      limit: sp.get('limit') ? parseInt(sp.get('limit')!) : undefined,
      status: sp.get('status') || undefined,
      search: sp.get('search') || undefined,
      sortBy: (sp.get('sortBy') as any) || undefined,
      sortOrder: (sp.get('sortOrder') as any) || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POST /api/v1/rooms — Create a new escrow room
 *
 * Every room creates an on-chain Solana PDA escrow. The "mode" determines
 * how the user interacts:
 *
 *   mode: "direct" (default)
 *     → User has a Solana wallet
 *     → API returns unsigned transaction
 *     → User signs and submits to /api/v1/tx/submit
 *
 *   mode: "custodial"
 *     → User does NOT need a wallet
 *     → API's platform wallet signs and submits the Solana tx
 *     → User pays via paymentRail: "stripe" (card) or "credits" (company balance)
 *     → Same on-chain escrow, different entry point
 *
 * Body (JSON):
 *   {
 *     walletAddress: string        — Creator's ID (wallet address or account ID)
 *     title: string                — Room title (required)
 *     description?: string
 *     creatorStakeAmount: number   — Must be >= joinerStakeAmount
 *     joinerStakeAmount: number
 *     mode?: 'direct' | 'custodial'         — Default: 'direct'
 *     paymentRail?: 'stripe' | 'credits'    — For custodial mode
 *     currency?: string            — e.g. 'SOL', 'USD' (inferred from mode)
 *     isPublic?: boolean           — Default true
 *     tags?: string[]
 *     contractDeadline?: string    — ISO date
 *     terms: { title, summary, conditions, additionalNotes? }
 *   }
 *
 * Returns:
 *   {
 *     success: true,
 *     room: Room,
 *     lockbox: {
 *       mode: 'direct' | 'custodial',
 *       blockchain: 'solana',
 *       onChain: true,
 *       action: { type, payload, instructions, metadata }
 *     }
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, title, description, creatorStakeAmount, joinerStakeAmount, terms, isPublic, tags, contractDeadline } = body;

    // Mode selection (default: direct for backward compatibility)
    // Also supports legacy "provider" field: solana→direct, stripe/ledger→custodial
    const mode = body.mode || (body.provider === 'stripe' || body.provider === 'ledger' ? 'custodial' : 'direct');
    if (!isValidMode(mode)) {
      return NextResponse.json(
        { success: false, error: `Invalid mode: ${mode}. Must be "direct" or "custodial"` },
        { status: 400 }
      );
    }

    // Validation
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'walletAddress is required (wallet address or account ID)' },
        { status: 400 }
      );
    }
    if (!title || !terms) {
      return NextResponse.json(
        { success: false, error: 'title and terms are required' },
        { status: 400 }
      );
    }
    if (!creatorStakeAmount || !joinerStakeAmount) {
      return NextResponse.json(
        { success: false, error: 'creatorStakeAmount and joinerStakeAmount are required' },
        { status: 400 }
      );
    }
    if (creatorStakeAmount < joinerStakeAmount) {
      return NextResponse.json(
        { success: false, error: 'Creator stake must be >= joiner stake (trust asymmetry)' },
        { status: 400 }
      );
    }

    // 1. Create room in database
    const room = await createRoom(walletAddress, walletAddress, {
      title,
      description,
      creatorStakeAmount,
      joinerStakeAmount,
      terms,
      isPublic: isPublic ?? true,
      tags,
      contractDeadline,
    });

    // 2. Delegate to the escrow engine
    const engine = getEngine(mode);
    const lockbox = await engine.createLockbox({
      roomId: room.id,
      creatorId: walletAddress,
      creatorStakeAmount,
      joinerStakeAmount,
      currency: body.currency,
      paymentRail: body.paymentRail,
    });

    return NextResponse.json(
      {
        success: true,
        room,
        lockbox,
        // Backward-compatible fields for direct/Solana mode
        ...(lockbox.mode === 'direct' && lockbox.action.payload
          ? {
              transaction: lockbox.action.payload,
              message: lockbox.action.instructions,
              accounts: lockbox.action.metadata,
            }
          : {}),
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }
}
