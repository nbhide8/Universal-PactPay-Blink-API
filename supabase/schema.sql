-- =============================================================================
-- STAKEGUARD: Generic Escrow & Staking Platform
-- Supabase Schema - Comprehensive Database Design
-- =============================================================================
-- 
-- Core concept: "Rooms" are escrow agreements between two parties.
-- Person A (creator) defines terms, Person B (joiner) approves and stakes.
-- Both parties stake SOL. Creator stakes MORE as collateral against abuse.
-- Either party can slash (both lose), or both agree to resolve (both get money back).
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

-- Room lifecycle status
CREATE TYPE room_status AS ENUM (
  'pending',          -- Room created, waiting for joiner
  'awaiting_approval',-- Joiner joined, reviewing terms
  'terms_negotiation',-- Terms are being negotiated (amendments requested)
  'approved',         -- Both parties agreed on terms
  'funding',          -- Terms approved, waiting for both parties to stake
  'active',           -- Both parties staked, contract is live
  'resolved',         -- Both parties agreed to resolve (happy path)
  'slashed',          -- One party slashed the contract (both lose)
  'cancelled',        -- Room cancelled before activation
  'expired',          -- Room expired (join code timeout or funding timeout)
  'disputed'          -- Dispute raised, pending resolution
);

-- Participant role in the room
CREATE TYPE participant_role AS ENUM (
  'creator',  -- Person A: creates the room, defines initial terms
  'joiner'    -- Person B: joins via code, reviews/approves terms
);

-- Participant status within a room
CREATE TYPE participant_status AS ENUM (
  'active',           -- Currently participating
  'left',             -- Voluntarily left (before activation)
  'slashed',          -- Was slashed
  'resolved',         -- Successfully resolved
  'kicked'            -- Removed by the other party (before activation only)
);

-- Stake status on-chain
CREATE TYPE stake_status AS ENUM (
  'pending',          -- Stake initiated but not confirmed on-chain
  'confirmed',        -- Stake confirmed on-chain
  'resolved',         -- Stake returned to staker
  'slashed',          -- Stake sent to penalty wallet
  'failed'            -- Transaction failed
);

-- Contract term condition type
CREATE TYPE condition_type AS ENUM (
  'task_completion',  -- A specific task must be completed
  'payment',          -- A payment must be made
  'delivery',         -- Something must be delivered
  'milestone',        -- A milestone must be reached
  'time_based',       -- Time-based condition (e.g., "within 30 days")
  'custom'            -- Free-form custom condition
);

-- Amendment status
CREATE TYPE amendment_status AS ENUM (
  'proposed',         -- Amendment proposed by one party
  'accepted',         -- Accepted by both parties
  'rejected',         -- Rejected by the other party
  'withdrawn'         -- Withdrawn by proposer
);

-- Message type
CREATE TYPE message_type AS ENUM (
  'text',             -- Regular text message
  'system',           -- System-generated message (e.g., "Room created")
  'amendment_request',-- Request to amend terms
  'stake_notification', -- Notification about staking activity
  'action'            -- Action message (slash/resolve request)
);

-- Action request type
CREATE TYPE action_type AS ENUM (
  'resolve',          -- Request to resolve (return all stakes)
  'slash',            -- Request to slash (send all to penalty)
  'cancel',           -- Request to cancel the room
  'extend'            -- Request to extend the deadline
);

-- Action request status
CREATE TYPE action_status AS ENUM (
  'pending',          -- Waiting for other party approval
  'approved',         -- Other party approved
  'rejected',         -- Other party rejected
  'executed',         -- Action was executed on-chain
  'expired'           -- Request expired
);

