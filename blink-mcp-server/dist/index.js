#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// ---------------------------------------------------------------------------
// Config — set via environment variables
// ---------------------------------------------------------------------------
const BLINK_API_URL = process.env.BLINK_API_URL ?? "http://localhost:3001/api/v1";
const BLINK_API_KEY = process.env.BLINK_API_KEY ?? "";
// ---------------------------------------------------------------------------
// Shared fetch helper
// ---------------------------------------------------------------------------
async function blinkFetch(path, options = {}) {
    const url = `${BLINK_API_URL}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(BLINK_API_KEY ? { "X-API-Key": BLINK_API_KEY } : {}),
            ...(options.headers ?? {}),
        },
    });
    const text = await res.text();
    try {
        return JSON.parse(text);
    }
    catch {
        return { raw: text, status: res.status };
    }
}
function toText(data) {
    return JSON.stringify(data, null, 2);
}
// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
    name: "blink-api",
    version: "1.0.0",
});
// ── 1. Browse public rooms ──────────────────────────────────────────────────
server.tool("browse_rooms", "Browse public escrow rooms. Supports filtering by status, a search string, tags, and pagination.", {
    status: z
        .enum([
        "pending",
        "awaiting_approval",
        "approved",
        "funding",
        "active",
        "resolved",
        "slashed",
        "cancelled",
    ])
        .optional()
        .describe("Filter by room lifecycle status"),
    search: z.string().optional().describe("Free-text search on title/description"),
    tags: z.string().optional().describe("Comma-separated tag filter"),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    offset: z.number().int().min(0).optional().describe("Pagination offset"),
}, async ({ status, search, tags, limit, offset }) => {
    const params = new URLSearchParams();
    if (status)
        params.set("status", status);
    if (search)
        params.set("search", search);
    if (tags)
        params.set("tags", tags);
    if (limit !== undefined)
        params.set("limit", String(limit));
    if (offset !== undefined)
        params.set("offset", String(offset));
    const data = await blinkFetch(`/rooms?${params.toString()}`);
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 2. Create an escrow room ────────────────────────────────────────────────
server.tool("create_room", `Create a new escrow room backed by a Solana on-chain PDA.

Two modes are supported:
• direct  — returns an unsigned Solana transaction (base64) in lockbox.action.payload that the user must sign and then submit via submit_transaction.
• custodial — the platform wallet signs automatically; lockbox.action may be a Stripe payment confirmation instead.

Always save the returned room.id and room.join_code for subsequent calls.`, {
    walletAddress: z
        .string()
        .describe("Creator's Solana wallet address (or user ID for custodial)"),
    title: z.string().describe("Short title for the escrow room"),
    description: z.string().optional().describe("Longer description"),
    creatorStakeAmount: z
        .number()
        .positive()
        .describe("SOL amount the creator will stake"),
    joinerStakeAmount: z
        .number()
        .positive()
        .describe("SOL amount the joiner will stake"),
    mode: z
        .enum(["direct", "custodial"])
        .optional()
        .describe("Escrow mode — defaults to direct"),
    paymentRail: z
        .enum(["stripe"])
        .optional()
        .describe("Payment rail for custodial mode"),
    currency: z
        .string()
        .optional()
        .describe("Currency code for custodial+stripe (e.g. USD)"),
    isPublic: z
        .boolean()
        .optional()
        .describe("Whether the room appears in public browse list"),
    tags: z
        .array(z.string())
        .optional()
        .describe("Tags for discoverability"),
    contractDeadline: z
        .string()
        .optional()
        .describe("ISO-8601 deadline for contract completion"),
    terms: z.object({
        title: z.string(),
        summary: z.string(),
        additionalNotes: z.string().optional(),
        conditions: z
            .array(z.object({
            type: z.enum([
                "task_completion",
                "payment",
                "delivery",
                "milestone",
                "time_based",
                "custom",
            ]),
            title: z.string(),
            description: z.string(),
            responsible_party: z.enum(["creator", "joiner"]),
            stake_weight: z
                .number()
                .describe("Percentage weight (0-100); all conditions must sum to 100"),
            deadline: z.string().optional(),
        }))
            .optional(),
    }),
}, async (body) => {
    const data = await blinkFetch("/rooms", {
        method: "POST",
        body: JSON.stringify(body),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 3. Get room details ─────────────────────────────────────────────────────
server.tool("get_room", "Fetch full details for a single room including live on-chain PDA state (staked balances, resolution approvals, etc.).", {
    roomId: z.string().describe("UUID of the room"),
}, async ({ roomId }) => {
    const data = await blinkFetch(`/rooms/${roomId}`);
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 4. Join a room ──────────────────────────────────────────────────────────
server.tool("join_room", "Join an existing escrow room using its join code. Returns a lockbox action the joiner may need to sign (direct mode) or a Stripe confirmation (custodial).", {
    walletAddress: z
        .string()
        .describe("Joiner's Solana wallet address (or user ID for custodial)"),
    joinCode: z.string().describe("6-character join code displayed on the room"),
    roomId: z
        .string()
        .optional()
        .describe("Room UUID — if omitted the API looks it up from joinCode"),
}, async ({ walletAddress, joinCode, roomId }) => {
    const path = roomId
        ? `/rooms/${roomId}/join`
        : "/rooms/join";
    const data = await blinkFetch(path, {
        method: "POST",
        body: JSON.stringify({ walletAddress, joinCode }),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 5. Stake (fund the escrow) ──────────────────────────────────────────────
server.tool("stake_room", `Fund the creator or joiner side of the escrow.

Direct mode: returns an unsigned Solana transaction in lockbox.action.payload. Sign it with the user's wallet, then call submit_transaction.
Custodial mode: the platform wallet stakes automatically; returns confirmation.`, {
    roomId: z.string().describe("UUID of the room"),
    walletAddress: z.string().describe("Wallet address of the staker"),
    isCreator: z
        .boolean()
        .describe("true if the staker is the room creator, false for the joiner"),
}, async ({ roomId, walletAddress, isCreator }) => {
    const data = await blinkFetch(`/rooms/${roomId}/stake`, {
        method: "POST",
        body: JSON.stringify({ walletAddress, isCreator }),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 6. Submit a signed transaction ──────────────────────────────────────────
server.tool("submit_transaction", `Submit a base64-encoded signed Solana transaction to the network. Use this after the user signs a transaction returned by create_room or stake_room.

Providing roomId, action, walletAddress, and metadata is recommended — the API uses them to auto-update the database after on-chain confirmation.`, {
    signedTransaction: z
        .string()
        .describe("Base64-encoded signed Solana transaction"),
    roomId: z
        .string()
        .optional()
        .describe("Associated room UUID (recommended)"),
    action: z
        .enum(["stake", "resolve", "slash", "cancel", "init"])
        .optional()
        .describe("Which action this transaction performs (recommended)"),
    walletAddress: z.string().optional().describe("Signer's wallet address (recommended)"),
    metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Arbitrary extra metadata forwarded to the API (e.g. { isCreator: true })"),
}, async ({ signedTransaction, roomId, action, walletAddress, metadata }) => {
    const body = { signedTransaction };
    if (roomId)
        body.roomId = roomId;
    if (action)
        body.action = action;
    if (walletAddress)
        body.walletAddress = walletAddress;
    if (metadata)
        body.metadata = metadata;
    const data = await blinkFetch("/tx/submit", {
        method: "POST",
        body: JSON.stringify(body),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 7. Approve resolution ───────────────────────────────────────────────────
server.tool("approve_room", "Signal that a participant approves resolving the escrow. Both creator and joiner must call this before resolve_room can release funds.", {
    roomId: z.string().describe("UUID of the room"),
    walletAddress: z.string().describe("Wallet address of the approving party"),
}, async ({ roomId, walletAddress }) => {
    const data = await blinkFetch(`/rooms/${roomId}/approve`, {
        method: "POST",
        body: JSON.stringify({ walletAddress }),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 8. Resolve escrow ───────────────────────────────────────────────────────
server.tool("resolve_room", "Resolve the escrow — releases staked SOL back to both participants on-chain. Requires both parties to have called approve_room first.", {
    roomId: z.string().describe("UUID of the room"),
    walletAddress: z.string().describe("Wallet address of the caller"),
}, async ({ roomId, walletAddress }) => {
    const data = await blinkFetch(`/rooms/${roomId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ walletAddress }),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 9. Slash escrow ─────────────────────────────────────────────────────────
