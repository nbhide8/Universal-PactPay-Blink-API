/**
 * GET /api/v1/docs — Blink API Documentation
 *
 * Returns a polished HTML documentation page for the Blink Escrow API.
 * Also supports ?format=json for raw JSON output.
 */

import { NextRequest } from 'next/server';

/* ── Helpers ──────────────────────────────────────────────────────────── */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(method: string): string {
  const colors: Record<string, string> = {
    GET: '#22c55e',
    POST: '#3b82f6',
    PUT: '#f59e0b',
    DELETE: '#ef4444',
  };
  const bg = colors[method] || '#6b7280';
  return `<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:700;font-family:monospace;color:#fff;background:${bg}">${method}</span>`;
}

function codeBlock(code: string, lang = 'bash'): string {
  return `<pre style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:16px;overflow-x:auto;font-size:13px;line-height:1.6"><code>${esc(code)}</code></pre>`;
}

function paramRow(name: string, info: any): string {
  const req = info.required ? '<span style="color:#f87171;font-weight:600">required</span>' : '<span style="color:#6b7280">optional</span>';
  const defVal = info.default !== undefined ? `<span style="color:#6b7280"> — default: <code>${esc(String(info.default))}</code></span>` : '';
  const enumVal = info.enum ? `<span style="color:#6b7280"> — enum: ${info.enum.map((e: string) => `<code>${esc(e)}</code>`).join(', ')}</span>` : '';
  const desc = info.description ? ` ${esc(info.description)}` : '';
  const deprecated = info.deprecated ? ' <span style="color:#f59e0b;font-size:11px">(deprecated)</span>' : '';
  return `<tr style="border-bottom:1px solid #1f2937">
    <td style="padding:8px 12px;font-family:monospace;color:#fbbf24;white-space:nowrap">${esc(name)}${deprecated}</td>
    <td style="padding:8px 12px;font-family:monospace;color:#6b7280;font-size:12px">${esc(info.type || 'string')}</td>
    <td style="padding:8px 12px">${req}${defVal}${enumVal}${desc}</td>
  </tr>`;
}

function paramsTable(params: Record<string, any>, label: string): string {
  const rows = Object.entries(params).map(([k, v]) => paramRow(k, typeof v === 'object' && v !== null && !Array.isArray(v) ? v : { type: String(v) })).join('');
  return `<div style="margin-top:12px"><h4 style="font-size:13px;color:#9ca3af;margin-bottom:8px">${label}</h4>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table></div></div>`;
}

/* ── Data ─────────────────────────────────────────────────────────────── */

