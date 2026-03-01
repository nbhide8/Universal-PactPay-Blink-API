# Blink API + PackedPay Demo

**HackIllinois 2026** — Blockchain-backed escrow for jobs & rewards.

Every escrow room is a real **Solana on-chain PDA** with locked SOL. The API is fully standalone — deploy it on Railway and call it from any frontend, mobile app, or terminal.

---

## Architecture

```
┌─────────────────────┐        ┌────────────────────────┐
│   PackedPay Demo    │  HTTP  │       Blink API         │
│   (Next.js :3000)   │───────▶│   (Next.js :3001)       │
│   src/              │        │   api/                  │
└─────────────────────┘        └──────────┬─────────────┘
                                          │
                        ┌─────────────────┼─────────────────┐
                        ▼                 ▼                 ▼
                  ┌──────────┐    ┌──────────────┐   ┌──────────┐
                  │  Solana  │    │   Supabase   │   │  Stripe  │
                  │  Devnet  │    │  (Postgres)  │   │ Payments │
                  └──────────┘    └──────────────┘   └──────────┘
```

| Component | Location | Port | Description |
|-----------|----------|------|-------------|
| **Blink API** | `api/` | 3001 | Standalone REST API. Zero frontend dependency. |
| **PackedPay** | `src/` | 3000 | Demo app that consumes the API. |
| **Anchor Program** | Solana devnet | — | Program ID: `4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf` |

---

## Quick Start (Local)

```bash
# 1. Install everything
npm install && cd api && npm install && cd ..

# 2. Set up env vars (copy and fill in)
cp .env.example .env
cp api/.env.example api/.env.local

# 3. Run both apps
npm run dev:all
# Or individually:
#   npm run dev        → PackedPay on :3000
#   npm run dev:api    → Blink API on :3001
```

### Required Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Both | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Both | Supabase anon key |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Both | Solana RPC (e.g. `https://api.devnet.solana.com`) |
| `NEXT_PUBLIC_PROGRAM_ID` | Both | Anchor program ID |
| `BLINK_API_KEY` | API only | API key for auth (leave empty to disable) |
| `PLATFORM_WALLET_SECRET` | API only | Base58 secret key for custodial mode |
| `STRIPE_SECRET_KEY` | API only | Stripe secret key (custodial + stripe) |
| `STRIPE_WEBHOOK_SECRET` | API only | Stripe webhook signing secret |
| `NEXT_PUBLIC_API_URL` | Demo only | Blink API URL (e.g. `http://localhost:3001`) |
| `NEXT_PUBLIC_API_KEY` | Demo only | API key to send in X-API-Key header |

---

## Deploy to Railway

The API is Railway-ready. The config is in [`api/railway.toml`](api/railway.toml).

```bash
# From the api/ directory:
cd api
railway up
```

**Railway env vars to set in the dashboard:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_PROGRAM_ID`
- `BLINK_API_KEY` (your secret API key)
- `PLATFORM_WALLET_SECRET` (for custodial mode)

The API will be available at `https://your-app.up.railway.app`. The health check endpoint is `GET /api/v1/docs`.

---

## Escrow Modes

Both modes create the **same Solana on-chain PDA escrow**. The difference is who signs.

| | Direct Mode | Custodial Mode |
|---|---|---|
| **Who signs** | User's Solana wallet | Platform wallet |
| **User needs** | Phantom / Solflare wallet | Nothing (pays via Stripe or credits) |
| **API returns** | Unsigned transaction (base64) | Already signed + submitted |
| **Client action** | Sign tx → POST `/tx/submit` | Confirm Stripe payment (or nothing) |
| **On-chain** | Yes | Yes |

---

## API Reference

**Base URL:** `http://localhost:3001/api/v1` (local) or `https://your-app.up.railway.app/api/v1` (Railway)

**Auth:** Include `X-API-Key: YOUR_KEY` header on all requests (except `/docs` and `/webhooks/stripe`).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/docs` | Full API documentation (JSON). No auth required. |
| `GET` | `/rooms` | Browse public rooms. Supports pagination, search, filters. |
| `POST` | `/rooms` | Create an escrow room. Returns room + lockbox action. |
| `GET` | `/rooms/:id` | Get room details + live on-chain state. |
| `POST` | `/rooms/:id/join` | Join a room with join code. |
| `POST` | `/rooms/join` | Join a room by code (no roomId needed in URL). |
| `POST` | `/rooms/:id/stake` | Fund the escrow. Returns tx to sign (direct) or auto-stakes (custodial). |
| `POST` | `/rooms/:id/approve` | Approve resolution. Both parties must approve. |
| `POST` | `/rooms/:id/resolve` | Resolve escrow. SOL returned to participants on-chain. |
| `POST` | `/rooms/:id/slash` | Slash escrow. All SOL sent to penalty wallet. |
| `POST` | `/rooms/:id/cancel` | Cancel room (creator only, before fully funded). |
| `POST` | `/tx/submit` | Submit a signed Solana transaction. |
| `GET` | `/events` | Get on-chain event listener status. |
| `POST` | `/events` | Start/stop/poll on-chain event listener. |
| `POST` | `/webhooks/stripe` | Stripe webhook (auto-stakes on payment confirmation). |

---

## Terminal Workflow (curl)

This is a complete walkthrough of using the API from the command line.

### 1. Check the API is running

```bash
curl -s http://localhost:3001/api/v1/docs | jq '.name, .version'
# "Blink API"
# "2.0.0"
```

### 2. Browse open rooms

```bash
curl -s "http://localhost:3001/api/v1/rooms?status=pending&limit=5" \
  -H "X-API-Key: YOUR_KEY" | jq '.data.rooms[] | {id, title, creator_stake_amount, join_code}'