-- =============================================================================
-- TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Users / Profiles
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Auth
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  
  -- Wallet info
  wallet_address TEXT,           -- Solana public key (base58)
  wallet_verified BOOLEAN DEFAULT FALSE,
  wallet_verified_at TIMESTAMPTZ,
  
  -- Profile metadata
  bio TEXT,
  reputation_score NUMERIC(5,2) DEFAULT 0.00,  -- 0-100 score
  total_rooms_created INTEGER DEFAULT 0,
  total_rooms_joined INTEGER DEFAULT 0,
  total_resolved INTEGER DEFAULT 0,
  total_slashed INTEGER DEFAULT 0,
  total_staked_sol NUMERIC(20,9) DEFAULT 0,     -- Cumulative SOL staked
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Rooms (the core escrow agreement container)
-- ---------------------------------------------------------------------------
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Join code (like Kahoot) - 6 chars alphanumeric, uppercase
  join_code TEXT UNIQUE NOT NULL,
  
  -- Room metadata
  title TEXT NOT NULL,
  description TEXT,
  
  -- Creator (Person A)
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Joiner (Person B) - null until someone joins
  joiner_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Status
  status room_status DEFAULT 'pending',
  
  -- Staking configuration
  reward_amount NUMERIC(20,9) NOT NULL,          -- SOL reward paid to worker on successful resolution
  creator_stake_amount NUMERIC(20,9) NOT NULL,  -- SOL amount creator must stake (slashed if not resolved)
  joiner_stake_amount NUMERIC(20,9) NOT NULL,   -- SOL amount joiner must stake
  
  -- Validation: creator_stake_amount >= joiner_stake_amount (enforced via constraint)
  -- This ensures the creator has "skin in the game" and won't abuse power
  
  -- On-chain references
  escrow_pda TEXT,               -- Solana PDA for the escrow account
  escrow_initialized BOOLEAN DEFAULT FALSE,
  chain_room_hash TEXT,          -- SHA256 hash of the room ID used for PDA derivation
  
  -- Timing
  join_code_expires_at TIMESTAMPTZ,  -- When the join code expires
  funding_deadline TIMESTAMPTZ,      -- Deadline for both parties to stake
  contract_deadline TIMESTAMPTZ,     -- When the contract terms must be fulfilled
  
  -- Resolution
  resolved_at TIMESTAMPTZ,
  slashed_at TIMESTAMPTZ,
  slashed_by UUID REFERENCES users(id),
  resolution_tx_signature TEXT,      -- On-chain transaction signature
  
  -- Terms approval tracking
  creator_approved_terms BOOLEAN DEFAULT TRUE,   -- Creator always approves (they wrote them)
  joiner_approved_terms BOOLEAN DEFAULT FALSE,
  terms_approved_at TIMESTAMPTZ,
  
  -- Funding tracking
  creator_funded BOOLEAN DEFAULT FALSE,
  joiner_funded BOOLEAN DEFAULT FALSE,
  both_funded_at TIMESTAMPTZ,
  
  -- Metadata
  max_participants INTEGER DEFAULT 2,  -- Future: support multi-party escrows
  is_public BOOLEAN DEFAULT FALSE,     -- Whether this room appears in public listings
  tags TEXT[],                         -- Searchable tags
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reward must be > 0
ALTER TABLE rooms ADD CONSTRAINT reward_positive
  CHECK (reward_amount > 0);
-- Both stakes must be > 0 (creator AND worker must stake)
ALTER TABLE rooms ADD CONSTRAINT creator_stake_positive
  CHECK (creator_stake_amount > 0);
ALTER TABLE rooms ADD CONSTRAINT joiner_stake_positive
  CHECK (joiner_stake_amount > 0);
-- Ensure creator always stakes >= joiner
ALTER TABLE rooms ADD CONSTRAINT creator_stake_gte_joiner 
  CHECK (creator_stake_amount >= joiner_stake_amount);

