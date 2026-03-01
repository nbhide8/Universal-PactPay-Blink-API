import { supabase } from './supabase';
import type {
  Room,
  RoomParticipant,
  ContractTerms,
  Stake,
  ActionRequest,
  Message,
  User,
  CreateRoomRequest,
  RoomView,
} from './types';
import { getRoomEscrowPDA, getStakeRecordPDA, hashString } from './solana/pda';

// ============================================================================
// ROOMS
// ============================================================================

/**
 * Create a new room with terms. Returns the room with join code.
 */
export async function createRoom(
  userId: string,
  walletAddress: string,
  request: CreateRoomRequest
): Promise<Room> {
  // 1. Insert room
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({
      title: request.title,
      description: request.description,
      creator_id: userId,
      status: 'pending',
      creator_stake_amount: request.creatorStakeAmount,
      joiner_stake_amount: request.joinerStakeAmount,
      contract_deadline: request.contractDeadline,
      is_public: request.isPublic ?? false,
      tags: request.tags ?? [],
      join_code_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
      escrow_pda: getRoomEscrowPDA(userId).toBase58(), // will be updated after on-chain init
    })
    .select()
    .single();

  if (roomError || !room) throw new Error(`Failed to create room: ${roomError?.message}`);

  // 2. Add creator as participant
  const { error: participantError } = await supabase
    .from('room_participants')
    .insert({
      room_id: room.id,
      user_id: userId,
      role: 'creator',
      status: 'active',
      wallet_address: walletAddress,
      stake_amount: request.creatorStakeAmount,
      approved_terms: true, // Creator auto-approves their own terms
      approved_terms_at: new Date().toISOString(),
    });

  if (participantError) throw new Error(`Failed to add creator: ${participantError.message}`);

  // 3. Create initial contract terms
  const { error: termsError } = await supabase
    .from('contract_terms')
    .insert({
      room_id: room.id,
      version: 1,
      is_current: true,
      title: request.terms.title,
      summary: request.terms.summary,
      conditions: request.terms.conditions,
      additional_notes: request.terms.additionalNotes,
      proposed_by: userId,
      creator_approved: true,
      joiner_approved: false,
    });

  if (termsError) throw new Error(`Failed to create terms: ${termsError.message}`);

  // 4. System message
  await supabase.from('messages').insert({
    room_id: room.id,
    message_type: 'system',
    content: `Room "${room.title}" created. Share join code: ${room.join_code}`,
    metadata: { action: 'room_created' },
  });

  // 5. Update user stats
  await supabase.rpc('', {});  // handled by trigger

  return room as Room;
}

/**
 * Join a room via join code
 */
export async function joinRoom(
  userId: string,
  walletAddress: string,
  joinCode: string
): Promise<Room> {
  // Find room by join code
  const { data: room, error: findError } = await supabase
    .from('rooms')
    .select('*')
    .eq('join_code', joinCode.toUpperCase())
    .eq('status', 'pending')
    .single();

  if (findError || !room) throw new Error('Room not found or no longer accepting participants');

  // Check join code expiry
  if (room.join_code_expires_at && new Date(room.join_code_expires_at) < new Date()) {
    throw new Error('Join code has expired');
  }

  // Can't join own room
  if (room.creator_id === userId) {
    throw new Error('Cannot join your own room');
  }

  // Update room with joiner
  const { data: updatedRoom, error: updateError } = await supabase
    .from('rooms')
    .update({
      joiner_id: userId,
      status: 'awaiting_approval',
    })
    .eq('id', room.id)
    .select()
    .single();

  if (updateError) throw new Error(`Failed to join room: ${updateError.message}`);

  // Add joiner as participant
  await supabase.from('room_participants').insert({
    room_id: room.id,
    user_id: userId,
    role: 'joiner',
    status: 'active',
    wallet_address: walletAddress,
    stake_amount: room.joiner_stake_amount,
  });

  // System message
  await supabase.from('messages').insert({
    room_id: room.id,
    message_type: 'system',
    content: `A participant has joined the room. Reviewing terms...`,
    metadata: { action: 'participant_joined', user_id: userId },
  });

  // Notify creator
  await supabase.from('notifications').insert({
    user_id: room.creator_id,
    room_id: room.id,
    title: 'Someone joined your room!',
    body: `A participant joined room "${room.title}". They are reviewing the terms.`,
    entity_type: 'room',
    entity_id: room.id,
  });

  return updatedRoom as Room;
}

/**
 * Get room with all related data
 */