```

### 3. Create a room (Direct Mode)

```bash
curl -s -X POST http://localhost:3001/api/v1/rooms \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "walletAddress": "YOUR_SOLANA_WALLET_ADDRESS",
    "title": "Build a landing page",
    "description": "Responsive landing page with hero, features, CTA",
    "creatorStakeAmount": 2.0,
    "joinerStakeAmount": 1.0,
    "terms": {
      "title": "Landing Page Job",
      "summary": "Deliver a responsive landing page by Friday",
      "conditions": [
        {
          "type": "task_completion",
          "title": "Responsive design",
          "description": "Works on mobile, tablet, desktop",
          "responsible_party": "joiner",
          "stake_weight": 50
        },
        {
          "type": "delivery",
          "title": "Source code",
          "description": "Push to GitHub repo",
          "responsible_party": "joiner",
          "stake_weight": 50
        }
      ]
    }
  }' | jq
```

**Response includes:**
```json
{
  "success": true,
  "room": { "id": "uuid-here", "join_code": "ABC123", "status": "pending", ... },
  "lockbox": {
    "mode": "direct",
    "blockchain": "solana",
    "onChain": true,
    "action": {
      "type": "sign_transaction",
      "payload": "BASE64_UNSIGNED_TX",
      "instructions": "Sign this transaction with your Solana wallet..."
    }
  }
}
```

Save the `room.id` and `room.join_code`. The `lockbox.action.payload` is the unsigned Solana transaction.

### 4. Create a room (Custodial Mode — Stripe)

```bash
curl -s -X POST http://localhost:3001/api/v1/rooms \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "walletAddress": "user-42",
    "mode": "custodial",
    "paymentRail": "stripe",
    "title": "Freelance design project",
    "creatorStakeAmount": 500,
    "joinerStakeAmount": 250,
    "currency": "USD",
    "terms": {
      "title": "Design Terms",
      "summary": "5 mockups by Friday"
    }
  }' | jq '.lockbox'
```

Custodial response: the API's platform wallet already created the on-chain escrow. The `action.type` is `"confirm_payment"` with a Stripe PaymentIntent client secret.

### 5. Get room details

```bash
curl -s "http://localhost:3001/api/v1/rooms/ROOM_ID" \
  -H "X-API-Key: YOUR_KEY" | jq
```

Returns room data + live `onChain` state from the Solana PDA.

### 6. Join a room

```bash
# By room ID:
curl -s -X POST "http://localhost:3001/api/v1/rooms/ROOM_ID/join" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"walletAddress": "WORKER_WALLET", "joinCode": "ABC123"}' | jq

# Or by join code only (no room ID needed):
curl -s -X POST "http://localhost:3001/api/v1/rooms/join" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"walletAddress": "WORKER_WALLET", "joinCode": "ABC123"}' | jq
```

### 7. Stake (fund the escrow)

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/ROOM_ID/stake" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"walletAddress": "YOUR_WALLET", "isCreator": true}' | jq
```

Direct mode: returns unsigned tx in `lockbox.action.payload`. Sign it and submit to `/tx/submit`.

### 8. Submit a signed transaction

```bash
curl -s -X POST http://localhost:3001/api/v1/tx/submit \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "signedTransaction": "BASE64_SIGNED_TX",
    "roomId": "ROOM_ID",
    "action": "stake",
    "walletAddress": "YOUR_WALLET",
    "metadata": {"isCreator": true}
  }' | jq
```

The `roomId`, `action`, `walletAddress`, and `metadata` are optional but recommended — they trigger automatic database updates after on-chain confirmation.

### 9. Approve resolution (both parties)

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/ROOM_ID/approve" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"walletAddress": "YOUR_WALLET"}' | jq
```

### 10. Resolve (get SOL back)

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/ROOM_ID/resolve" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"walletAddress": "YOUR_WALLET"}' | jq
```

