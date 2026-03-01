import { createServiceClient } from './supabase';
import type { Room, RoomView, Message, CreateRoomRequest } from './types';
import { getRoomEscrowPDA } from './solana/pda';

// Service client — bypasses RLS
const supabase = createServiceClient();

// ============================================================================
// ROOMS — CREATE
// ============================================================================

/**
 * Create a new room. Status starts as 'pending' — transitions to 'open'
 * after the creator's init + stake transactions confirm on-chain.
 */
export async function createRoom(
  walletAddress: string,
  request: CreateRoomRequest
): Promise<Room> {
  const { data: room, error } = await supabase
    .from('rooms')
    .insert({
      status: 'pending',
      reward_amount: request.rewardAmount,
      creator_stake_amount: request.creatorStakeAmount,
      joiner_stake_amount: request.joinerStakeAmount,
      creator_wallet: walletAddress,
      is_public: request.isPublic ?? true,
      creator_funded: false,
      joiner_funded: false,
      metadata: {
        title: request.title,
        description: request.description || null,
        tags: request.tags ?? [],
        escrow_pda: getRoomEscrowPDA(walletAddress).toBase58(),
        escrow_initialized: false,
        contract_deadline: request.contractDeadline || null,
        terms: request.terms
          ? {
              title: request.terms.title,
              summary: request.terms.summary,
              conditions: request.terms.conditions ?? [],
            }
          : null,
        interested_wallets: [],
      },
    })
    .select()
    .single();

  if (error || !room) throw new Error(`Failed to create room: ${error?.message}`);

  // System message
  await supabase.from('messages').insert({
    room_id: room.id,
    type: 'system',
    content: `Room "${request.title}" created.`,
    metadata: { action: 'room_created' },
  });

  return room as Room;
}

// ============================================================================
// ROOMS — MARK INTEREST
// ============================================================================

/**
 * A joiner marks interest in a room. Only works when status = 'open'
 * (creator has already staked).
 */