server.tool("slash_room", "Slash the escrow — sends all staked SOL to the platform penalty wallet instead of returning it. Use when a party has violated the contract terms.", {
    roomId: z.string().describe("UUID of the room"),
    walletAddress: z.string().describe("Wallet address of the caller"),
}, async ({ roomId, walletAddress }) => {
    const data = await blinkFetch(`/rooms/${roomId}/slash`, {
        method: "POST",
        body: JSON.stringify({ walletAddress }),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 10. Cancel room ─────────────────────────────────────────────────────────
server.tool("cancel_room", "Cancel a room before it is fully funded. Only the room creator can cancel, and only while the room is still in pending/funding status.", {
    roomId: z.string().describe("UUID of the room"),
    walletAddress: z
        .string()
        .describe("Creator's wallet address (only the creator may cancel)"),
}, async ({ roomId, walletAddress }) => {
    const data = await blinkFetch(`/rooms/${roomId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ walletAddress }),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ── 11. Manage on-chain event listener ──────────────────────────────────────
server.tool("manage_events", `Control the Solana on-chain event listener that watches the Anchor program for escrow events and triggers automatic actions (e.g. Stripe captures after successful stakes).

Actions:
• start  — begin polling (set intervalMs, e.g. 10000)
• stop   — stop the listener
• poll   — run one immediate poll
• status — (GET) return current listener status`, {
    action: z
        .enum(["start", "stop", "poll", "status"])
        .describe("Listener command to execute"),
    intervalMs: z
        .number()
        .int()
        .min(1000)
        .optional()
        .describe("Polling interval in milliseconds (only used with start)"),
}, async ({ action, intervalMs }) => {
    if (action === "status") {
        const data = await blinkFetch("/events");
        return { content: [{ type: "text", text: toText(data) }] };
    }
    const body = { action };
    if (action === "start" && intervalMs !== undefined) {
        body.intervalMs = intervalMs;
    }
    const data = await blinkFetch("/events", {
        method: "POST",
        body: JSON.stringify(body),
    });
    return { content: [{ type: "text", text: toText(data) }] };
});
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