function getDocs(baseUrl: string) {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  const programId = 'Edmq5WTFJL5gtwMmD9HdtJ5N14ivXMP4vprvPxRkFZRJ';

  const endpoints = [
    {
      method: 'GET', path: '/api/v1/rooms',
      description: 'Browse all public escrow rooms with pagination, search, and filtering.',
      queryParams: {
        page: { type: 'number', default: 1, description: 'Page number' },
        limit: { type: 'number', default: 20, description: 'Results per page (max 100)' },
        status: { type: 'string', enum: ['pending', 'awaiting_approval', 'funding', 'active', 'resolved', 'slashed', 'cancelled'], description: 'Filter by room status' },
        search: { type: 'string', description: 'Search title and description' },
        sortBy: { type: 'string', enum: ['created_at', 'creator_stake_amount'], default: 'created_at' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
      },
      response: '{ success, data: { rooms: Room[], total, page, limit } }',
    },
    {
      method: 'POST', path: '/api/v1/rooms',
      description: 'Create a new escrow room. Choose a mode (direct or custodial) — both create a Solana on-chain PDA.',
      body: {
        walletAddress: { type: 'string', required: true, description: "Creator's wallet address (direct) or any identifier (custodial)" },
        title: { type: 'string', required: true },
        description: { type: 'string' },
        mode: { type: 'string', enum: ['direct', 'custodial'], default: 'direct', description: 'Escrow interaction mode' },
        paymentRail: { type: 'string', enum: ['stripe', 'credits'], description: 'Required when mode is custodial' },
        currency: { type: 'string', description: 'Currency code. SOL for direct, USD for custodial.' },
        creatorStakeAmount: { type: 'number', required: true, description: 'Must be >= joinerStakeAmount' },
        joinerStakeAmount: { type: 'number', required: true },
        isPublic: { type: 'boolean', default: true, description: 'Visible in browse listing' },
        tags: { type: 'string[]' },
        contractDeadline: { type: 'string', description: 'ISO 8601 date' },
        terms: { type: 'object', required: true, description: '{ title, summary, conditions?, additionalNotes? }' },
      },
      response: '{ success, room, lockbox: { mode, blockchain, onChain, action } }',
    },
    {
      method: 'GET', path: '/api/v1/rooms/:roomId',
      description: 'Get complete room details including participants, terms, stakes, and live on-chain state.',
      response: '{ success, room: RoomView, onChain: OnChainRoomData | null }',
    },
    {
      method: 'POST', path: '/api/v1/rooms/:roomId/join',
      description: 'Join a room using its join code. Database-only (no transaction needed).',
      body: { walletAddress: { type: 'string', required: true }, joinCode: { type: 'string', required: true, description: '6-character room code' } },
      response: '{ success, room: Room }',
    },
    {
      method: 'POST', path: '/api/v1/rooms/:roomId/stake',
      description: 'Fund the escrow lockbox. Direct mode returns an unsigned tx; custodial mode auto-stakes on-chain.',
      body: { walletAddress: { type: 'string', required: true }, participantId: { type: 'string', description: 'Defaults to walletAddress' }, isCreator: { type: 'boolean', required: true } },
      response: '{ success, lockbox, stakeAmount }',
    },
    {
      method: 'POST', path: '/api/v1/rooms/:roomId/approve',
      description: 'Approve resolution. Records in DB + returns mode-specific on-chain action.',
      body: { walletAddress: { type: 'string', required: true } },
      response: '{ success, lockbox }',
    },
    {
      method: 'POST', path: '/api/v1/rooms/:roomId/resolve',
      description: 'Resolve the escrow. SOL returned on-chain; fiat settlement info for custodial mode.',
      body: { walletAddress: { type: 'string', required: true } },
      response: '{ success, lockbox }',
    },
    {
      method: 'POST', path: '/api/v1/rooms/:roomId/slash',
      description: 'Slash the escrow. All staked funds sent to the penalty wallet on-chain.',
      body: { walletAddress: { type: 'string', required: true } },
      response: '{ success, lockbox }',
    },
    {
      method: 'POST', path: '/api/v1/rooms/:roomId/cancel',
      description: 'Cancel the escrow. Creator cancels before room is fully funded. On-chain refund.',
      body: { walletAddress: { type: 'string', required: true } },
      response: '{ success, lockbox }',
    },
    {
      method: 'POST', path: '/api/v1/tx/submit',
      description: 'Submit a signed transaction to Solana. Optionally pass roomId + action for automatic DB updates.',
      body: {
        signedTransaction: { type: 'string', required: true, description: 'Base64-encoded signed transaction' },
        roomId: { type: 'string', description: 'Room ID for post-confirmation DB updates' },
        action: { type: 'string', enum: ['initialize_room', 'stake', 'approve', 'resolve', 'slash', 'cancel'], description: 'Action type for DB update' },
        walletAddress: { type: 'string', description: 'Submitter wallet for DB records' },
        metadata: { type: 'object', description: 'Extra data (e.g., { isCreator: true })' },
      },
      response: '{ success, signature, confirmationStatus }',
    },
    {
      method: 'POST', path: '/api/v1/webhooks/stripe',
      description: 'Stripe webhook endpoint. Auto-stakes SOL on-chain when fiat payment confirmed. Uses Stripe signature verification.',
      response: 'Stripe webhook acknowledgement',
    },
    {
      method: 'GET', path: '/api/v1/events',
      description: 'Get on-chain event listener status.',
      response: '{ success, listener: { running, processedCount, ... } }',
    },
    {
      method: 'POST', path: '/api/v1/events',
      description: 'Manage the on-chain event listener. Actions: start, stop, poll.',
      body: { action: { type: 'string', required: true, enum: ['start', 'stop', 'poll'] }, intervalMs: { type: 'number', default: 10000 } },
      response: '{ success, message, stats?, events? }',
    },
  ];

  return { network, programId, endpoints };
}

/* ── HTML Builder ─────────────────────────────────────────────────────── */

function buildHtml(baseUrl: string): string {
  const { network, programId, endpoints } = getDocs(baseUrl);

  const endpointCards = endpoints.map((ep) => {
    let paramsHtml = '';
    if ((ep as any).queryParams) paramsHtml += paramsTable((ep as any).queryParams, 'Query Parameters');
    if ((ep as any).body) paramsHtml += paramsTable((ep as any).body, 'Request Body (JSON)');
    const response = ep.response ? `<div style="margin-top:12px"><h4 style="font-size:13px;color:#9ca3af;margin-bottom:6px">Response</h4><code style="font-size:12px;color:#a78bfa">${esc(ep.response)}</code></div>` : '';
    return `
      <div style="background:#0d1117;border:1px solid #1e293b;border-radius:12px;padding:24px;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          ${badge(ep.method)}
          <code style="font-size:15px;color:#e2e8f0;font-weight:600">${esc(ep.path)}</code>
        </div>
        <p style="color:#94a3b8;font-size:14px;margin:0">${esc(ep.description)}</p>
        ${paramsHtml}
        ${response}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blink API — Documentation</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #030712; color: #e2e8f0; line-height: 1.6;
    }
    a { color: #fbbf24; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace; }
    .container { max-width: 960px; margin: 0 auto; padding: 0 24px; }
    .hero {
      border-bottom: 1px solid #1e293b;
      padding: 48px 0 40px;
      text-align: center;
    }
    .hero h1 { font-size: 42px; font-weight: 800; margin-bottom: 12px; }
    .hero h1 span { color: #fbbf24; }
    .hero p { font-size: 17px; color: #94a3b8; max-width: 640px; margin: 0 auto 20px; }
    .pills { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: 600;
      border: 1px solid #1e293b; background: #111827; color: #94a3b8;
    }
    .pill code { color: #fbbf24; font-size: 12px; }
    section { padding: 48px 0; border-bottom: 1px solid #111827; }
    section:last-child { border-bottom: none; }
    h2 { font-size: 28px; font-weight: 700; margin-bottom: 24px; }
    h2 span { color: #fbbf24; }
    h3 { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #cbd5e1; }
    .card { background: #0d1117; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }
    .step-num {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%; font-size: 13px; font-weight: 700;
      background: #fbbf24; color: #030712; flex-shrink: 0;
    }
    .step-row { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
    .step-content { flex: 1; }
    pre { margin: 12px 0 0; }
    .note { color: #6b7280; font-size: 12px; font-style: italic; margin-top: 8px; }
    nav.toc { position: sticky; top: 0; background: #030712; z-index: 10; border-bottom: 1px solid #1e293b; padding: 12px 0; }
    nav.toc .container { display: flex; gap: 24px; overflow-x: auto; font-size: 13px; font-weight: 600; }
    nav.toc a { color: #94a3b8; white-space: nowrap; }
    nav.toc a:hover { color: #fbbf24; text-decoration: none; }
    .mode-tag {
      display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;
    }
    .mode-direct { background: #065f46; color: #34d399; }
    .mode-custodial { background: #1e3a5f; color: #60a5fa; }
    footer { text-align: center; padding: 32px 0; color: #4b5563; font-size: 13px; border-top: 1px solid #111827; }
  </style>
</head>
<body>

  <!-- Hero -->
  <div class="hero">
    <div class="container">
      <h1><span>Blink</span> API</h1>
      <p>Blockchain-backed escrow for any app. Every lockbox is a real Solana on-chain PDA. Crypto users sign directly. Non-crypto users pay via Stripe or credits. Same escrow. Same guarantees.</p>
      <div class="pills">
        <span class="pill">v2.0.0</span>
        <span class="pill">Network: <code>${esc(network)}</code></span>
        <span class="pill">Program: <code>${esc(programId.slice(0, 8))}...</code></span>
        <span class="pill">Base: <code>${esc(baseUrl)}/api/v1</code></span>
      </div>
    </div>
  </div>

  <!-- TOC -->
  <nav class="toc">
    <div class="container">
      <a href="#architecture">Architecture</a>
      <a href="#modes">Escrow Modes</a>
      <a href="#auth">Authentication</a>
      <a href="#flow">Integration Flow</a>
      <a href="#endpoints">Endpoints</a>
      <a href="#sdk">SDK Examples</a>
      <a href="#curl">curl Workflow</a>
      <a href="#errors">Errors</a>
    </div>
  </nav>

  <div class="container">

    <!-- Architecture -->
    <section id="architecture">
      <h2>🏗️ <span>Architecture</span></h2>
      <p style="color:#94a3b8;margin-bottom:20px">The API exists independently — zero dependency on any frontend. Deploy to Railway, get an API key, build your own escrow-backed app.</p>
      <div class="grid-2" style="grid-template-columns:1fr 1fr 1fr">
        <div class="card">
          <h3>🚀 Blink API</h3>
          <p style="font-size:13px;color:#94a3b8">Standalone REST API on Railway. Returns JSON. Manages escrow lifecycle. Signs custodial Solana transactions.</p>
        </div>
        <div class="card">
          <h3>🖥️ PackedPay Demo</h3>
          <p style="font-size:13px;color:#94a3b8">Next.js demo that consumes the API via <code>NEXT_PUBLIC_API_URL</code>. Deployed separately. Fully independent.</p>
        </div>
        <div class="card">
          <h3>⛓️ Solana Contract</h3>
          <p style="font-size:13px;color:#94a3b8">Anchor program on devnet. Every escrow room = on-chain PDA. Blockchain is always the escrow backend.</p>
        </div>
      </div>
    </section>

    <!-- Escrow Modes -->
    <section id="modes">
      <h2>🔀 <span>Escrow Modes</span></h2>
      <p style="color:#94a3b8;margin-bottom:20px">Solana blockchain is <strong style="color:#fbbf24">always</strong> the escrow mechanism. Every lockbox = an on-chain PDA with real SOL locked. The <em>mode</em> determines <strong>who signs</strong> the Solana transactions.</p>
      <div class="grid-2">
        <div class="card" style="border-color:#065f46">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span class="mode-tag mode-direct">Direct</span><strong>Crypto Users</strong></div>
          <p style="font-size:13px;color:#94a3b8;margin-bottom:8px">User has a Solana wallet. API returns unsigned transactions. User signs with their wallet and submits.</p>
          <code style="font-size:12px;color:#34d399">API builds tx → User signs → /tx/submit → SOL locked</code>
        </div>
        <div class="card" style="border-color:#1e3a5f">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><span class="mode-tag mode-custodial">Custodial</span><strong>Non-Crypto Users</strong></div>
          <p style="font-size:13px;color:#94a3b8;margin-bottom:8px">No wallet needed. Platform wallet signs on their behalf. User pays via Stripe (card) or company credits.</p>
          <code style="font-size:12px;color:#60a5fa">API builds tx → Platform signs → SOL locked → User pays via rail</code>
          <div style="margin-top:12px;display:flex;gap:8px">
            <span class="pill" style="font-size:11px">💳 Stripe</span>
            <span class="pill" style="font-size:11px">🏢 Credits</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Auth -->
    <section id="auth">
      <h2>🔑 <span>Authentication</span></h2>
      <div class="card">
        <p style="color:#94a3b8;font-size:14px;margin-bottom:12px">Include your API key in the <code style="color:#fbbf24">X-API-Key</code> header on all requests. The <code>/api/v1/docs</code> endpoint is public. When <code>BLINK_API_KEY</code> is not set on the server, auth is disabled.</p>
        ${codeBlock('curl -H "X-API-Key: your-key-here" ' + baseUrl + '/api/v1/rooms')}
      </div>
    </section>

    <!-- Flow -->
    <section id="flow">
      <h2>🔄 <span>Integration Flow</span></h2>
      <div class="card">
        <div class="step-row"><span class="step-num">1</span><div class="step-content"><code style="color:#fbbf24">POST /api/v1/rooms</code><p style="font-size:13px;color:#94a3b8;margin-top:4px">Create an escrow room. Specify mode and optionally paymentRail. Every room creates a Solana PDA.</p></div></div>
        <div class="step-row"><span class="step-num">2</span><div class="step-content"><strong style="font-size:14px">Handle the lockbox</strong><p style="font-size:13px;color:#94a3b8;margin-top:4px">Direct: sign the returned tx and POST to /tx/submit. Custodial + Stripe: confirm the PaymentIntent. Custodial + credits: nothing to do.</p></div></div>
        <div class="step-row"><span class="step-num">3</span><div class="step-content"><strong style="font-size:14px">Share join code</strong><p style="font-size:13px;color:#94a3b8;margin-top:4px">The room response includes a <code>join_code</code>. Share it with the other party.</p></div></div>
        <div class="step-row"><span class="step-num">4</span><div class="step-content"><code style="color:#fbbf24">POST /api/v1/rooms/:id/join</code><p style="font-size:13px;color:#94a3b8;margin-top:4px">Other party joins the room with the join code.</p></div></div>
        <div class="step-row"><span class="step-num">5</span><div class="step-content"><code style="color:#fbbf24">POST /api/v1/rooms/:id/stake</code><p style="font-size:13px;color:#94a3b8;margin-top:4px">Both parties fund the escrow. Direct returns a tx; custodial auto-stakes.</p></div></div>
        <div class="step-row"><span class="step-num">6</span><div class="step-content"><code style="color:#fbbf24">POST /api/v1/rooms/:id/approve</code><p style="font-size:13px;color:#94a3b8;margin-top:4px">Both parties approve resolution when terms are met.</p></div></div>
        <div class="step-row"><span class="step-num">7</span><div class="step-content"><code style="color:#fbbf24">POST /api/v1/rooms/:id/resolve</code><p style="font-size:13px;color:#94a3b8;margin-top:4px">Once both approved, resolve to return SOL on-chain.</p></div></div>
      </div>
    </section>

    <!-- Endpoints -->
    <section id="endpoints">
      <h2>📡 <span>Endpoints</span></h2>
      <p style="color:#94a3b8;margin-bottom:20px">${endpoints.length} endpoints — all return JSON with <code>{ success: boolean, ... }</code></p>
      ${endpointCards}
    </section>

    <!-- SDK Examples -->
    <section id="sdk">
      <h2>⚡ <span>SDK Examples</span></h2>

      <div class="card" style="border-color:#065f46">
        <h3><span class="mode-tag mode-direct">Direct</span> Crypto user signs their own tx</h3>
        ${codeBlock(`// 1. Create a room (direct mode)
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
      conditions: [{ type: 'task_completion', title: 'Deliver mockups',
        description: '5 Figma mockups', responsible_party: 'joiner', stake_weight: 100 }]
    }
  })
});
const { room, lockbox } = await res.json();

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
});`, 'javascript')}
      </div>

      <div class="card" style="border-color:#1e3a5f">
        <h3><span class="mode-tag mode-custodial">Custodial</span> Non-crypto user (Stripe)</h3>
        ${codeBlock(`// 1. Create a room (custodial + stripe)
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
// lockbox.onChainSignature exists — Solana escrow already created!