export async function getRoomView(roomId: string, userId: string): Promise<RoomView | null> {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error || !room) return null;

  // Verify access
  if (room.creator_id !== userId && room.joiner_id !== userId) {
    throw new Error('Access denied');
  }

  // Fetch related data in parallel
  const [participants, terms, stakes, actions, creator, joiner] = await Promise.all([
    supabase.from('room_participants').select('*').eq('room_id', roomId),
    supabase.from('contract_terms').select('*').eq('room_id', roomId).eq('is_current', true).single(),
    supabase.from('stakes').select('*').eq('room_id', roomId),
    supabase.from('action_requests').select('*').eq('room_id', roomId).eq('status', 'pending'),
    supabase.from('users').select('*').eq('id', room.creator_id).single(),
    room.joiner_id ? supabase.from('users').select('*').eq('id', room.joiner_id).single() : null,
  ]);

  return {
    ...room,
    creator: creator.data as User,
    joiner: joiner?.data as User | undefined,
    participants: participants.data as RoomParticipant[],
    currentTerms: terms.data as ContractTerms,
    stakes: stakes.data as Stake[],
    pendingActions: actions.data as ActionRequest[],
  } as RoomView;
}

/**
 * Get all rooms for a user
 */
export async function getUserRooms(userId: string): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .or(`creator_id.eq.${userId},joiner_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch rooms: ${error.message}`);
  return data as Room[];
}

/**
 * Approve contract terms (for joiner)
 */