export async function markInterest(
  roomId: string,
  walletAddress: string
): Promise<void> {
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room) throw new Error('Room not found');
  if (room.status !== 'open') throw new Error('Room is not accepting interest yet');
  if (room.creator_wallet === walletAddress) throw new Error('Cannot mark interest on your own room');

  const meta = (room.metadata || {}) as Record<string, any>;
  const interested = meta.interested_wallets || [];
  if (interested.includes(walletAddress)) throw new Error('Already marked interest');

  meta.interested_wallets = [...interested, walletAddress];
  await supabase.from('rooms').update({ metadata: meta }).eq('id', roomId);

  await supabase.from('messages').insert({
    room_id: roomId,
    sender_wallet: walletAddress,
    type: 'system',
    content: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} marked interest`,
    metadata: { action: 'interest_marked', wallet: walletAddress },
  });
}

// ============================================================================
// ROOMS — REMOVE INTEREST
// ============================================================================

export async function removeInterest(
  roomId: string,
  walletAddress: string
): Promise<void> {
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room) throw new Error('Room not found');

  const meta = (room.metadata || {}) as Record<string, any>;
  const interested = meta.interested_wallets || [];
  meta.interested_wallets = interested.filter((w: string) => w !== walletAddress);

  await supabase.from('rooms').update({ metadata: meta }).eq('id', roomId);
}

// ============================================================================
// ROOMS — ACCEPT JOINER
// ============================================================================

/**
 * Creator accepts one interested joiner. Sets joiner_wallet,
 * clears interested list, transitions to 'awaiting_joiner_stake'.
 */
export async function acceptJoiner(
  roomId: string,
  creatorWallet: string,
  joinerWallet: string
): Promise<Room> {
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room) throw new Error('Room not found');
  if (room.creator_wallet !== creatorWallet) throw new Error('Only the creator can accept joiners');
  if (room.status !== 'open') throw new Error('Room is not accepting joiners');

  const meta = (room.metadata || {}) as Record<string, any>;
  const interested = meta.interested_wallets || [];
  if (!interested.includes(joinerWallet)) throw new Error('This wallet has not marked interest');

  // Clear interest list
  meta.interested_wallets = [];

  const { data: updated, error } = await supabase
    .from('rooms')
    .update({
      joiner_wallet: joinerWallet,
      status: 'awaiting_joiner_stake',
      metadata: meta,
    })
    .eq('id', roomId)
    .select()
    .single();

  if (error) throw new Error(`Failed to accept joiner: ${error.message}`);

  await supabase.from('messages').insert({
    room_id: roomId,
    type: 'system',
    content: `Creator accepted ${joinerWallet.slice(0, 6)}...${joinerWallet.slice(-4)}. Waiting for joiner to stake.`,
    metadata: { action: 'joiner_accepted', wallet: joinerWallet },
  });

  return updated as Room;
}

// ============================================================================
// ROOMS — RECORD STAKE
// ============================================================================

/**
 * Record a stake after on-chain confirmation. Updates funded flags.
 *
 * Status transitions:
 *   - Creator stakes (no joiner yet) → 'open'
 *   - Both staked → 'active'
 */
export async function recordStake(
  roomId: string,
  walletAddress: string,
  amountSol: number,
  txSignature: string
): Promise<void> {
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room) throw new Error('Room not found');

  const isCreator = room.creator_wallet === walletAddress;
  const fundedField = isCreator ? 'creator_funded' : 'joiner_funded';

  const update: Record<string, any> = {
    [fundedField]: true,
  };

  // Status transitions
  const creatorNowFunded = isCreator ? true : !!room.creator_funded;
  const joinerNowFunded = !isCreator ? true : !!room.joiner_funded;

  if (creatorNowFunded && joinerNowFunded) {
    update.status = 'active';
  } else if (isCreator && !room.joiner_wallet) {
    // Creator staked, no joiner yet → room is open for interest
    update.status = 'open';
  }

  await supabase.from('rooms').update(update).eq('id', roomId);

  // System message
  await supabase.from('messages').insert({
    room_id: roomId,
    sender_wallet: walletAddress,
    type: 'stake_notification',
    content: `Staked ${amountSol} SOL. TX: ${txSignature.slice(0, 16)}...`,
    metadata: { action: 'stake_confirmed', amount: amountSol, tx: txSignature },
  });
}

// ============================================================================
// ROOMS — READ
// ============================================================================

/**
 * Get room by ID (raw row, no enrichment).
 */
export async function getRoomPublic(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error || !data) return null;
  return data as Room;
}

/**
 * Get room by join code.
 */
export async function getRoomByJoinCode(joinCode: string): Promise<Room | null> {
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('join_code', joinCode.toUpperCase())
    .single();

  return data as Room | null;
}

/**
 * Get room with full details — flattens metadata + derives resolve state from messages.
 * Also auto-heals stale status.
 */
export async function getRoomFull(roomId: string): Promise<RoomView | null> {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error || !room) return null;

  // Fetch system messages for resolve-approval tracking
  const { data: msgs } = await supabase
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .eq('type', 'system');

  const messages = (msgs ?? []) as Message[];
  const meta = (room.metadata || {}) as Record<string, any>;

  // Derive resolve-approval from messages
  const resolveActions = ['resolve_approved', 'both_approved', 'resolved'];
  const creatorResolveApproved = messages.some(
    (m) =>
      m.sender_wallet === room.creator_wallet &&
      resolveActions.includes(m.metadata?.action)
  );
  const joinerResolveApproved = messages.some(
    (m) =>
      m.sender_wallet === room.joiner_wallet &&
      resolveActions.includes(m.metadata?.action)
  );

  // Auto-heal stale status
  let status = room.status as string;
  if (room.creator_funded && !room.joiner_wallet && status === 'pending') {
    status = 'open';
    supabase.from('rooms').update({ status: 'open' }).eq('id', roomId).eq('status', 'pending').then(() => {});
  }
  if (room.creator_funded && room.joiner_funded && ['awaiting_joiner_stake', 'open', 'pending'].includes(status)) {
    status = 'active';
    supabase.from('rooms').update({ status: 'active' }).eq('id', roomId).then(() => {});
  }
  // Do NOT auto-heal to 'resolved' here — the creator must first sign the
  // on-chain resolve transaction (POST /resolve → sign → POST /tx/submit).
  // The tx/submit handler sets status to 'resolved' after Solana confirms.

  return {
    ...room,
    status,
    // Flatten metadata fields for frontend convenience
    title: meta.title || '',
    description: meta.description || null,
    tags: meta.tags || [],
    terms: meta.terms || null,
    interested_wallets: meta.interested_wallets || [],
    // Derived from messages
    creator_resolve_approved: creatorResolveApproved,
    joiner_resolve_approved: joinerResolveApproved,
  } as RoomView;
}

// ============================================================================
// ROOMS — BROWSE (public listing)
// ============================================================================

/**
 * Get all public rooms with pagination, search, filtering.
 */
export async function getAllPublicRooms(options?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: 'created_at' | 'creator_stake_amount';
  sortOrder?: 'asc' | 'desc';
  creatorWallet?: string;
  joinerWallet?: string;
}): Promise<{ rooms: RoomView[]; total: number; page: number; limit: number }> {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 20, 100);
  const offset = (page - 1) * limit;
  const sortBy = options?.sortBy ?? 'created_at';
  const sortOrder = options?.sortOrder ?? 'desc';

  let query = supabase
    .from('rooms')
    .select('*', { count: 'exact' });

  // Only filter by is_public if not filtering by specific user
  if (!options?.creatorWallet && !options?.joinerWallet) {
    query = query.eq('is_public', true);
  }

  if (options?.creatorWallet) {
    query = query.eq('creator_wallet', options.creatorWallet);
  }

  if (options?.joinerWallet) {
    query = query.eq('joiner_wallet', options.joinerWallet);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.search) {
    // Search in metadata title and description via JSONB
    query = query.or(
      `metadata->>title.ilike.%${options.search}%,metadata->>description.ilike.%${options.search}%`
    );
  }

  query = query
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch rooms: ${error.message}`);

  // Flatten metadata for each room
  const rooms: RoomView[] = ((data ?? []) as Room[]).map((r) => {
    const meta = (r.metadata || {}) as Record<string, any>;
    return {
      ...r,
      title: meta.title || '',
      description: meta.description || null,
      tags: meta.tags || [],
      terms: meta.terms || null,
      interested_wallets: meta.interested_wallets || [],
      creator_resolve_approved: false, // not derived in list view
      joiner_resolve_approved: false,
    };
  });

  return {
    rooms,
    total: count ?? 0,
    page,
    limit,
  };
}

// ============================================================================
// MESSAGES
// ============================================================================

export async function sendMessage(
  roomId: string,
  senderWallet: string,
  content: string
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      sender_wallet: senderWallet,
      type: 'text',
      content,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to send message: ${error.message}`);
  return data as Message;
}

export async function getMessages(
  roomId: string,
  limit = 50
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return ((data ?? []) as Message[]).reverse();
}
