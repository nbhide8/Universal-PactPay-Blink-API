# PackedPay — Trustless Escrow on Solana

**HackIllinois 2026** — Blockchain-backed escrow for freelance jobs & bounties.

PackedPay lets two parties lock SOL into an on-chain escrow, collaborate on a task, and release funds only when both agree the work is done. Every escrow is a real **Solana PDA** — no middleman, no trust required.

---

## How It Works

```
Creator                                        Worker
   │                                              │
   ├─ 1. Create room (set reward + stakes)        │
   │    └─ Auto-stakes collateral + reward         │
   │                                              │
   │  2. Worker browses open rooms ◄──────────────┤
   │                                              │
   │  3. Worker marks interest ◄──────────────────┤
   │                                              │
   ├─ 4. Creator accepts a worker                  │
   │                                              │
   │  5. Worker stakes collateral ◄───────────────┤
   │     └─ Room is now ACTIVE (both staked)       │
   │                                              │
   │         ── work happens off-chain ──          │
   │                                              │
   ├─ 6a. Creator approves resolution (on-chain)  │
   │  6b. Worker approves resolution (on-chain) ◄─┤
   │                                              │
   ├─ 7. Creator signs resolve tx                  │
   │     └─ Creator gets stake back                │
   │     └─ Worker gets stake + reward             │
   └───────────────────────────────────────────────┘
```

**Key economics:**
- **Creator** locks `creator_stake + reward` into escrow
- **Worker** locks `joiner_stake` into escrow
- On **resolve**: creator gets their stake back, worker gets their stake + the reward
- On **slash**: all funds go to a penalty wallet (nuclear option)
- On **cancel**: creator gets funds back (only before worker stakes)

---

## Architecture

```
┌─────────────────────┐        ┌────────────────────────┐
│   PackedPay Demo    │  HTTP  │       Blink API         │
│   (Next.js :3000)   │───────▶│   (Next.js :3001)       │
│   src/              │        │   api/                  │
└─────────────────────┘        └──────────┬─────────────┘
                                          │
                               ┌──────────┴──────────┐
                               ▼                     ▼
                         ┌──────────┐        ┌──────────────┐
                         │  Solana  │        │   Supabase   │
                         │  Devnet  │        │  (Postgres)  │
                         └──────────┘        └──────────────┘
```

| Component | Location | Port | Description |
|-----------|----------|------|-------------|
| **Blink API** | `api/` | 3001 | Standalone REST API — builds Solana transactions, manages rooms |
| **PackedPay** | `src/` | 3000 | Demo frontend that consumes the API |
| **StakeGuard** | Solana devnet | — | Program ID: `4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf` |

---

## Quick Start

```bash
# 1. Install dependencies
npm install && cd api && npm install && cd ..

# 2. Set up env vars
cp .env.example .env
cp api/.env.example api/.env.local
# Fill in your Supabase + Solana RPC credentials

# 3. Apply database schema
# Run supabase/schema.sql against your Supabase project (SQL Editor in dashboard)

# 4. Run both apps
npm run dev:all
# Or individually:
#   npm run dev        → PackedPay on :3000
#   npm run dev:api    → Blink API on :3001
```

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Both | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Both | Supabase anon key |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Both | Solana RPC (e.g. `https://api.devnet.solana.com`) |
| `NEXT_PUBLIC_API_URL` | Frontend | Blink API URL (e.g. `http://localhost:3001`) |

---

## Room Lifecycle & Status Flow

```
pending → open → awaiting_joiner_stake → active → resolved
                                            │
                                            ├───→ slashed
                                            └───→ cancelled
```

| Status | Meaning |
|--------|---------|
| `pending` | Room created, creator staking in progress |
| `open` | Creator staked, waiting for workers to show interest |
| `awaiting_joiner_stake` | Creator accepted a worker, waiting for their stake |
| `active` | Both parties staked — work is in progress |
| `resolved` | Both approved + on-chain resolve tx confirmed — funds released |
| `slashed` | Funds sent to penalty wallet |
| `cancelled` | Creator cancelled before worker staked |

---

## On-Chain Program (StakeGuard)

The Solana program manages the escrow lifecycle with these instructions:

| Instruction | Who Signs | What It Does |
|-------------|-----------|--------------|
| `initializeRoom` | Creator | Creates the escrow PDA, sets stake amounts |
| `stake` | Creator or Worker | Deposits SOL into the escrow PDA |
| `approveResolve` | Creator or Worker | Records on-chain approval to resolve |
| `resolve` | Creator | Releases funds — creator gets stake, worker gets stake + reward |
| `slash` | Either party | Sends all funds to penalty wallet |
| `cancelRoom` | Creator | Returns funds (only before fully funded) |

The on-chain `RoomEscrow` account tracks:
- Stake amounts and funded status for both parties
- `creatorApprovedResolve` / `joinerApprovedResolve` flags
- Active/funded state

**Both parties must call `approveResolve` on-chain** before `resolve` can execute. This is enforced by the program — not just the database.

---

## API Endpoints

**Base URL:** `http://localhost:3001/api/v1`