export async function approveTerms(roomId: string, userId: string): Promise<void> {
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (!room) throw new Error('Room not found');

  const isCreator = room.creator_id === userId;
  const isJoiner = room.joiner_id === userId;

  if (!isCreator && !isJoiner) throw new Error('Access denied');

  // Update contract terms
  const updateField = isCreator ? 'creator_approved' : 'joiner_approved';
  await supabase
    .from('contract_terms')
    .update({ [updateField]: true })
    .eq('room_id', roomId)
    .eq('is_current', true);

  // Check if both approved
  const { data: terms } = await supabase
    .from('contract_terms')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_current', true)
    .single();

  if (terms?.creator_approved && terms?.joiner_approved) {
    await supabase.from('contract_terms').update({
      fully_approved: true,
      approved_at: new Date().toISOString(),
    }).eq('id', terms.id);

    // Move room to funding stage
    await supabase.from('rooms').update({
      status: 'funding',
      creator_approved_terms: true,
      joiner_approved_terms: true,
      terms_approved_at: new Date().toISOString(),
    }).eq('id', roomId);

    await supabase.from('messages').insert({
      room_id: roomId,
      message_type: 'system',
      content: 'Both parties approved the terms! Room is now in funding stage. Both parties must stake their SOL.',
      metadata: { action: 'terms_approved' },
    });
  } else {
    // Update room participant
    await supabase
      .from('room_participants')
      .update({
        approved_terms: true,
        approved_terms_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('user_id', userId);
  }
}

/**
 * Record a stake in the database (after on-chain confirmation)
 */
export async function recordStake(
  roomId: string,
  userId: string,
  participantId: string,
  amountSol: number,
  txSignature: string,
  walletAddress: string
): Promise<Stake> {
  const lamports = Math.round(amountSol * 1_000_000_000);

  const { data: stake, error } = await supabase
    .from('stakes')
    .insert({
      room_id: roomId,
      user_id: userId,
      participant_id: participantId,
      amount_sol: amountSol,
      amount_lamports: lamports,
      tx_signature: txSignature,
      stake_record_pda: getStakeRecordPDA(roomId, participantId).toBase58(),
      escrow_pda: getRoomEscrowPDA(roomId).toBase58(),
      status: 'confirmed',
      wallet_address: walletAddress,
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to record stake: ${error.message}`);

  // Update participant
  await supabase
    .from('room_participants')
    .update({
      stake_tx_signature: txSignature,
      stake_confirmed: true,
      stake_confirmed_at: new Date().toISOString(),
    })
    .eq('id', participantId);

  // System message
  await supabase.from('messages').insert({
    room_id: roomId,
    sender_id: userId,
    message_type: 'stake_notification',
    content: `Staked ${amountSol} SOL successfully. TX: ${txSignature.slice(0, 16)}...`,
    metadata: { action: 'stake_confirmed', amount: amountSol, tx: txSignature },
  });

  return stake as Stake;
}

/**
 * Create an action request (resolve, slash, cancel)
 */
export async function createActionRequest(
  roomId: string,
  userId: string,
  actionType: 'resolve' | 'slash' | 'cancel' | 'extend',
  reason: string,
  evidenceUrls?: string[]
): Promise<ActionRequest> {
  const { data, error } = await supabase
    .from('action_requests')
    .insert({
      room_id: roomId,
      requested_by: userId,
      action_type: actionType,
      reason,
      evidence_urls: evidenceUrls,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create action request: ${error.message}`);

  // Notify the other party
  const { data: room } = await supabase
    .from('rooms')
    .select('creator_id, joiner_id, title')
    .eq('id', roomId)
    .single();

  if (room) {
    const otherUserId = room.creator_id === userId ? room.joiner_id : room.creator_id;
    if (otherUserId) {
      await supabase.from('notifications').insert({
        user_id: otherUserId,
        room_id: roomId,
        title: `Action requested: ${actionType}`,
        body: `${actionType} requested for room "${room.title}". Reason: ${reason}`,
        entity_type: 'action_request',
        entity_id: data.id,
      });
    }
  }

  await supabase.from('messages').insert({
    room_id: roomId,
    sender_id: userId,
    message_type: 'action',
    content: `Requested: ${actionType}. Reason: ${reason}`,
    metadata: { action: `action_${actionType}`, action_request_id: data.id },
    action_request_id: data.id,
  });

  return data as ActionRequest;
}

/**
 * Respond to an action request
 */
export async function respondToAction(
  actionRequestId: string,
  userId: string,
  approved: boolean,
  message?: string
): Promise<void> {
  const { data: action } = await supabase
    .from('action_requests')
    .select('*, rooms(*)')
    .eq('id', actionRequestId)
    .single();

  if (!action) throw new Error('Action request not found');

  await supabase
    .from('action_requests')
    .update({
      status: approved ? 'approved' : 'rejected',
      responded_by: userId,
      response_message: message,
      responded_at: new Date().toISOString(),
    })
    .eq('id', actionRequestId);

  if (approved) {
    // If it's a slash, the user calling this is agreeing to lose their money too
    // The on-chain transaction will be executed separately
    await supabase.from('messages').insert({
      room_id: action.room_id,
      sender_id: userId,
      message_type: 'system',
      content: `Action "${action.action_type}" was approved. Ready for on-chain execution.`,
      metadata: { action: 'action_approved', action_request_id: actionRequestId },
    });
  }
}

// ============================================================================
// MESSAGES
// ============================================================================

export async function sendMessage(
  roomId: string,
  senderId: string,
  content: string
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      room_id: roomId,
      sender_id: senderId,
      message_type: 'text',
      content,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to send message: ${error.message}`);
  return data as Message;
}

export async function getMessages(
  roomId: string,
  limit = 50,
  before?: string
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return (data as Message[]).reverse();
}

/**
 * Mark messages as read
 */
export async function markMessagesRead(
  roomId: string,
  userId: string,
  role: 'creator' | 'joiner'
): Promise<void> {
  const readField = role === 'creator' ? 'read_by_creator' : 'read_by_joiner';
  await supabase
    .from('messages')
    .update({ [readField]: true })
    .eq('room_id', roomId)
    .eq(readField, false);
}

// ============================================================================
// ROOM LOOKUP
// ============================================================================

export async function getRoomByJoinCode(joinCode: string): Promise<Room | null> {
  const { data } = await supabase
    .from('rooms')
    .select('*')
    .eq('join_code', joinCode.toUpperCase())
    .single();

  return data as Room | null;
}

// ============================================================================
// PUBLIC BROWSING
// ============================================================================

/**
 * Get all public rooms (for the browse page / API).
 * Supports pagination, search, and status filtering.
 */
export async function getAllPublicRooms(options?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: 'created_at' | 'creator_stake_amount' | 'total_staked';
  sortOrder?: 'asc' | 'desc';
  creatorId?: string;
  joinerId?: string;
}): Promise<{ rooms: Room[]; total: number; page: number; limit: number }> {
  const page = options?.page ?? 1;
  const limit = Math.min(options?.limit ?? 20, 100);
  const offset = (page - 1) * limit;
  const sortBy = options?.sortBy ?? 'created_at';
  const sortOrder = options?.sortOrder ?? 'desc';

  let query = supabase
    .from('rooms')
    .select('*', { count: 'exact' });

  // Only filter by is_public if not filtering by specific user
  if (!options?.creatorId && !options?.joinerId) {
    query = query.eq('is_public', true);
  }

  if (options?.creatorId) {
    query = query.eq('creator_id', options.creatorId);
  }

  if (options?.joinerId) {
    query = query.eq('joiner_id', options.joinerId);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.search) {
    query = query.or(
      `title.ilike.%${options.search}%,description.ilike.%${options.search}%`
    );
  }

  query = query
    .order(sortBy, { ascending: sortOrder === 'asc' })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to fetch rooms: ${error.message}`);

  return {
    rooms: (data ?? []) as Room[],
    total: count ?? 0,
    page,
    limit,
  };
}

/**
 * Get room by ID without access check (for public API).
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
 * Get room with full details for API (includes participants, terms, stakes).
 * No access restriction — designed for the public API.
 */
export async function getRoomFull(roomId: string): Promise<RoomView | null> {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();

  if (error || !room) return null;

  const [participants, terms, stakes, actions] = await Promise.all([
    supabase.from('room_participants').select('*').eq('room_id', roomId),
    supabase
      .from('contract_terms')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_current', true)
      .single(),
    supabase.from('stakes').select('*').eq('room_id', roomId),
    supabase
      .from('action_requests')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'pending'),
  ]);

  return {
    ...room,
    participants: (participants.data ?? []) as RoomParticipant[],
    currentTerms: terms.data as ContractTerms | undefined,
    stakes: (stakes.data ?? []) as Stake[],
    pendingActions: (actions.data ?? []) as ActionRequest[],
  } as RoomView;
}
