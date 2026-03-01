/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Gemini Chat API Route — Blink MCP Tool Bridge
 *
 * Receives a user message + conversation history, runs it through Gemini with
 * 10 function-calling tools that map 1:1 to the Blink escrow API.
 * When Gemini calls a function the server executes the real API call, feeds the
 * result back, and lets Gemini formulate a final answer.
 *
 * POST /api/chat
 * Body: { messages: ChatMessage[], walletAddress?: string }
 * Response: { reply: string, toolCalls: ToolCallRecord[] }
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  FunctionCallingMode,
  type Content,
  type FunctionDeclaration,
  type Tool,
} from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const BLINK_API_URL = (
  process.env.BLINK_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

// ---------------------------------------------------------------------------
// Blink API helper
// ---------------------------------------------------------------------------
async function blinkFetch(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<unknown> {
  const url = `${BLINK_API_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ---------------------------------------------------------------------------
// Tool declarations (mirrors blink-mcp-server/src/index.ts)
// ---------------------------------------------------------------------------
const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'browse_rooms',
    description: 'Browse public escrow rooms. Supports filtering by status, a free-text search string, tags, and pagination.',
    parameters: {
      type: 'object' as any,
      properties: {
        status: {
          type: 'string' as any,
          description: 'Filter by room lifecycle status',
          enum: ['pending','awaiting_approval','approved','funding','active','resolved','slashed','cancelled'],
        },
        search:  { type: 'string' as any, description: 'Free-text search on title/description' },
        tags:    { type: 'string' as any, description: 'Comma-separated tag filter' },
        limit:   { type: 'number' as any, description: 'Max results (default 20)' },
        offset:  { type: 'number' as any, description: 'Pagination offset' },
      },
    },
  },
  {
    name: 'get_room',
    description: 'Fetch full details for a single room including live on-chain state (staked balances, resolution approvals).',
    parameters: {
      type: 'object' as any,
      properties: {
        roomId: { type: 'string' as any, description: 'UUID of the room' },
      },
      required: ['roomId'],
    },
  },
  {
    name: 'create_room',
    description: 'Create a new escrow room backed by a Solana PDA. Returns an unsigned initialize transaction (base64) in lockbox.action.payload that the user must sign then submit via submit_transaction.',
    parameters: {
      type: 'object' as any,
      properties: {
        walletAddress:       { type: 'string' as any, description: "Creator's Solana wallet address" },
        title:               { type: 'string' as any, description: 'Short title for the escrow room' },
        description:         { type: 'string' as any, description: 'Longer description of the job/agreement' },
        rewardAmount:        { type: 'number' as any, description: 'SOL reward the creator pays the worker on success' },
        creatorStakeAmount:  { type: 'number' as any, description: 'SOL the creator stakes as collateral' },
        joinerStakeAmount:   { type: 'number' as any, description: 'SOL the joiner stakes as collateral' },
        mode:                { type: 'string' as any, description: 'Escrow mode — "direct" (default) or "custodial"', enum: ['direct','custodial'] },
        isPublic:            { type: 'boolean' as any, description: 'Whether the room appears in the public browse list' },
        tags:                { type: 'array' as any, items: { type: 'string' as any }, description: 'Tags for discoverability' },
      },
      required: ['walletAddress','title','creatorStakeAmount','joinerStakeAmount'],
    },
  },
  {
    name: 'join_room',
    description: 'Join an existing escrow room using its 6-character join code.',
    parameters: {
      type: 'object' as any,
      properties: {
        walletAddress: { type: 'string' as any, description: "Joiner's Solana wallet address" },
        joinCode:      { type: 'string' as any, description: '6-character join code' },
      },
      required: ['walletAddress','joinCode'],
    },
  },
  {
    name: 'stake',
    description: 'Stake SOL into the escrow lockbox. Returns an unsigned Solana transaction the caller must sign and submit.',
    parameters: {
      type: 'object' as any,
      properties: {
        roomId:        { type: 'string' as any, description: 'UUID of the room' },
        walletAddress: { type: 'string' as any, description: "Staker's Solana wallet address" },
        isCreator:     { type: 'boolean' as any, description: 'true if creator is staking, false if joiner' },
      },
      required: ['roomId','walletAddress','isCreator'],
    },
  },
  {
    name: 'approve_resolve',
    description: 'Signal approval to resolve the contract. Both creator and joiner must approve before resolve can be called.',
    parameters: {
      type: 'object' as any,
      properties: {
        roomId:        { type: 'string' as any, description: 'UUID of the room' },
        walletAddress: { type: 'string' as any, description: "Approver's Solana wallet address" },
      },
      required: ['roomId','walletAddress'],
    },
  },
  {
    name: 'resolve',
    description: 'Resolve the escrow — returns staked SOL to both parties. Requires both to have approved first.',
    parameters: {
      type: 'object' as any,
      properties: {
        roomId:        { type: 'string' as any, description: 'UUID of the room' },
        walletAddress: { type: 'string' as any, description: "Caller's Solana wallet address (must be creator or joiner)" },
      },
      required: ['roomId','walletAddress'],
    },
  },
  {
    name: 'slash',
    description: 'Slash the escrow — sends ALL staked SOL to the penalty wallet. Both parties lose their stakes. Callable by either party.',
    parameters: {
      type: 'object' as any,
      properties: {
        roomId:        { type: 'string' as any, description: 'UUID of the room' },
        walletAddress: { type: 'string' as any, description: "Slasher's Solana wallet address" },
      },
      required: ['roomId','walletAddress'],
    },
  },
  {
    name: 'cancel_room',
    description: 'Cancel the escrow room before it is fully funded. Creator only. Returns any already-staked SOL.',
    parameters: {
      type: 'object' as any,
      properties: {
        roomId:        { type: 'string' as any, description: 'UUID of the room' },
        walletAddress: { type: 'string' as any, description: "Creator's Solana wallet address" },
      },
      required: ['roomId','walletAddress'],
    },
  },
  {
    name: 'get_events',
    description: 'Query on-chain and off-chain events (staked, resolved, slashed, etc.) for a room or across all rooms.',
    parameters: {
      type: 'object' as any,
      properties: {
        roomId: { type: 'string' as any, description: 'Optional room ID to filter events' },
        limit:  { type: 'number' as any, description: 'Max number of events to return (default 20)' },
      },
    },
  },
];

const TOOLS: Tool[] = [{ functionDeclarations: toolDeclarations }];

// ---------------------------------------------------------------------------
// Function executor — maps Gemini function call → real Blink API call
// ---------------------------------------------------------------------------
async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'browse_rooms': {
      const sp = new URLSearchParams();
      if (args.status) sp.set('status', String(args.status));
      if (args.search) sp.set('search', String(args.search));
      if (args.tags)   sp.set('tags',   String(args.tags));
      if (args.limit)  sp.set('limit',  String(args.limit));
      if (args.offset) sp.set('offset', String(args.offset));
      return blinkFetch(`/rooms?${sp.toString()}`);
    }
    case 'get_room':
      return blinkFetch(`/rooms/${args.roomId}`);
    case 'create_room':
      return blinkFetch('/rooms', 'POST', args);
    case 'join_room':
      return blinkFetch('/rooms/join', 'POST', args);
    case 'stake':
      return blinkFetch(`/rooms/${args.roomId}/stake`, 'POST', {
        walletAddress: args.walletAddress,
        isCreator: args.isCreator,
      });
    case 'approve_resolve':
      return blinkFetch(`/rooms/${args.roomId}/approve`, 'POST', {
        walletAddress: args.walletAddress,
      });
    case 'resolve':
      return blinkFetch(`/rooms/${args.roomId}/resolve`, 'POST', {
        walletAddress: args.walletAddress,
      });
    case 'slash':
      return blinkFetch(`/rooms/${args.roomId}/slash`, 'POST', {
        walletAddress: args.walletAddress,
      });
    case 'cancel_room':
      return blinkFetch(`/rooms/${args.roomId}/cancel`, 'POST', {
        walletAddress: args.walletAddress,
      });
    case 'get_events': {
      const sp2 = new URLSearchParams();
      if (args.roomId) sp2.set('roomId', String(args.roomId));
      if (args.limit)  sp2.set('limit',  String(args.limit));
      return blinkFetch(`/events?${sp2.toString()}`);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the StakeGuard AI — an assistant for the PactPay escrow platform built on Solana.

You help users manage trustless escrow contracts ("rooms") where two parties stake SOL to ensure honest behavior. 
You have access to 10 tools that map directly to the Blink API:

• browse_rooms      — find public escrow rooms
• get_room          — inspect a room's full state (on-chain + off-chain)
• create_room       — create a new escrow room (returns unsigned Solana tx)
• join_room         — join a room with a 6-char code
• stake             — stake SOL into the escrow (returns unsigned Solana tx)
• approve_resolve   — approve resolution (both parties must call this)
• resolve           — finalize happy-path (returns stakes to both parties)
• slash             — burn all stakes to penalty wallet (nuclear option)
• cancel_room       — cancel before fully funded (creator only)
• get_events        — query escrow events log

Important escrow mechanics:
- Three-way escrow: reward (creator→worker on success) + creator stake (collateral) + joiner stake (collateral)
- Slash burns BOTH stakes — this is the deterrence mechanism
- Resolve requires BOTH parties to approve first
- Direct mode transactions must be signed by the user's wallet before submitting

When returning transaction payloads, explain what the user must do (sign and submit via wallet).
Be concise and factual. If unsure about a room ID or wallet address, ask the user.`;

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured. Add it to your .env.local file.' },
      { status: 500 }
    );
  }

  const { messages, walletAddress } = await req.json() as {
    messages: ChatMessage[];
    walletAddress?: string;
  };

  if (!messages?.length) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    tools: TOOLS,
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
    systemInstruction: walletAddress
      ? `${SYSTEM_PROMPT}\n\nThe connected wallet address is: ${walletAddress}`
      : SYSTEM_PROMPT,
  });

  // Convert our ChatMessage[] to Gemini Content[] (history = all but last message)
  const history: Content[] = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = messages[messages.length - 1].content;
  const chat = model.startChat({ history });

  const toolCalls: ToolCallRecord[] = [];

  try {
    let result = await chat.sendMessage(lastMessage);

    // Agentic loop — keep handling function calls until model produces text
    for (let i = 0; i < 8; i++) {
      const response = result.response;
      const fns = response.functionCalls();

      if (!fns || fns.length === 0) break;

      // Execute all function calls in parallel
      const fnResults = await Promise.all(
        fns.map(async (fn) => {
          const fnResult = await executeTool(fn.name, fn.args as Record<string, unknown>);
          toolCalls.push({ toolName: fn.name, args: fn.args as Record<string, unknown>, result: fnResult });
          return {
            functionResponse: {
              name: fn.name,
              response: { result: fnResult },
            },
          };
        })
      );

      result = await chat.sendMessage(fnResults);
    }

    const reply = result.response.text();
    return NextResponse.json({ reply, toolCalls });

  } catch (err: any) {
    console.error('[chat route]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