### Rooms

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rooms` | Browse public rooms (pagination, search, filters) |
| `POST` | `/rooms` | Create a room — returns room + lockbox (unsigned init tx) |
| `GET` | `/rooms/:id` | Get room details |
| `POST` | `/rooms/:id/interest` | Mark interest in a room (as a potential worker) |
| `POST` | `/rooms/:id/accept` | Accept a worker (creator only) |
| `POST` | `/rooms/:id/stake` | Stake into escrow — returns unsigned stake tx |
| `POST` | `/rooms/:id/resolve-approve` | Approve resolution — returns unsigned `approveResolve` tx |
| `POST` | `/rooms/:id/resolve` | Finalize resolution — returns unsigned resolve tx (creator only) |
| `POST` | `/rooms/:id/slash` | Slash escrow — returns unsigned slash tx |
| `POST` | `/rooms/:id/cancel` | Cancel room — returns unsigned cancel tx |

### Transactions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tx/submit` | Submit a signed Solana transaction + trigger DB updates |

### How Direct Mode Works

Every action that touches Solana follows the same pattern:

```
1. Frontend calls API endpoint (e.g. POST /rooms/:id/stake)
2. API builds an unsigned Solana transaction
3. API returns it as base64 in { lockbox: { action: { payload: "base64tx" } } }
4. Frontend deserializes the tx, user signs with Phantom/Solflare
5. Frontend sends signed tx to POST /tx/submit
6. API submits to Solana, waits for confirmation, updates DB
```

---

## Database Schema

Only **2 tables** — intentionally minimal:

### `rooms`
Core escrow container with financial columns as real SQL types:
- `reward_amount`, `creator_stake_amount`, `joiner_stake_amount` — SOL amounts
- `creator_wallet`, `joiner_wallet` — Solana addresses
- `creator_funded`, `joiner_funded` — staking status
- `status` — lifecycle state
- `metadata` (JSONB) — title, description, tags, terms, escrow PDA, tx signatures, etc.

### `messages`
System event log used for:
- Tracking resolve approvals (`action: 'resolve_approved'` / `'both_approved'`)
- Recording stake/resolve notifications
- Audit trail of all room events

Resolution approval flags (`creator_resolve_approved`, `joiner_resolve_approved`) are **derived from system messages** at query time by `getRoomFull()` — not stored as room columns.

---

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| **Home** | `/` | Landing page |
| **Browse** | `/browse` | Public job board — search, filter, mark interest |
| **Create** | `/create` | Create a new escrow room (sets reward + stakes) |
| **Room** | `/room/:id` | Full workflow — stake, approve, resolve, chat |
| **Dashboard** | `/dashboard` | Your rooms (created + joined) |
| **Join** | `/join` | Enter a 6-character join code |

### Room Page Workflow

The room page shows a step-by-step progress indicator. Each role sees different steps:

**Creator sees:**
1. ✅ Staked (auto-staked on creation)
2. Wait for workers → Accept one
3. Wait for worker to stake
4. Approve Resolution (signs on-chain `approveResolve` tx)
5. Finalize Resolution (signs on-chain `resolve` tx — sends reward to worker)

**Worker sees:**
1. Stake collateral (signs on-chain `stake` tx)
2. Approve Resolution (signs on-chain `approveResolve` tx)
3. Wait for creator to finalize

---

## Project Structure

```
hackillinois-2026/
├── api/                            # Blink API (standalone backend)
│   └── src/
│       ├── app/api/v1/
│       │   ├── rooms/              # Room CRUD + browse
│       │   │   └── [roomId]/
│       │   │       ├── accept/     # Accept a worker
│       │   │       ├── cancel/     # Cancel room
│       │   │       ├── interest/   # Mark interest
│       │   │       ├── resolve/    # Build resolve tx
│       │   │       ├── resolve-approve/  # Build approveResolve tx
│       │   │       ├── slash/      # Build slash tx
│       │   │       └── stake/      # Build stake tx
│       │   └── tx/submit/          # Submit signed transactions
│       └── lib/
│           ├── database.ts         # Supabase queries + getRoomFull
│           ├── providers/          # Direct + Custodial engine abstraction
│           │   ├── direct.ts       # Builds unsigned txs for user signing
│           │   ├── custodial.ts    # Platform wallet signs on behalf
│           │   └── types.ts        # EscrowEngine interface
│           └── solana/
│               ├── idl.ts          # StakeGuard Anchor IDL
│               └── transactions.ts # All Solana tx builders
├── src/                            # PackedPay Frontend
│   ├── app/
│   │   ├── browse/                 # Job board
│   │   ├── create/                 # Room creation
│   │   ├── dashboard/              # My rooms
│   │   ├── room/[roomId]/          # Full escrow workflow page
│   │   └── join/                   # Join by code
│   └── lib/
│       └── api.ts                  # API client (all fetch calls)
├── contracts/
│   └── stakeguard.rs               # Anchor program source
├── supabase/
│   └── schema.sql                  # Database schema (2 tables)
└── package.json
```

---

## Tech Stack

- **Frontend:** Next.js 14, React 18, Tailwind CSS
- **Backend:** Next.js API routes (standalone), Supabase (Postgres)
- **Blockchain:** Solana devnet, Anchor framework
- **Wallet:** Solana Wallet Adapter (Phantom, Solflare, etc.)

---

## Error Responses

All endpoints return:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 403 | Not authorized (wrong wallet) |
| 404 | Room not found |
| 500 | Internal server error |
