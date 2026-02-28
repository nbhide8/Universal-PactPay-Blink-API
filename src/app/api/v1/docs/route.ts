import { NextResponse } from 'next/server';

/**
 * GET /api/v1/docs — StakeGuard API Documentation
 *
 * Returns a comprehensive JSON description of all available endpoints.
 * This is the entrypoint for any external developer integrating StakeGuard.
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stakeguard.app';

  const docs = {
    name: 'StakeGuard API',
    version: '2.0.0',
    description:
      'Blockchain-backed escrow API. Every lockbox is a real Solana on-chain PDA escrow. ' +
      'Crypto users sign transactions directly (direct mode). Non-crypto users pay via Stripe or company credits ' +
      'and the API handles the blockchain operations custodially (custodial mode). ' +
      'Same on-chain escrow. Same guarantees. Deploy on Railway, call from anywhere.',
    baseUrl: `${baseUrl}/api/v1`,
    network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
    programId: 'Edmq5WTFJL5gtwMmD9HdtJ5N14ivXMP4vprvPxRkFZRJ',
    penaltyWallet: '2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv',

    architecture: {
      title: '3-Component Architecture',
      description:
        'The API exists independently. It has ZERO dependency on any frontend. ' +
        'Any company can deploy it to Railway, get an API key, and build their own escrow-backed application.',
      components: [
        {
          name: 'StakeGuard API',
          description: 'Standalone REST API deployed on Railway. Returns JSON only. Manages escrow lifecycle. Signs custodial Solana transactions.',
          url: 'https://stakeguard-api.up.railway.app',
          independent: true,
        },
        {
          name: 'StakeWork Frontend',
          description: 'Next.js demo app that CONSUMES the API via NEXT_PUBLIC_API_URL. Deployed separately on Vercel.',
          independent: true,
        },
        {
          name: 'Solana Smart Contract',
          description: 'Anchor program on Solana devnet. Every escrow room maps to an on-chain PDA. The blockchain is ALWAYS the escrow backend.',
          independent: true,
        },
      ],
    },

    escrowModes: {
      title: 'Escrow Modes — How Users Interact',
      coreInsight:
        'Solana blockchain is ALWAYS the escrow mechanism. Every lockbox = an on-chain PDA with real SOL locked. ' +
        'The "mode" determines WHO signs the Solana transactions.',
      modes: [
        {
          mode: 'direct',
          name: 'Direct Mode (Crypto Users)',
          description:
            'For users with Solana wallets. API returns unsigned transactions. User signs with their wallet and submits.',
          flow: 'API builds tx → User signs → User submits to /tx/submit → SOL locked on-chain',
          clientAction: 'sign_transaction',
          requiresWallet: true,
          requiresPlatformWallet: false,
        },
        {
          mode: 'custodial',
          name: 'Custodial Mode (Non-Crypto Users)',
          description:
            'For users WITHOUT wallets. API\'s platform wallet signs and submits Solana transactions on their behalf. ' +
            'User pays via a payment rail (Stripe or company credits).',
          flow: 'API builds tx → Platform wallet signs & submits → SOL locked on-chain → User pays via rail',
          clientAction: 'confirm_payment (Stripe) or none (credits)',
          requiresWallet: false,
          requiresPlatformWallet: true,
          paymentRails: [
            {
              rail: 'stripe',
              name: 'Stripe (Card/Bank)',
              description: 'Real money via Stripe PaymentIntents. User confirms payment with Stripe.js.',
              clientAction: 'confirm_payment',
            },
            {
              rail: 'credits',
              name: 'Company Credits',
              description: 'Internal balance tracking. API records deposit; company handles real money externally. Instant.',
              clientAction: 'none',
            },
          ],
        },
      ],
    },

    authentication: {
      type: 'api-key',
      description:
        'Include your API key in the X-API-Key header on all requests. ' +
        'The /api/v1/docs endpoint is public and does not require authentication. ' +
        'When STAKEGUARD_API_KEY is not configured on the server, authentication is disabled.',
      example: 'curl -H "X-API-Key: your-key-here" https://api.stakeguard.app/api/v1/rooms',
    },

    flow: {
      title: 'Typical Integration Flow',
      steps: [
        {
          step: 1,
          action: 'POST /api/v1/rooms',
          description:
            'Create an escrow room. Specify "mode" ("direct" or "custodial") and optionally "paymentRail" for custodial. ' +
            'Returns the room data + lockbox action. Every room creates a Solana on-chain PDA.',
        },
        {
          step: 2,
          action: 'Handle the lockbox action',
          description:
            'If mode is "direct": sign the returned Solana transaction and POST to /api/v1/tx/submit. ' +
            'If "custodial" with Stripe: confirm the PaymentIntent with Stripe.js. ' +
            'If "custodial" with credits: nothing to do — escrow is created and on-chain instantly.',
        },
        {
          step: 3,
          action: 'Share join code',
          description: 'The room response includes a join_code. Share it with the other party.',
        },
        {
          step: 4,
          action: 'POST /api/v1/rooms/:id/join',
          description: 'Other party joins the room with the join code.',
        },
        {
          step: 5,
          action: 'POST /api/v1/rooms/:id/stake',
          description:
            'Both parties call this to fund the escrow. Direct mode returns a tx to sign; custodial mode auto-stakes.',
        },
        {
          step: 6,
          action: 'POST /api/v1/rooms/:id/approve',
          description: 'Both parties approve resolution when terms are met.',
        },
        {
          step: 7,
          action: 'POST /api/v1/rooms/:id/resolve',
          description:
            'Once both approved, either party can call resolve. SOL returned on-chain via the room\'s mode.',
        },
      ],
    },

    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/rooms',
        description: 'Browse all public escrow rooms with pagination, search, and filtering.',
        queryParams: {
          page: { type: 'number', default: 1, description: 'Page number' },
          limit: { type: 'number', default: 20, max: 100, description: 'Results per page' },
          status: {
            type: 'string',
            enum: ['pending', 'awaiting_approval', 'funding', 'active', 'resolved', 'slashed', 'cancelled'],
            description: 'Filter by room status',
          },
          search: { type: 'string', description: 'Search title and description' },
          sortBy: { type: 'string', enum: ['created_at', 'creator_stake_amount'], default: 'created_at' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
        response: '{ success, data: { rooms: Room[], total, page, limit } }',
      },
      {
        method: 'POST',
        path: '/api/v1/rooms',
        description:
          'Create a new escrow room. Choose a mode (direct or custodial) — both create a Solana on-chain PDA.',
        body: {
          walletAddress: { type: 'string', required: true, description: "Creator's wallet address (direct) or any identifier (custodial)" },
          title: { type: 'string', required: true },
          description: { type: 'string' },
          mode: { type: 'string', enum: ['direct', 'custodial'], default: 'direct', description: 'Escrow interaction mode. Both use Solana on-chain.' },
          paymentRail: { type: 'string', enum: ['stripe', 'credits'], description: 'Required when mode is custodial. How the user pays.' },
          provider: { type: 'string', deprecated: true, description: 'Legacy field — mapped to mode automatically (solana→direct, stripe/ledger→custodial)' },
          currency: { type: 'string', description: 'Currency code. SOL for direct, USD etc. for custodial.' },
          creatorStakeAmount: { type: 'number', required: true, description: 'Must be >= joinerStakeAmount' },
          joinerStakeAmount: { type: 'number', required: true },
          isPublic: { type: 'boolean', default: true, description: 'Visible in browse listing' },
          tags: { type: 'string[]' },
          contractDeadline: { type: 'string', description: 'ISO 8601 date' },
          terms: {
            type: 'object',
            required: true,
            properties: {
              title: 'string',
              summary: 'string',
              conditions: 'ContractConditionData[]',
              additionalNotes: 'string?',
            },
          },
        },
        response: `{
  success: true,
  room: Room,
  lockbox: {
    mode: "direct" | "custodial",
    blockchain: "solana",
    onChain: true,
    paymentRail: "stripe" | "credits" | undefined,
    onChainSignature: string | undefined,
    action: {
      type: "sign_transaction" | "confirm_payment" | "none",
      payload: string | null,
      instructions: string,
      metadata: object
    }
  }
}`,
      },
      {
        method: 'GET',
        path: '/api/v1/rooms/:roomId',
        description: 'Get complete room details including participants, terms, stakes, and live on-chain state.',
        response: '{ success, room: RoomView, onChain: OnChainRoomData | null }',
      },
      {
        method: 'POST',
        path: '/api/v1/rooms/:roomId/join',
        description: 'Join a room using its join code. Database-only (no transaction needed).',
        body: {
          walletAddress: { type: 'string', required: true },
          joinCode: { type: 'string', required: true, description: '6-character room code' },
        },
        response: '{ success, room: Room }',
      },
      {
        method: 'POST',
        path: '/api/v1/rooms/:roomId/stake',
        description: 'Fund the escrow lockbox. Direct mode returns an unsigned tx to sign; custodial mode auto-stakes on-chain and returns fiat action.',
        body: {
          walletAddress: { type: 'string', required: true },
          participantId: { type: 'string', description: 'Defaults to walletAddress if omitted' },
          isCreator: { type: 'boolean', required: true },
        },
        response: '{ success, lockbox: { mode, blockchain, onChain, action }, stakeAmount }',
      },
      {
        method: 'POST',
        path: '/api/v1/rooms/:roomId/approve',
        description: 'Approve resolution. Records in DB + returns mode-specific on-chain action.',
        body: {
          walletAddress: { type: 'string', required: true },
        },
        response: '{ success, lockbox: { mode, blockchain, onChain, action } }',
      },
      {
        method: 'POST',
        path: '/api/v1/rooms/:roomId/resolve',
        description:
          'Resolve the escrow. SOL returned on-chain; fiat settlement info included for custodial mode.',
        body: {
          walletAddress: { type: 'string', required: true },
        },
        response: '{ success, lockbox: { mode, blockchain, onChain, action } }',
      },
      {
        method: 'POST',
        path: '/api/v1/rooms/:roomId/slash',
        description: 'Slash the escrow. All staked funds sent to the penalty wallet on-chain.',
        body: {
          walletAddress: { type: 'string', required: true },
        },
        response: '{ success, lockbox: { mode, blockchain, onChain, action } }',
      },
      {
        method: 'POST',
        path: '/api/v1/rooms/:roomId/cancel',
        description: 'Cancel the escrow. Creator cancels before room is fully funded. On-chain refund.',
        body: {
          walletAddress: { type: 'string', required: true },
        },
        response: '{ success, lockbox: { mode, blockchain, onChain, action } }',
      },
      {
        method: 'POST',
        path: '/api/v1/tx/submit',
        description:
          'Submit a signed transaction to the Solana network. Optionally pass roomId + action for automatic DB updates.',
        body: {
          signedTransaction: { type: 'string', required: true, description: 'Base64-encoded signed transaction' },
          roomId: { type: 'string', description: 'Room ID for post-confirmation DB updates' },
          action: {
            type: 'string',
            enum: ['initialize_room', 'stake', 'approve', 'resolve', 'slash', 'cancel'],
            description: 'Action type for DB update',
          },
          walletAddress: { type: 'string', description: 'Submitter wallet for DB records' },
          metadata: { type: 'object', description: 'Extra data (e.g., { isCreator: true })' },
        },
        response: '{ success, signature: string, confirmationStatus: string }',
      },
    ],

    sdkIntegration: {
      title: 'Quick Start (JavaScript/TypeScript)',
      examples: [
        {
          title: 'Direct Mode — Crypto user signs their own tx',
          code: `
// 1. Create a room (direct mode — you sign the Solana tx)
const res = await fetch('${baseUrl}/api/v1/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  body: JSON.stringify({
    walletAddress: wallet.publicKey.toBase58(),
    mode: 'direct',
    title: 'Freelance Design Project',
    creatorStakeAmount: 2.0,
    joinerStakeAmount: 1.0,
    terms: {
      title: 'Design Terms',
      summary: 'Deliver 5 mockups by March 10',
      conditions: [{ type: 'task_completion', title: 'Deliver mockups', description: '5 Figma mockups', responsible_party: 'joiner', stake_weight: 100 }]
    }
  })
});
const { room, lockbox } = await res.json();
// lockbox.mode === 'direct', lockbox.blockchain === 'solana', lockbox.onChain === true

// 2. Sign and submit the transaction
const tx = Transaction.from(Buffer.from(lockbox.action.payload, 'base64'));
const signed = await wallet.signTransaction(tx);
await fetch('${baseUrl}/api/v1/tx/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    signedTransaction: Buffer.from(signed.serialize()).toString('base64'),
    roomId: room.id,
    action: 'initialize_room',
    walletAddress: wallet.publicKey.toBase58()
  })
});
          `.trim(),
        },
        {
          title: 'Custodial Mode — Non-crypto user (Stripe)',
          code: `
// 1. Create a room (custodial + stripe — API handles Solana)
const res = await fetch('${baseUrl}/api/v1/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  body: JSON.stringify({
    walletAddress: 'user-42',
    mode: 'custodial',
    paymentRail: 'stripe',
    title: 'Web Dev Project',
    creatorStakeAmount: 500,
    joinerStakeAmount: 250,
    currency: 'USD',
    terms: { title: 'Dev Terms', summary: 'Deploy site by Friday' }
  })
});
const { room, lockbox } = await res.json();
// lockbox.mode === 'custodial', lockbox.blockchain === 'solana', lockbox.onChain === true
// lockbox.onChainSignature === 'abc123...' (already submitted!)

// 2. Confirm the Stripe payment (if paymentRail is 'stripe')
if (lockbox.action.type === 'confirm_payment') {
  await stripe.confirmPayment({ clientSecret: lockbox.action.payload });
}
          `.trim(),
        },
      ],
    },

    curlExamples: {
      title: 'Terminal / curl Workflow',
      description: 'The API is fully usable from the command line. Here is a complete workflow using curl.',
      examples: [
        {
          step: 1,
          title: 'Browse open rooms',
          command: `curl -s "${baseUrl}/api/v1/rooms?status=pending&limit=5" | jq '.data.rooms[] | {title, id, creator_stake_amount, joiner_stake_amount, join_code}'`,
        },
        {
          step: 2,
          title: 'Create a new room',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms" \\
  -H "Content-Type: application/json" \\
  -d '{
    "walletAddress": "YOUR_WALLET_ADDRESS",
    "title": "Build a landing page",
    "description": "Need a responsive landing page with hero, features, and CTA sections",
    "creatorStakeAmount": 2.0,
    "joinerStakeAmount": 1.0,
    "terms": {
      "title": "Landing Page Job",
      "summary": "Deliver a responsive landing page by Friday",
      "conditions": [
        {
          "type": "task_completion",
          "title": "Responsive design",
          "description": "Must work on mobile, tablet, and desktop",
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
  }' | jq`,
          note: 'Default mode is "direct". Add "mode": "custodial", "paymentRail": "stripe" for non-crypto users. Save the room.id.',
        },
        {
          step: 3,
          title: 'Get room details',
          command: `curl -s "${baseUrl}/api/v1/rooms/ROOM_ID" | jq`,
        },
        {
          step: 4,
          title: 'Join a room (other party)',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/join" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "WORKER_WALLET", "joinCode": "ABC123"}' | jq`,
        },
        {
          step: 5,
          title: 'Build a stake transaction',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/stake" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YOUR_WALLET", "isCreator": true}' | jq`,
          note: 'Returns an unsigned transaction. Sign with your wallet, then submit via /api/v1/tx/submit.',
        },
        {
          step: 6,
          title: 'Submit a signed transaction',
          command: `curl -s -X POST "${baseUrl}/api/v1/tx/submit" \\
  -H "Content-Type: application/json" \\
  -d '{
    "signedTransaction": "BASE64_SIGNED_TX",
    "roomId": "ROOM_ID",
    "action": "stake",
    "walletAddress": "YOUR_WALLET",
    "metadata": {"isCreator": true}
  }' | jq`,
        },
        {
          step: 7,
          title: 'Approve resolution (both parties)',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/approve" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YOUR_WALLET"}' | jq`,
        },
        {
          step: 8,
          title: 'Resolve (get SOL back)',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/resolve" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YOUR_WALLET"}' | jq`,
        },
        {
          step: 'alt',
          title: 'Slash (penalize both parties)',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/slash" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YOUR_WALLET"}' | jq`,
        },
        {
          step: 'alt',
          title: 'Cancel room (creator only, before fully funded)',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/cancel" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "CREATOR_WALLET"}' | jq`,
        },
      ],
    },

    errors: {
      description: 'All endpoints return { success: false, error: string } on failure',
      commonErrors: [
        { status: 400, error: 'Validation failed or bad request' },
        { status: 401, error: 'Invalid or missing API key (when auth is enabled)' },
        { status: 404, error: 'Room not found' },
        { status: 500, error: 'Internal server error' },
      ],
    },

    multiModeExamples: {
      title: 'Mode Comparison Examples',
      description: 'Both modes create the same Solana on-chain escrow. The difference is WHO signs.',
      examples: [
        {
          mode: 'direct',
          title: 'Direct — Crypto-native user signs their own Solana tx',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms" \\
  -H "Content-Type: application/json" -H "X-API-Key: YOUR_KEY" \\
  -d '{
    "walletAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "mode": "direct",
    "title": "Smart contract audit",
    "creatorStakeAmount": 5.0,
    "joinerStakeAmount": 2.0,
    "terms": { "title": "Audit Terms", "summary": "Full audit of Anchor program" }
  }' | jq '.lockbox'`,
          note: 'lockbox.action.type = "sign_transaction". Sign the base64 payload with your Solana wallet and POST to /api/v1/tx/submit.',
        },
        {
          mode: 'custodial',
          paymentRail: 'stripe',
          title: 'Custodial + Stripe — Non-crypto user pays with card',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms" \\
  -H "Content-Type: application/json" -H "X-API-Key: YOUR_KEY" \\
  -d '{
    "walletAddress": "acct_1234567890",
    "mode": "custodial",
    "paymentRail": "stripe",
    "title": "Freelance design project",
    "creatorStakeAmount": 500,
    "joinerStakeAmount": 250,
    "currency": "USD",
    "terms": { "title": "Design Terms", "summary": "5 mockups by Friday" }
  }' | jq '.lockbox'`,
          note: 'lockbox.action.type = "confirm_payment". Solana escrow already created (see onChainSignature). Confirm the Stripe PaymentIntent client-side.',
        },
        {
          mode: 'custodial',
          paymentRail: 'credits',
          title: 'Custodial + Credits — Internal company escrow',
          command: `curl -s -X POST "${baseUrl}/api/v1/rooms" \\
  -H "Content-Type: application/json" -H "X-API-Key: YOUR_KEY" \\
  -d '{
    "walletAddress": "user-42",
    "mode": "custodial",
    "paymentRail": "credits",
    "title": "Team accountability challenge",
    "creatorStakeAmount": 100,
    "joinerStakeAmount": 100,
    "terms": { "title": "Challenge Terms", "summary": "Complete 30-day fitness challenge" }
  }' | jq '.lockbox'`,
          note: 'lockbox.action.type = "none". Solana escrow created instantly by the platform wallet. Your company manages fiat movement externally.',
        },
      ],
    },
  };

  return NextResponse.json(docs, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