// 2. Confirm the Stripe payment
if (lockbox.action.type === 'confirm_payment') {
  await stripe.confirmPayment({ clientSecret: lockbox.action.payload });
}`, 'javascript')}
      </div>
    </section>

    <!-- curl Workflow -->
    <section id="curl">
      <h2>🖥️ <span>curl Workflow</span></h2>
      <p style="color:#94a3b8;margin-bottom:20px">Complete escrow lifecycle from the command line.</p>

      <div class="step-row"><span class="step-num">1</span><div class="step-content"><h3>Browse open rooms</h3>${codeBlock(`curl -s "${baseUrl}/api/v1/rooms?status=pending&limit=5" | jq '.data.rooms[] | {title, id, creator_stake_amount}'`)}</div></div>

      <div class="step-row"><span class="step-num">2</span><div class="step-content"><h3>Create a new room</h3>${codeBlock(`curl -s -X POST "${baseUrl}/api/v1/rooms" \\
  -H "Content-Type: application/json" \\
  -d '{
    "walletAddress": "YOUR_WALLET_ADDRESS",
    "title": "Build a landing page",
    "creatorStakeAmount": 2.0,
    "joinerStakeAmount": 1.0,
    "terms": {
      "title": "Landing Page Job",
      "summary": "Deliver a responsive landing page by Friday",
      "conditions": [{
        "type": "task_completion",
        "title": "Responsive design",
        "description": "Must work on mobile, tablet, and desktop",
        "responsible_party": "joiner",
        "stake_weight": 100
      }]
    }
  }' | jq`)}<p class="note">Default mode is "direct". Add "mode": "custodial", "paymentRail": "stripe" for fiat users.</p></div></div>

      <div class="step-row"><span class="step-num">3</span><div class="step-content"><h3>Get room details</h3>${codeBlock(`curl -s "${baseUrl}/api/v1/rooms/ROOM_ID" | jq`)}</div></div>

      <div class="step-row"><span class="step-num">4</span><div class="step-content"><h3>Join a room (other party)</h3>${codeBlock(`curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/join" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "WORKER_WALLET", "joinCode": "ABC123"}' | jq`)}</div></div>

      <div class="step-row"><span class="step-num">5</span><div class="step-content"><h3>Fund the escrow (stake)</h3>${codeBlock(`curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/stake" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YOUR_WALLET", "isCreator": true}' | jq`)}<p class="note">Returns an unsigned transaction. Sign with your wallet, then submit via /tx/submit.</p></div></div>

      <div class="step-row"><span class="step-num">6</span><div class="step-content"><h3>Submit signed transaction</h3>${codeBlock(`curl -s -X POST "${baseUrl}/api/v1/tx/submit" \\
  -H "Content-Type: application/json" \\
  -d '{
    "signedTransaction": "BASE64_SIGNED_TX",
    "roomId": "ROOM_ID",
    "action": "stake",
    "walletAddress": "YOUR_WALLET",
    "metadata": {"isCreator": true}
  }' | jq`)}</div></div>

      <div class="step-row"><span class="step-num">7</span><div class="step-content"><h3>Approve resolution (both parties)</h3>${codeBlock(`curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/approve" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YOUR_WALLET"}' | jq`)}</div></div>

      <div class="step-row"><span class="step-num">8</span><div class="step-content"><h3>Resolve (release funds)</h3>${codeBlock(`curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/resolve" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YOUR_WALLET"}' | jq`)}</div></div>

      <div style="margin-top:20px;padding-top:20px;border-top:1px solid #1e293b">
        <h3 style="color:#f87171;margin-bottom:12px">Alternative Actions</h3>
        <div class="grid-2">
          <div><h3 style="font-size:14px">⚠️ Slash</h3>${codeBlock(`curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/slash" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YOUR_WALLET"}' | jq`)}</div>
          <div><h3 style="font-size:14px">🚫 Cancel</h3>${codeBlock(`curl -s -X POST "${baseUrl}/api/v1/rooms/ROOM_ID/cancel" \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "CREATOR_WALLET"}' | jq`)}</div>
        </div>
      </div>
    </section>

    <!-- Errors -->
    <section id="errors">
      <h2>❌ <span>Errors</span></h2>
      <p style="color:#94a3b8;margin-bottom:16px">All endpoints return <code>{ success: false, error: string }</code> on failure.</p>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 16px;font-weight:700;color:#f87171">400</td><td style="padding:10px 16px;color:#94a3b8">Validation failed or bad request</td></tr>
          <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 16px;font-weight:700;color:#f87171">401</td><td style="padding:10px 16px;color:#94a3b8">Invalid or missing API key</td></tr>
          <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 16px;font-weight:700;color:#f87171">404</td><td style="padding:10px 16px;color:#94a3b8">Room not found</td></tr>
          <tr style="border-bottom:1px solid #1e293b"><td style="padding:10px 16px;font-weight:700;color:#f87171">500</td><td style="padding:10px 16px;color:#94a3b8">Internal server error</td></tr>
        </table>
      </div>
    </section>

  </div>

  <footer>
    <div class="container">
      Blink API v2.0.0 · Solana ${esc(network)} · Program: <code style="color:#fbbf24">${esc(programId)}</code><br>
      <a href="?format=json" style="margin-top:8px;display:inline-block">View as JSON →</a>
    </div>
  </footer>

</body>
</html>`;
}

/* ── Route Handler ────────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://blink.app';
  const format = request.nextUrl.searchParams.get('format');

  // JSON escape hatch — append ?format=json
  if (format === 'json') {
    const { endpoints } = getDocs(baseUrl);
    return Response.json(
      {
        name: 'Blink API',
        version: '2.0.0',
        baseUrl: `${baseUrl}/api/v1`,
        network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
        programId: 'Edmq5WTFJL5gtwMmD9HdtJ5N14ivXMP4vprvPxRkFZRJ',
        endpoints,
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      },
    );
  }

  return new Response(buildHtml(baseUrl), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
