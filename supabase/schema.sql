-- =============================================================================
-- PACKEDPAY: Simplified Escrow Schema
-- Only 2 tables: rooms + messages
-- Essential financial/status columns are SQL; everything else is JSONB metadata
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Rooms — the core escrow agreement container
-- ---------------------------------------------------------------------------
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Join code (like Kahoot) — 6 chars alphanumeric, uppercase
  join_code TEXT UNIQUE NOT NULL,

  -- Status — kept as TEXT for simplicity (no enum migration hassles)
  -- Values: pending | awaiting_approval | funding | active | resolved | slashed | cancelled
  status TEXT NOT NULL DEFAULT 'pending',

  -- ── Essential financial columns (SQL) ──────────────────────────────────
  reward_amount NUMERIC(20,9) NOT NULL,
  creator_stake_amount NUMERIC(20,9) NOT NULL,
  joiner_stake_amount NUMERIC(20,9) NOT NULL,

  -- ── Wallet addresses (SQL — used for lookups & access control) ─────────
  creator_wallet TEXT NOT NULL,
  joiner_wallet TEXT,

  -- ── Funding status (SQL — drives workflow logic) ───────────────────────
  creator_funded BOOLEAN DEFAULT FALSE,
  joiner_funded BOOLEAN DEFAULT FALSE,

  -- ── Visibility (SQL — used for filtered queries) ──────────────────────
  is_public BOOLEAN DEFAULT FALSE,

  -- ── All other info bundled here ────────────────────────────────────────
  -- Expected keys:
  --   title              (string)  — room title
  --   description        (string)  — room description
  --   tags               (string[]) — searchable tags
  --   escrow_pda         (string)  — Solana PDA for the escrow account
  --   escrow_initialized (bool)    — whether the on-chain escrow was created
  --   contract_deadline  (string)  — ISO date deadline
  --   terms              (object)  — { title, summary, conditions: [...] }
  --   creator_approved_terms (bool)
  --   joiner_approved_terms  (bool)
  --   resolved_at        (string)  — ISO timestamp
  --   slashed_at         (string)  — ISO timestamp
  --   resolution_tx_sig  (string)  — on-chain tx signature
  metadata JSONB DEFAULT '{}'::jsonb,

  -- ── Timestamps ─────────────────────────────────────────────────────────
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Constraints
ALTER TABLE rooms ADD CONSTRAINT reward_positive CHECK (reward_amount > 0);
ALTER TABLE rooms ADD CONSTRAINT creator_stake_positive CHECK (creator_stake_amount > 0);
ALTER TABLE rooms ADD CONSTRAINT joiner_stake_positive CHECK (joiner_stake_amount > 0);

-- ---------------------------------------------------------------------------
-- Messages — minimal, used for resolve-approval tracking + system events
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_wallet TEXT,           -- null for system messages
  type TEXT DEFAULT 'system',   -- system | text | stake_notification
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_rooms_join_code ON rooms(join_code);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_creator ON rooms(creator_wallet);
CREATE INDEX idx_rooms_joiner ON rooms(joiner_wallet);
CREATE INDEX idx_rooms_public ON rooms(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_rooms_created_at ON rooms(created_at DESC);
CREATE INDEX idx_rooms_tags ON rooms USING GIN((metadata->'tags'));

CREATE INDEX idx_messages_room ON messages(room_id);
CREATE INDEX idx_messages_created ON messages(room_id, created_at DESC);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Generate unique 6-char join code (no I, O, 0, 1 to avoid confusion)
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT := '';
  i INTEGER;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE join_code = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate join code on room insert
CREATE OR REPLACE FUNCTION auto_generate_join_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    NEW.join_code := generate_join_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_rooms_join_code BEFORE INSERT ON rooms
  FOR EACH ROW EXECUTE FUNCTION auto_generate_join_code();

-- =============================================================================
-- RLS (service-role bypasses; anon/auth uses policies)
-- =============================================================================

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY rooms_all ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY messages_all ON messages FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
