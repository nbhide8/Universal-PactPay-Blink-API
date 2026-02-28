// ============================================================================
// TypeScript types matching the Supabase schema
// ============================================================================

export type RoomStatus =
  | 'pending'
  | 'awaiting_approval'
  | 'terms_negotiation'
  | 'approved'
  | 'funding'
  | 'active'
  | 'resolved'
  | 'slashed'
  | 'cancelled'
  | 'expired'
  | 'disputed';

export type ParticipantRole = 'creator' | 'joiner';

export type ParticipantStatus =
  | 'active'
  | 'left'
  | 'slashed'
  | 'resolved'
  | 'kicked';

export type StakeStatus =
  | 'pending'
  | 'confirmed'
  | 'resolved'
  | 'slashed'
  | 'failed';

export type ConditionType =
  | 'task_completion'
  | 'payment'
  | 'delivery'
  | 'milestone'
  | 'time_based'
  | 'custom';

export type AmendmentStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

export type MessageType =
  | 'text'
  | 'system'
  | 'amendment_request'
  | 'stake_notification'
  | 'action';

export type ActionType = 'resolve' | 'slash' | 'cancel' | 'extend';

export type ActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired';

// ============================================================================
// Database row types
// ============================================================================

export interface User {
  id: string;
  auth_id: string;
  email?: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  wallet_address?: string;
  wallet_verified: boolean;
  wallet_verified_at?: string;
  bio?: string;
  reputation_score: number;
  total_rooms_created: number;
  total_rooms_joined: number;
  total_resolved: number;
  total_slashed: number;
  total_staked_sol: number;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  join_code: string;
  title: string;
  description?: string;
  creator_id: string;
  joiner_id?: string;
  status: RoomStatus;
  creator_stake_amount: number;
  joiner_stake_amount: number;
  escrow_pda?: string;
  escrow_initialized: boolean;
  chain_room_hash?: string;
  join_code_expires_at?: string;
  funding_deadline?: string;
  contract_deadline?: string;
  resolved_at?: string;
  slashed_at?: string;
  slashed_by?: string;
  resolution_tx_signature?: string;
  creator_approved_terms: boolean;
  joiner_approved_terms: boolean;
  terms_approved_at?: string;
  creator_funded: boolean;
  joiner_funded: boolean;
  both_funded_at?: string;
  max_participants: number;
  is_public: boolean;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  wallet_address: string;
  stake_amount?: number;
  stake_tx_signature?: string;
  stake_confirmed: boolean;
  stake_confirmed_at?: string;
  stake_record_pda?: string;
  approved_terms: boolean;
  approved_terms_at?: string;
  terms_version: number;
  approved_resolution: boolean;
  approved_resolution_at?: string;
  joined_at: string;
  left_at?: string;
  updated_at: string;
}

export interface ContractTerms {
  id: string;
  room_id: string;
  version: number;
  is_current: boolean;
  title: string;
  summary: string;
  conditions: ContractConditionData[];
  slash_penalty_creator: number;
  slash_penalty_joiner: number;
  additional_notes?: string;
  proposed_by: string;
  creator_approved: boolean;
  joiner_approved: boolean;
  fully_approved: boolean;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ContractConditionData {
  type: ConditionType;
  title: string;
  description: string;
  responsible_party: ParticipantRole;
  deadline?: string;
  stake_weight: number;
}

export interface ContractCondition {
  id: string;
  contract_terms_id: string;
  condition_type: ConditionType;
  title: string;
  description: string;
  responsible_party: ParticipantRole;
  deadline?: string;
  stake_weight: number;
  is_fulfilled: boolean;
  fulfilled_at?: string;
  fulfilled_by?: string;
  fulfillment_proof?: string;
  creator_confirmed: boolean;
  joiner_confirmed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Stake {
  id: string;
  room_id: string;
  user_id: string;
  participant_id: string;
  amount_sol: number;
  amount_lamports: number;
  tx_signature?: string;
  stake_record_pda?: string;
  escrow_pda?: string;
  status: StakeStatus;
  wallet_address: string;
  confirmed_at?: string;
  block_slot?: number;
  resolved_at?: string;
  resolution_tx_signature?: string;
  returned_amount_sol?: number;
  returned_amount_lamports?: number;
  created_at: string;
  updated_at: string;
}

export interface ActionRequest {
  id: string;
  room_id: string;
  requested_by: string;
  action_type: ActionType;
  reason: string;
  evidence_urls?: string[];
  status: ActionStatus;
  responded_by?: string;
  response_message?: string;
  responded_at?: string;
  tx_signature?: string;
  executed_at?: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id?: string;
  message_type: MessageType;
  content: string;
  metadata: Record<string, any>;
  amendment_id?: string;
  action_request_id?: string;
  read_by_creator: boolean;
  read_by_joiner: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  room_id?: string;
  title: string;
  body: string;
  entity_type?: string;
  entity_id?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface TermAmendment {
  id: string;
  room_id: string;
  contract_terms_id: string;
  proposed_by: string;
  amendment_description: string;
  proposed_changes: Record<string, any>;
  status: AmendmentStatus;
  responded_by?: string;
  response_message?: string;
  responded_at?: string;
  new_terms_id?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// API request/response types
// ============================================================================

export interface CreateRoomRequest {
  title: string;
  description?: string;
  creatorStakeAmount: number;
  joinerStakeAmount: number;
  terms: {
    title: string;
    summary: string;
    conditions: ContractConditionData[];
    additionalNotes?: string;
  };
  contractDeadline?: string;
  isPublic?: boolean;
  tags?: string[];
}

export interface JoinRoomRequest {
  joinCode: string;
}

export interface ApproveTermsRequest {
  roomId: string;
}

export interface ProposeAmendmentRequest {
  roomId: string;
  description: string;
  proposedChanges: Record<string, any>;
}

export interface StakeRequest {
  roomId: string;
  amount: number;
}

export interface ActionRequestCreate {
  roomId: string;
  actionType: ActionType;
  reason: string;
  evidenceUrls?: string[];
}

export interface RespondToActionRequest {
  actionRequestId: string;
  approved: boolean;
  message?: string;
}

export interface SendMessageRequest {
  roomId: string;
  content: string;
}

// ============================================================================
// View types (joined data for frontend)
// ============================================================================

export interface RoomView extends Room {
  creator?: User;
  joiner?: User;
  participants?: RoomParticipant[];
  currentTerms?: ContractTerms;
  stakes?: Stake[];
  pendingActions?: ActionRequest[];
  escrowData?: {
    totalStaked: number;
    isFullyFunded: boolean;
    creatorApprovedResolve: boolean;
    joinerApprovedResolve: boolean;
  };
}