-- ---------------------------------------------------------------------------
-- Room Participants (many-to-many between users and rooms)
-- ---------------------------------------------------------------------------
CREATE TABLE room_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- Role and status
  role participant_role NOT NULL,
  status participant_status DEFAULT 'active',
  
  -- Wallet used for this room (might differ from profile wallet)
  wallet_address TEXT NOT NULL,
  
  -- Staking info
  stake_amount NUMERIC(20,9),             -- Actual amount staked (in SOL)
  stake_tx_signature TEXT,                 -- On-chain transaction signature
  stake_confirmed BOOLEAN DEFAULT FALSE,
  stake_confirmed_at TIMESTAMPTZ,
  stake_record_pda TEXT,                   -- Solana PDA for their stake record
  
  -- Terms approval
  approved_terms BOOLEAN DEFAULT FALSE,
  approved_terms_at TIMESTAMPTZ,
  terms_version INTEGER DEFAULT 1,         -- Which version of terms they approved
  
  -- Resolution tracking
  approved_resolution BOOLEAN DEFAULT FALSE,
  approved_resolution_at TIMESTAMPTZ,
  
  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, role)  -- Only one creator and one joiner per room
);

-- ---------------------------------------------------------------------------
-- Contract Terms (the conditions both parties agree to)
-- ---------------------------------------------------------------------------
CREATE TABLE contract_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  
  -- Version tracking for amendments
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,
  
  -- The actual terms
  title TEXT NOT NULL,                      -- Short title for this set of terms
  summary TEXT NOT NULL,                    -- Human-readable summary
  
  -- Structured conditions (what must happen)
  -- Stored as JSONB array: [{condition, description, deadline, penalty_percentage}]
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Penalty structure
  slash_penalty_creator NUMERIC(5,2) DEFAULT 100.00,  -- % of creator's stake lost on slash
  slash_penalty_joiner NUMERIC(5,2) DEFAULT 100.00,   -- % of joiner's stake lost on slash
  
  -- Fine print
  additional_notes TEXT,
  
  -- Who proposed this version
  proposed_by UUID NOT NULL REFERENCES users(id),
  
  -- Approval tracking
  creator_approved BOOLEAN DEFAULT FALSE,
  joiner_approved BOOLEAN DEFAULT FALSE,
  fully_approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one current version per room
CREATE UNIQUE INDEX idx_one_current_terms_per_room 
  ON contract_terms(room_id) WHERE is_current = TRUE;

-- ---------------------------------------------------------------------------
-- Contract Conditions (individual conditions within a term set)
-- ---------------------------------------------------------------------------
CREATE TABLE contract_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  contract_terms_id UUID NOT NULL REFERENCES contract_terms(id) ON DELETE CASCADE,
  
  -- Condition details
  condition_type condition_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Who is responsible for fulfilling this condition
  responsible_party participant_role NOT NULL,
  
  -- Deadline for this specific condition
  deadline TIMESTAMPTZ,
  
  -- How much of the stake is tied to this condition (percentage)
  stake_weight NUMERIC(5,2) DEFAULT 0,  -- e.g., 50 means 50% of stake
  
  -- Fulfillment tracking
  is_fulfilled BOOLEAN DEFAULT FALSE,
  fulfilled_at TIMESTAMPTZ,
  fulfilled_by UUID REFERENCES users(id),
  fulfillment_proof TEXT,                -- URL or description of proof
  
  -- Both parties must confirm fulfillment
  creator_confirmed BOOLEAN DEFAULT FALSE,
  joiner_confirmed BOOLEAN DEFAULT FALSE,
  
  -- Ordering
  sort_order INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Term Amendments (requests to modify terms)
