// ============================================================================
// Simplified PackedPay types — matches the 2-table schema (rooms + messages)
// ============================================================================

// ── Room status ──────────────────────────────────────────────────────────────
//
// Workflow:
//   pending → open → awaiting_joiner_stake → active → resolved
//                                                   → slashed
//   Any early state can → cancelled

export type RoomStatus =
  | 'pending'               // Room just created, creator init+stake in progress
  | 'open'                  // Creator staked, accepting interest from joiners
  | 'awaiting_joiner_stake' // Creator accepted a joiner, joiner must stake
  | 'active'                // Both staked, contract is live
  | 'resolved'              // Both approved resolution (happy path)
  | 'slashed'               // Someone slashed (both lose)
  | 'cancelled';            // Creator cancelled

// ── Room metadata (the JSONB column) ─────────────────────────────────────────

export interface RoomMetadata {
  title: string;
  description?: string;
  tags?: string[];
  escrow_pda?: string;
  escrow_initialized?: boolean;
  contract_deadline?: string;
  terms?: {
    title: string;
    summary: string;
    conditions?: ContractConditionData[];
  };
  interested_wallets?: string[];  // wallets that marked interest
  resolved_at?: string;
  slashed_at?: string;
  slashed_by?: string;
  resolution_tx_sig?: string;
  [key: string]: any; // extensible
}

export interface ContractConditionData {
  type: string;           // task_completion | milestone | deadline | custom
  description: string;
  required?: boolean;
  title?: string;
  responsible_party?: 'creator' | 'joiner';
  stake_weight?: number;
}

// ── Room (database row) ──────────────────────────────────────────────────────

export interface Room {
  id: string;
  join_code: string;
  status: RoomStatus;
  reward_amount: number;
  creator_stake_amount: number;
  joiner_stake_amount: number;
  creator_wallet: string;
  joiner_wallet: string | null;
  creator_funded: boolean;
  joiner_funded: boolean;
  is_public: boolean;
  metadata: RoomMetadata;
  created_at: string;
  updated_at: string;
}

// ── Room view (enriched room returned by API) ────────────────────────────────
// Flattens commonly-needed metadata fields so the frontend doesn't have to dig

export interface RoomView extends Room {
  // Flattened from metadata for convenience
  title: string;
  description: string | null;
  tags: string[];
  terms: RoomMetadata['terms'] | null;
  interested_wallets: string[];
  // Derived from messages
  creator_resolve_approved: boolean;
  joiner_resolve_approved: boolean;
}

// ── Message ──────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  room_id: string;
  sender_wallet: string | null;
  type: string;
  content: string;
  metadata: Record<string, any>;
  created_at: string;
}

// ── API request types ────────────────────────────────────────────────────────

export interface CreateRoomRequest {
  title: string;
  description?: string;
  rewardAmount: number;
  creatorStakeAmount: number;
  joinerStakeAmount: number;
  terms: {
    title: string;
    summary: string;
    conditions?: ContractConditionData[];
    additionalNotes?: string;
  };
  contractDeadline?: string;
  isPublic?: boolean;
  tags?: string[];
}
