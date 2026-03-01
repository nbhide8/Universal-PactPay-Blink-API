/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Blink API Client
 *
 * The ONLY way the demo app talks to the backend. Every page uses this client.
 * No Supabase, no direct database access, no Solana SDK — just the API.
 *
 *   NEXT_PUBLIC_API_URL=http://localhost:3001   (local dev)
 *   NEXT_PUBLIC_API_URL=https://blink-api.up.railway.app  (prod)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_URL}${cleanPath}`;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  // Append cache-bust timestamp to GET requests to prevent stale responses
  const separator = path.includes('?') ? '&' : '?';
  const bustPath = (!init?.method || init.method === 'GET')
    ? `${path}${separator}_t=${Date.now()}`
    : path;
  const url = apiUrl(bustPath);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return fetch(url, { ...init, headers, cache: 'no-store' });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoomStatus =
  | 'pending'
  | 'open'
  | 'awaiting_joiner_stake'
  | 'active'
  | 'resolved'
  | 'slashed'
  | 'cancelled';

export type ConditionType =
  | 'task_completion'
  | 'delivery'
  | 'milestone'
  | 'payment'
  | 'time_based'
  | 'custom';

export interface ContractConditionData {
  type: ConditionType;
  description: string;
  required: boolean;
  title?: string;
  responsible_party?: 'creator' | 'joiner';
  stake_weight?: number;
}

export interface Room {
  id: string;
  title: string;
  description: string | null;
  status: RoomStatus;
  reward_amount: number;
  creator_stake_amount: number;
  joiner_stake_amount: number;
  join_code: string;
  tags: string[];
  is_public: boolean;
  created_at: string;
  creator_wallet: string;
  joiner_wallet: string | null;
  terms: any;
  metadata: any;
  creator_funded?: boolean;
  joiner_funded?: boolean;
  interested_wallets?: string[];
  creator_resolve_approved?: boolean;
  joiner_resolve_approved?: boolean;
}

export interface LockboxResult {
  mode: 'direct' | 'custodial';
  blockchain: string;
  onChain: boolean;
  action: {
    type: string;
    payload: string | null;
    instructions: string;
    metadata: any;
  };
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export async function getRooms(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  creatorId?: string;
  joinerId?: string;
}): Promise<{ rooms: Room[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set('page', params.page.toString());
  if (params?.limit) sp.set('limit', params.limit.toString());
  if (params?.status) sp.set('status', params.status);
  if (params?.search) sp.set('search', params.search);
  if (params?.sortBy) sp.set('sortBy', params.sortBy);
  if (params?.sortOrder) sp.set('sortOrder', params.sortOrder);
  if (params?.creatorId) sp.set('creatorId', params.creatorId);
  if (params?.joinerId) sp.set('joinerId', params.joinerId);

  const res = await apiFetch(`/api/v1/rooms?${sp}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch rooms');
  return json.data;
}

export async function getRoom(roomId: string): Promise<{ room: Room; onChain: any }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch room');
  return { room: json.room, onChain: json.onChain };
}

export async function createRoom(data: {
  walletAddress: string;
  title: string;
  description?: string;
  rewardAmount: number;
  creatorStakeAmount: number;
  joinerStakeAmount: number;
  mode?: 'direct' | 'custodial';
  isPublic?: boolean;
  tags?: string[];
  contractDeadline?: string;
  terms: {
    title: string;
    summary: string;
    conditions?: ContractConditionData[];
    additionalNotes?: string;
  };
}): Promise<{ room: Room; lockbox: LockboxResult }> {
  const res = await apiFetch('/api/v1/rooms', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to create room');
  return { room: json.room, lockbox: json.lockbox };
}

export async function joinRoom(data: {
  walletAddress: string;
  joinCode: string;
}): Promise<{ room: Room }> {
  const res = await apiFetch('/api/v1/rooms/join', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to join room');
  return { room: json.room };
}

// ─── Escrow Actions ──────────────────────────────────────────────────────────
// Each returns a lockbox with action.payload = unsigned base64 Solana transaction
// The demo app signs it with the user's wallet and submits via submitTransaction().

export async function markInterest(
  roomId: string,
  data: { walletAddress: string }
): Promise<{ room: Room }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/interest`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to mark interest');
  return { room: json.room };
}

export async function acceptJoiner(
  roomId: string,
  data: { walletAddress: string; joinerWallet: string }
): Promise<{ room: Room }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/accept`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to accept joiner');
  return { room: json.room };
}

export async function stakeRoom(
  roomId: string,
  data: {
    walletAddress: string;
    isCreator: boolean;
    signature?: string;
    message?: string;
  }
): Promise<{ lockbox: LockboxResult; stakeAmount: number; transaction?: string }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/stake`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to stake');
  return json;
}

export async function approveRoom(
  roomId: string,
  data: {
    walletAddress: string;
    signature?: string;
    message?: string;
  }
): Promise<{ lockbox: LockboxResult }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/approve`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to approve');
  return json;
}

export async function resolveRoom(
  roomId: string,
  data: {
    walletAddress: string;
    signature?: string;
    message?: string;
  }
): Promise<{ lockbox: LockboxResult }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/resolve`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to resolve');
  return json;
}

export async function resolveApproveRoom(
  roomId: string,
  data: { walletAddress: string }
): Promise<{ success: boolean; lockbox: LockboxResult; creatorApproved: boolean; joinerApproved: boolean; bothApproved: boolean; resolved: boolean }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/resolve-approve`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to approve resolution');
  return json;
}

export async function joinRoomById(
  roomId: string,
  data: { walletAddress: string; joinCode: string }
): Promise<{ room: Room }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/join`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to join room');
  return { room: json.room };
}

export async function slashRoom(
  roomId: string,
  data: {
    walletAddress: string;
    signature?: string;
    message?: string;
  }
): Promise<{ lockbox: LockboxResult }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/slash`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to slash');
  return json;
}

export async function cancelRoom(
  roomId: string,
  data: {
    walletAddress: string;
    signature?: string;
    message?: string;
  }
): Promise<{ lockbox: LockboxResult }> {
  const res = await apiFetch(`/api/v1/rooms/${roomId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to cancel');
  return json;
}

// ─── Transaction Submission ──────────────────────────────────────────────────

export async function submitTransaction(data: {
  signedTransaction: string;
  roomId?: string;
  action?: string;
  walletAddress?: string;
  metadata?: any;
}): Promise<{ signature: string; confirmationStatus: string }> {
  const res = await apiFetch('/api/v1/tx/submit', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to submit transaction');
  return json;
}

// ─── Helper: Sign message with Solana wallet ────────────────────────────────

/**
 * Build a blink auth message for a given action.
 * Returns the message string that needs to be signed.
 */
export function buildAuthMessage(action: string, roomId: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `blink:${action}:${roomId}:${timestamp}`;
}