-- ---------------------------------------------------------------------------
CREATE TABLE term_amendments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  contract_terms_id UUID NOT NULL REFERENCES contract_terms(id) ON DELETE CASCADE,
  
  -- Who proposed the amendment
  proposed_by UUID NOT NULL REFERENCES users(id),
  
  -- What changed
  amendment_description TEXT NOT NULL,
  proposed_changes JSONB NOT NULL,        -- Structured diff of what changed
  
  -- Status
  status amendment_status DEFAULT 'proposed',
  
  -- Response
  responded_by UUID REFERENCES users(id),
  response_message TEXT,
  responded_at TIMESTAMPTZ,
  
  -- If accepted, this links to the new version of terms
  new_terms_id UUID REFERENCES contract_terms(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Stakes (on-chain staking records, mirrors Solana state)
-- ---------------------------------------------------------------------------
CREATE TABLE stakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  participant_id UUID NOT NULL REFERENCES room_participants(id) ON DELETE CASCADE,
  
  -- Amount
  amount_sol NUMERIC(20,9) NOT NULL,
  amount_lamports BIGINT NOT NULL,
  
  -- On-chain data
  tx_signature TEXT,                -- Solana transaction signature
  stake_record_pda TEXT,            -- PDA address of the stake record
  escrow_pda TEXT,                  -- PDA address of the escrow account
  
  -- Status
  status stake_status DEFAULT 'pending',
  
  -- Wallet used
  wallet_address TEXT NOT NULL,
  
  -- Confirmation
  confirmed_at TIMESTAMPTZ,
  block_slot BIGINT,               -- Solana slot number at confirmation
  
  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolution_tx_signature TEXT,
  returned_amount_sol NUMERIC(20,9),
  returned_amount_lamports BIGINT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(room_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Action Requests (resolve, slash, cancel - requires mutual agreement)
-- ---------------------------------------------------------------------------
CREATE TABLE action_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  
  -- Who initiated the action
  requested_by UUID NOT NULL REFERENCES users(id),
  
  -- Action type
  action_type action_type NOT NULL,
  
  -- Reason/justification
  reason TEXT NOT NULL,
  evidence_urls TEXT[],            -- Links to evidence (screenshots, etc.)
  
  -- Status
  status action_status DEFAULT 'pending',
  
  -- Other party's response
  responded_by UUID REFERENCES users(id),
  response_message TEXT,
  responded_at TIMESTAMPTZ,
  
  -- If executed, on-chain data
  tx_signature TEXT,
  executed_at TIMESTAMPTZ,
  
  -- Expiration (action requests expire after X hours)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Messages (in-room chat / negotiation)
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  
  -- Sender (null for system messages)
  sender_id UUID REFERENCES users(id),
  
  -- Message content
  message_type message_type DEFAULT 'text',
  content TEXT NOT NULL,
  
  -- Optional metadata (for system messages, action references, etc.)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- References (optional links to other entities)
  amendment_id UUID REFERENCES term_amendments(id),
  action_request_id UUID REFERENCES action_requests(id),
  
  -- Read tracking
  read_by_creator BOOLEAN DEFAULT FALSE,
  read_by_joiner BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  
  -- Notification content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Link to relevant entity
  entity_type TEXT,               -- 'room', 'message', 'action_request', 'stake', etc.
  entity_id UUID,
  
  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Audit Log (immutable record of all actions)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Action details
  action TEXT NOT NULL,                    -- e.g., 'room.created', 'stake.confirmed', 'contract.slashed'
  description TEXT,
  
  -- Before/after state (for trackability)
  previous_state JSONB,
  new_state JSONB,
  
  -- On-chain reference if applicable
  tx_signature TEXT,
  
  -- Request metadata
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp (immutable)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Rooms
CREATE INDEX idx_rooms_join_code ON rooms(join_code);
CREATE INDEX idx_rooms_creator ON rooms(creator_id);
CREATE INDEX idx_rooms_joiner ON rooms(joiner_id);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_escrow_pda ON rooms(escrow_pda);
CREATE INDEX idx_rooms_created_at ON rooms(created_at DESC);
CREATE INDEX idx_rooms_public ON rooms(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_rooms_tags ON rooms USING GIN(tags);

-- Room Participants
CREATE INDEX idx_room_participants_room ON room_participants(room_id);
CREATE INDEX idx_room_participants_user ON room_participants(user_id);
CREATE INDEX idx_room_participants_role ON room_participants(room_id, role);

-- Contract Terms
CREATE INDEX idx_contract_terms_room ON contract_terms(room_id);
CREATE INDEX idx_contract_terms_current ON contract_terms(room_id) WHERE is_current = TRUE;

-- Contract Conditions
CREATE INDEX idx_contract_conditions_terms ON contract_conditions(contract_terms_id);

-- Stakes
CREATE INDEX idx_stakes_room ON stakes(room_id);
CREATE INDEX idx_stakes_user ON stakes(user_id);
CREATE INDEX idx_stakes_status ON stakes(status);

-- Messages
CREATE INDEX idx_messages_room ON messages(room_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(room_id, created_at DESC);

-- Action Requests
CREATE INDEX idx_action_requests_room ON action_requests(room_id);
CREATE INDEX idx_action_requests_status ON action_requests(status);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;

-- Audit Log
CREATE INDEX idx_audit_log_room ON audit_log(room_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- Users
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_username ON users(username);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Generate a unique 6-character join code (uppercase alphanumeric)
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- No I, O, 0, 1 to avoid confusion
  code TEXT := '';
  i INTEGER;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    -- Check uniqueness
    EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE join_code = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate join code on room creation
CREATE OR REPLACE FUNCTION auto_generate_join_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    NEW.join_code := generate_join_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update room status when both parties fund
CREATE OR REPLACE FUNCTION check_room_fully_funded()
RETURNS TRIGGER AS $$
BEGIN
  -- When a stake is confirmed, check if both parties have funded
  IF NEW.status = 'confirmed' THEN
    -- Check if both participants have confirmed stakes
    IF (
      SELECT COUNT(*) = 2 FROM stakes 
      WHERE room_id = NEW.room_id AND status = 'confirmed'
    ) THEN
      UPDATE rooms 
      SET status = 'active', 
          both_funded_at = NOW(),
          creator_funded = TRUE,
          joiner_funded = TRUE,
          updated_at = NOW()
      WHERE id = NEW.room_id AND status = 'funding';
    ELSE
      -- Update the specific participant's funding status
      UPDATE rooms SET
        creator_funded = EXISTS(
          SELECT 1 FROM stakes s 
          JOIN room_participants rp ON s.participant_id = rp.id 
          WHERE s.room_id = NEW.room_id AND s.status = 'confirmed' AND rp.role = 'creator'
        ),
        joiner_funded = EXISTS(
          SELECT 1 FROM stakes s 
          JOIN room_participants rp ON s.participant_id = rp.id 
          WHERE s.room_id = NEW.room_id AND s.status = 'confirmed' AND rp.role = 'joiner'
        ),
        updated_at = NOW()
      WHERE id = NEW.room_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update user stats
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'rooms' THEN
    -- Update creator stats
    IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
      UPDATE users SET total_resolved = total_resolved + 1, updated_at = NOW() 
      WHERE id = NEW.creator_id;
      IF NEW.joiner_id IS NOT NULL THEN
        UPDATE users SET total_resolved = total_resolved + 1, updated_at = NOW() 
        WHERE id = NEW.joiner_id;
      END IF;
    ELSIF NEW.status = 'slashed' AND (OLD.status IS NULL OR OLD.status != 'slashed') THEN
      UPDATE users SET total_slashed = total_slashed + 1, updated_at = NOW() 
      WHERE id = NEW.creator_id;
      IF NEW.joiner_id IS NOT NULL THEN
        UPDATE users SET total_slashed = total_slashed + 1, updated_at = NOW() 
        WHERE id = NEW.joiner_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create system message helper
CREATE OR REPLACE FUNCTION create_system_message(
  p_room_id UUID,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  msg_id UUID;
BEGIN
  INSERT INTO messages (room_id, message_type, content, metadata)
  VALUES (p_room_id, 'system', p_content, p_metadata)
  RETURNING id INTO msg_id;
  RETURN msg_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-update timestamps
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_room_participants_updated_at BEFORE UPDATE ON room_participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contract_terms_updated_at BEFORE UPDATE ON contract_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contract_conditions_updated_at BEFORE UPDATE ON contract_conditions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_stakes_updated_at BEFORE UPDATE ON stakes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_action_requests_updated_at BEFORE UPDATE ON action_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_term_amendments_updated_at BEFORE UPDATE ON term_amendments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-generate join code
CREATE TRIGGER trg_rooms_join_code BEFORE INSERT ON rooms
  FOR EACH ROW EXECUTE FUNCTION auto_generate_join_code();

-- Check if room is fully funded when stakes change
CREATE TRIGGER trg_check_funding AFTER INSERT OR UPDATE ON stakes
  FOR EACH ROW EXECUTE FUNCTION check_room_fully_funded();

-- Update user stats on room status change
CREATE TRIGGER trg_update_user_stats AFTER UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_user_stats();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users: can read own profile, update own profile
CREATE POLICY users_select ON users FOR SELECT USING (true);  -- Public profiles
CREATE POLICY users_update ON users FOR UPDATE USING (auth.uid() = auth_id);

-- Rooms: participants can view their rooms, anyone can view public rooms
CREATE POLICY rooms_select ON rooms FOR SELECT USING (
  is_public = TRUE 
  OR creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  OR joiner_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY rooms_insert ON rooms FOR INSERT WITH CHECK (
  creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY rooms_update ON rooms FOR UPDATE USING (
  creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  OR joiner_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);

-- Room participants: only room members can view
CREATE POLICY room_participants_select ON room_participants FOR SELECT USING (
  room_id IN (
    SELECT id FROM rooms 
    WHERE creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
       OR joiner_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

-- Contract terms: room members can view
CREATE POLICY contract_terms_select ON contract_terms FOR SELECT USING (
  room_id IN (
    SELECT id FROM rooms 
    WHERE creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
       OR joiner_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

-- Messages: room members can view and insert
CREATE POLICY messages_select ON messages FOR SELECT USING (
  room_id IN (
    SELECT id FROM rooms 
    WHERE creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
       OR joiner_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK (
  sender_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  AND room_id IN (
    SELECT id FROM rooms 
    WHERE creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
       OR joiner_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

-- Notifications: users can only see their own
CREATE POLICY notifications_select ON notifications FOR SELECT USING (
  user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (
  user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);

-- Stakes: room members can view
CREATE POLICY stakes_select ON stakes FOR SELECT USING (
  room_id IN (
    SELECT id FROM rooms 
    WHERE creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
       OR joiner_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

-- Action requests: room members can view and create
CREATE POLICY action_requests_select ON action_requests FOR SELECT USING (
  room_id IN (
    SELECT id FROM rooms 
    WHERE creator_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
       OR joiner_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  )
);

-- =============================================================================
-- REALTIME SUBSCRIPTIONS (for Supabase Realtime)
-- =============================================================================

-- Enable realtime for messages (for live chat)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Enable realtime for rooms (for status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

-- Enable realtime for action_requests (for live approve/reject)
ALTER PUBLICATION supabase_realtime ADD TABLE action_requests;

-- Enable realtime for stakes (for funding progress)
ALTER PUBLICATION supabase_realtime ADD TABLE stakes;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- =============================================================================
-- SEED DATA (optional - for development)
-- =============================================================================

-- Example: Insert a test penalty wallet reference
-- This would be used by the API to validate on-chain penalty wallet matches
INSERT INTO audit_log (action, description, new_state)
VALUES (
  'system.initialized',
  'StakeGuard schema initialized',
  '{"penalty_wallet": "2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv", "program_id": "Edmq5WTFJL5gtwMmD9HdtJ5N14ivXMP4vprvPxRkFZRJ"}'::jsonb
);
