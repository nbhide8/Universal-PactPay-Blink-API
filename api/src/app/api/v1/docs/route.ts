/**
 * GET /api/v1/docs — Blink API Documentation (Swagger UI)
 *
 * Serves a full OpenAPI 3.0 spec via Swagger UI.
 * Also supports ?format=json for the raw OpenAPI JSON spec.
 */

import { NextRequest } from 'next/server';

/* ── OpenAPI 3.0 Spec ─────────────────────────────────────────────────── */

function getOpenApiSpec(baseUrl: string) {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID || '4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf';

  return {
    openapi: '3.0.3',
    info: {
      title: 'Blink API',
      version: '2.0.0',
      description: `Blockchain-backed escrow for any app. Every lockbox is a real Solana on-chain PDA.\n\n**Network:** ${network}\n**Program ID:** \`${programId}\`\n\n## Escrow Modes\n\n| Mode | Who Signs | Payment |\n|------|-----------|----------|\n| **Direct** | User signs Solana tx with their wallet | SOL |\n| **Custodial** | Platform wallet signs on behalf of user | Stripe / Credits |\n\n## Integration Flow\n1. \`POST /rooms\` — Create an escrow room\n2. Handle the lockbox (sign tx or confirm payment)\n3. Share the \`join_code\` with the other party\n4. \`POST /rooms/:id/join\` — Other party joins\n5. \`POST /rooms/:id/stake\` — Both parties fund escrow\n6. \`POST /rooms/:id/approve\` — Both approve resolution\n7. \`POST /rooms/:id/resolve\` — Release funds on-chain`,
    },
    servers: [
      { url: `${baseUrl}/api/v1`, description: `Blink API (${network})` },
    ],
    tags: [
      { name: 'Rooms', description: 'Escrow room lifecycle' },
      { name: 'Transactions', description: 'Submit signed Solana transactions' },
      { name: 'Events', description: 'On-chain event listener management' },
      { name: 'Webhooks', description: 'Payment webhook endpoints' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey' as const,
          in: 'header' as const,
          name: 'X-API-Key',
          description: 'API key for authentication. When BLINK_API_KEY is not set on the server, auth is disabled.',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Validation failed' },
          },
        },
        Room: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'awaiting_approval', 'funding', 'active', 'resolved', 'slashed', 'cancelled'] },
            mode: { type: 'string', enum: ['direct', 'custodial'] },
            creator_stake_amount: { type: 'number' },
            joiner_stake_amount: { type: 'number' },
            join_code: { type: 'string' },
            is_public: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Lockbox: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['direct', 'custodial'] },
            blockchain: { type: 'string', example: 'solana' },
            onChain: { type: 'object' },
            action: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['sign_transaction', 'confirm_payment', 'none'] },
                payload: { type: 'string', description: 'Base64 unsigned tx (direct) or Stripe client secret (custodial)' },
              },
            },
          },
        },
        Terms: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            conditions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', example: 'task_completion' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  responsible_party: { type: 'string', enum: ['creator', 'joiner'] },
                  stake_weight: { type: 'number' },
                },
              },
            },
            additionalNotes: { type: 'string' },
          },
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
    paths: {
      '/rooms': {
        get: {
          tags: ['Rooms'],
          summary: 'Browse escrow rooms',
          description: 'Browse all public escrow rooms with pagination, search, and filtering.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 }, description: 'Results per page (max 100)' },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'awaiting_approval', 'funding', 'active', 'resolved', 'slashed', 'cancelled'] }, description: 'Filter by room status' },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search title and description' },
            { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['created_at', 'creator_stake_amount'], default: 'created_at' }, description: 'Sort field' },
            { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, description: 'Sort direction' },
          ],
          responses: {
            '200': {
              description: 'Paginated list of rooms',
              content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { rooms: { type: 'array', items: { $ref: '#/components/schemas/Room' } }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } } } } } },
            },
            '500': { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
        post: {
          tags: ['Rooms'],
          summary: 'Create escrow room',
          description: 'Create a new escrow room. Choose a mode (direct or custodial) — both create a Solana on-chain PDA.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletAddress', 'title', 'creatorStakeAmount', 'joinerStakeAmount', 'terms'],
                  properties: {
                    walletAddress: { type: 'string', description: "Creator's wallet address (direct) or any identifier (custodial)" },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    mode: { type: 'string', enum: ['direct', 'custodial'], default: 'direct', description: 'Escrow interaction mode' },
                    paymentRail: { type: 'string', enum: ['stripe', 'credits'], description: 'Required when mode is custodial' },
                    currency: { type: 'string', description: 'Currency code. SOL for direct, USD for custodial.' },
                    creatorStakeAmount: { type: 'number', description: 'Must be >= joinerStakeAmount' },
                    joinerStakeAmount: { type: 'number' },
                    isPublic: { type: 'boolean', default: true, description: 'Visible in browse listing' },
                    tags: { type: 'array', items: { type: 'string' } },
                    contractDeadline: { type: 'string', format: 'date-time', description: 'ISO 8601 date' },
                    terms: { $ref: '#/components/schemas/Terms' },
                  },
                },
                examples: {
                  direct: {
                    summary: 'Direct mode (crypto user)',
                    value: {
                      walletAddress: 'YOUR_SOLANA_WALLET_ADDRESS',
                      mode: 'direct',
                      title: 'Freelance Design Project',
                      creatorStakeAmount: 2.0,
                      joinerStakeAmount: 1.0,
                      terms: { title: 'Design Terms', summary: 'Deliver 5 mockups by March 10' },
                    },
                  },
                  custodial: {
                    summary: 'Custodial mode (Stripe)',
                    value: {
                      walletAddress: 'user-42',
                      mode: 'custodial',
                      paymentRail: 'stripe',
                      title: 'Web Dev Project',
                      creatorStakeAmount: 500,
                      joinerStakeAmount: 250,
                      currency: 'USD',
                      terms: { title: 'Dev Terms', summary: 'Deploy site by Friday' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Room created successfully',
              content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, room: { $ref: '#/components/schemas/Room' }, lockbox: { $ref: '#/components/schemas/Lockbox' } } } } },
            },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '500': { description: 'Server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/rooms/{roomId}': {
        get: {
          tags: ['Rooms'],
          summary: 'Get room details',
          description: 'Get complete room details including participants, terms, stakes, and live on-chain state.',
          parameters: [
            { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Room ID' },
          ],
          responses: {
            '200': {
              description: 'Room details with on-chain state',
              content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, room: { $ref: '#/components/schemas/Room' }, onChain: { type: 'object', nullable: true } } } } },
            },
            '404': { description: 'Room not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/rooms/{roomId}/join': {
        post: {
          tags: ['Rooms'],
          summary: 'Join a room',
          description: 'Join a room using its join code. Database-only (no transaction needed).',
          parameters: [
            { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletAddress', 'joinCode'],
                  properties: {
                    walletAddress: { type: 'string' },
                    joinCode: { type: 'string', description: '6-character room code' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Joined successfully', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, room: { $ref: '#/components/schemas/Room' } } } } } },
            '400': { description: 'Invalid join code', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'Room not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/rooms/{roomId}/stake': {
        post: {
          tags: ['Rooms'],
          summary: 'Fund the escrow',
          description: 'Fund the escrow lockbox. Direct mode returns an unsigned tx; custodial mode auto-stakes on-chain.',
          parameters: [
            { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletAddress', 'isCreator'],
                  properties: {
                    walletAddress: { type: 'string' },
                    participantId: { type: 'string', description: 'Defaults to walletAddress' },
                    isCreator: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Stake initiated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, lockbox: { $ref: '#/components/schemas/Lockbox' }, stakeAmount: { type: 'number' } } } } } },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/rooms/{roomId}/approve': {
        post: {
          tags: ['Rooms'],
          summary: 'Approve resolution',
          description: 'Approve resolution. Records in DB + returns mode-specific on-chain action.',
          parameters: [
            { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletAddress'],
                  properties: { walletAddress: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Approval recorded', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, lockbox: { $ref: '#/components/schemas/Lockbox' } } } } } },
            '400': { description: 'Cannot approve', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/rooms/{roomId}/resolve': {
        post: {
          tags: ['Rooms'],
          summary: 'Resolve the escrow',
          description: 'Resolve the escrow. SOL returned on-chain; fiat settlement info for custodial mode.',
          parameters: [
            { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletAddress'],
                  properties: { walletAddress: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Escrow resolved', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, lockbox: { $ref: '#/components/schemas/Lockbox' } } } } } },
            '400': { description: 'Cannot resolve', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/rooms/{roomId}/slash': {
        post: {
          tags: ['Rooms'],
          summary: 'Slash the escrow',
          description: 'Slash the escrow. All staked funds sent to the penalty wallet on-chain.',
          parameters: [
            { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletAddress'],
                  properties: { walletAddress: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Escrow slashed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, lockbox: { $ref: '#/components/schemas/Lockbox' } } } } } },
            '400': { description: 'Cannot slash', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/rooms/{roomId}/cancel': {
        post: {
          tags: ['Rooms'],
          summary: 'Cancel the escrow',
          description: 'Cancel the escrow. Creator cancels before room is fully funded. On-chain refund.',
          parameters: [
            { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletAddress'],
                  properties: { walletAddress: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Escrow cancelled', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, lockbox: { $ref: '#/components/schemas/Lockbox' } } } } } },
            '400': { description: 'Cannot cancel', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/rooms/join': {
        post: {
          tags: ['Rooms'],
          summary: 'Join room by code',
          description: 'Join a room using only the join code (no roomId needed). Database-only.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['walletAddress', 'joinCode'],
                  properties: {
                    walletAddress: { type: 'string' },
                    joinCode: { type: 'string', description: '6-character room code' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Joined successfully', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, room: { $ref: '#/components/schemas/Room' } } } } } },
            '400': { description: 'Invalid join code', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/tx/submit': {
        post: {
          tags: ['Transactions'],
          summary: 'Submit signed transaction',
          description: 'Submit a signed transaction to Solana. Optionally pass roomId + action for automatic DB updates.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['signedTransaction'],
                  properties: {
                    signedTransaction: { type: 'string', description: 'Base64-encoded signed transaction' },
                    roomId: { type: 'string', description: 'Room ID for post-confirmation DB updates' },
                    action: { type: 'string', enum: ['initialize_room', 'stake', 'approve', 'resolve', 'slash', 'cancel'], description: 'Action type for DB update' },
                    walletAddress: { type: 'string', description: 'Submitter wallet for DB records' },
                    metadata: { type: 'object', description: 'Extra data (e.g., { isCreator: true })' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Transaction submitted', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, signature: { type: 'string' }, confirmationStatus: { type: 'string' } } } } } },
            '400': { description: 'Invalid transaction', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '500': { description: 'Submission failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/events': {
        get: {
          tags: ['Events'],
          summary: 'Get event listener status',
          description: 'Get on-chain event listener status.',
          responses: {
            '200': { description: 'Listener status', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, listener: { type: 'object', properties: { running: { type: 'boolean' }, processedCount: { type: 'integer' } } } } } } } },
          },
        },
        post: {
          tags: ['Events'],
          summary: 'Manage event listener',
          description: 'Manage the on-chain event listener. Actions: start, stop, poll.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['action'],
                  properties: {
                    action: { type: 'string', enum: ['start', 'stop', 'poll'] },
                    intervalMs: { type: 'integer', default: 10000 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Action performed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' }, stats: { type: 'object' }, events: { type: 'array', items: { type: 'object' } } } } } } },
          },
        },
      },
      '/webhooks/stripe': {
        post: {
          tags: ['Webhooks'],
          summary: 'Stripe webhook',
          description: 'Stripe webhook endpoint. Auto-stakes SOL on-chain when fiat payment confirmed. Uses Stripe signature verification.',
          responses: {
            '200': { description: 'Webhook acknowledged' },
            '400': { description: 'Invalid signature' },
          },
        },
      },
    },
  };
}

/* ── Swagger UI HTML ─────────────────────────────────────────────────── */

function buildSwaggerHtml(baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blink API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *::before, *::after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info { margin: 30px 0; }
    .swagger-ui .info .title { font-size: 36px; }
    .swagger-ui .scheme-container { background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: '${baseUrl}/api/v1/docs?format=json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
        docExpansion: "list",
        filter: true,
        showExtensions: true,
        tryItOutEnabled: true,
      });
    };
  </script>
</body>
</html>`;
}

/* ── Route Handler ────────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://blink.app';
  const format = request.nextUrl.searchParams.get('format');

  // OpenAPI JSON spec — ?format=json
  if (format === 'json') {
    return Response.json(getOpenApiSpec(baseUrl), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      },
    });
  }

  // Swagger UI HTML
  return new Response(buildSwaggerHtml(baseUrl), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