### Alternative: Slash (penalize)

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/ROOM_ID/slash" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"walletAddress": "YOUR_WALLET"}' | jq
```

### Alternative: Cancel (creator only)

```bash
curl -s -X POST "http://localhost:3001/api/v1/rooms/ROOM_ID/cancel" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"walletAddress": "CREATOR_WALLET"}' | jq
```

---

## How PackedPay Uses the API

The demo app ([`src/lib/api.ts`](src/lib/api.ts)) is a thin TypeScript client around the Blink API. Here's the mapping:

| Demo App Function | API Endpoint | What it does |
|-------------------|-------------|--------------|
| `getRooms(params)` | `GET /rooms` | Browse page fetches public rooms with filters |
| `getRoom(id)` | `GET /rooms/:id` | Room detail page loads room + on-chain state |
| `createRoom(data)` | `POST /rooms` | Create wizard submits new escrow room |
| `joinRoom(data)` | `POST /rooms/join` | Join page submits wallet + join code |
| `stakeRoom(id, data)` | `POST /rooms/:id/stake` | Room page triggers escrow funding |
| `approveRoom(id, data)` | `POST /rooms/:id/approve` | Room page sends approval |
| `resolveRoom(id, data)` | `POST /rooms/:id/resolve` | Room page resolves escrow |
| `slashRoom(id, data)` | `POST /rooms/:id/slash` | Room page slashes escrow |
| `cancelRoom(id, data)` | `POST /rooms/:id/cancel` | Room page cancels escrow |
| `submitTransaction(data)` | `POST /tx/submit` | After user signs tx in wallet |
| `buildAuthMessage(action, roomId)` | — | Builds `blink:<action>:<roomId>:<timestamp>` for wallet signing |

### Direct Mode Flow in PackedPay

```
User clicks "Stake" button
  → PackedPay calls stakeRoom(roomId, { walletAddress, isCreator })
  → API returns { lockbox: { action: { payload: "base64tx" } } }
  → PackedPay deserializes the transaction
  → User signs with Phantom/Solflare
  → PackedPay calls submitTransaction({ signedTransaction, roomId, action: "stake" })
  → API submits to Solana + updates Supabase
```

### Authentication Flow

When `REQUIRE_SIGNATURES=true` is set on the API, requests need Ed25519 signatures:

```
1. PackedPay calls buildAuthMessage("stake", roomId)
   → returns "blink:stake:abc-123:1700000000"
2. User signs the message with their Solana wallet
3. PackedPay sends { walletAddress, signature, message } in the request body
4. API verifies: correct wallet signed the exact message, timestamp within 5 minutes
```

---

## On-Chain Event Listener

The API includes a Solana event poller that watches for Anchor program events and triggers actions (e.g., Stripe captures on successful stakes).

```bash
# Start the listener
curl -s -X POST http://localhost:3001/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"action": "start", "intervalMs": 10000}' | jq

# Check status
curl -s http://localhost:3001/api/v1/events \
  -H "X-API-Key: YOUR_KEY" | jq

# Manual one-shot poll
curl -s -X POST http://localhost:3001/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"action": "poll"}' | jq

# Stop
curl -s -X POST http://localhost:3001/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{"action": "stop"}' | jq
```

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Invalid or missing API key |
| 404 | Room not found |
| 500 | Internal server error |

---

## Project Structure

```
hackillinois-2026/
├── api/                          # Blink API (standalone)
│   ├── src/
│   │   ├── app/
│   │   │   └── api/v1/           # All REST endpoints
│   │   │       ├── docs/
│   │   │       ├── events/
│   │   │       ├── rooms/
│   │   │       │   ├── [roomId]/
│   │   │       │   │   ├── approve/
│   │   │       │   │   ├── cancel/
│   │   │       │   │   ├── join/
│   │   │       │   │   ├── resolve/
│   │   │       │   │   ├── slash/
│   │   │       │   │   └── stake/
│   │   │       │   └── join/
│   │   │       ├── tx/submit/
│   │   │       └── webhooks/stripe/
│   │   ├── lib/
│   │   │   ├── auth/verify.ts    # Ed25519 signature verification
│   │   │   ├── events/           # On-chain event poller + Stripe dispatcher
│   │   │   ├── providers/        # Direct + Custodial engine abstraction
│   │   │   ├── solana/           # Anchor IDL, PDA derivation, tx builders
│   │   │   └── stripe/           # Stripe PaymentIntent management
│   │   └── middleware.ts         # CORS + API key auth
│   ├── railway.toml
│   └── package.json
├── src/                          # PackedPay Demo (consumes API)
│   ├── app/
│   │   ├── browse/               # Job board
│   │   ├── create/               # 3-step room creation wizard
│   │   ├── dashboard/            # My rooms
│   │   ├── join/                 # Enter join code
│   │   ├── room/[roomId]/        # Full escrow action page
│   │   └── page.tsx              # Homepage
│   ├── lib/api.ts                # API client (all fetch calls)
│   └── providers/WalletProvider  # Solana wallet adapter
├── .env
└── package.json
```
