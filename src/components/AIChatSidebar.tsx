'use client';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AIChatSidebar
 *
 * Fixed right-side collapsible panel with two tabs:
 *   Chat  — conversation with the StakeGuard AI (Gemini + tool calling)
 *   Tools — reference list of every callable MCP tool with description
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

// Local type definitions (kept in sync with app/api/chat/route.ts)
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool reference data (mirrors route.ts function declarations)
// ─────────────────────────────────────────────────────────────────────────────
const TOOLS_REF = [
  {
    name: 'browse_rooms',
    color: 'bg-blue-900 border-blue-700',
    badge: 'GET',
    description:
      'Browse public escrow rooms. Filter by status, search text, or tags. Supports pagination.',
    params: ['status?', 'search?', 'tags?', 'limit?', 'offset?'],
  },
  {
    name: 'get_room',
    color: 'bg-blue-900 border-blue-700',
    badge: 'GET',
    description: 'Fetch full details for a single room including live on-chain state.',
    params: ['roomId'],
  },
  {
    name: 'create_room',
    color: 'bg-green-900 border-green-700',
    badge: 'POST',
    description:
      'Create a new escrow room. Returns an unsigned Solana transaction you must sign & submit.',
    params: ['walletAddress', 'title', 'creatorStakeAmount', 'joinerStakeAmount', 'rewardAmount?', 'mode?', 'isPublic?', 'tags?'],
  },
  {
    name: 'join_room',
    color: 'bg-green-900 border-green-700',
    badge: 'POST',
    description: 'Join an escrow room using its 6-character join code.',
    params: ['walletAddress', 'joinCode'],
  },
  {
    name: 'stake',
    color: 'bg-yellow-900 border-yellow-700',
    badge: 'POST',
    description:
      'Stake SOL into the lockbox. Returns an unsigned Solana transaction to sign & submit.',
    params: ['roomId', 'walletAddress', 'isCreator'],
  },
  {
    name: 'approve_resolve',
    color: 'bg-purple-900 border-purple-700',
    badge: 'POST',
    description:
      'Signal approval to resolve. Both creator and joiner must call this before resolve.',
    params: ['roomId', 'walletAddress'],
  },
  {
    name: 'resolve',
    color: 'bg-purple-900 border-purple-700',
    badge: 'POST',
    description: 'Finalize the escrow and return stakes to both parties. Requires dual approval.',
    params: ['roomId', 'walletAddress'],
  },
  {
    name: 'slash',
    color: 'bg-red-900 border-red-700',
    badge: 'POST',
    description:
      'Burn ALL staked SOL to the penalty wallet. Nuclear option — both parties lose everything.',
    params: ['roomId', 'walletAddress'],
  },
  {
    name: 'cancel_room',
    color: 'bg-orange-900 border-orange-700',
    badge: 'POST',
    description: 'Cancel the room before it is fully funded. Creator only. Refunds any staked SOL.',
    params: ['roomId', 'walletAddress'],
  },
  {
    name: 'get_events',
    color: 'bg-gray-800 border-gray-600',
    badge: 'GET',
    description: 'Query on-chain and off-chain events (staked, resolved, slashed…) for any room.',
    params: ['roomId?', 'limit?'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────
interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  toolCalls?: ToolCallRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function AIChatSidebar() {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58();

  const [isOpen, setIsOpen]   = useState(false);
  const [tab, setTab]         = useState<'chat' | 'tools'>('chat');
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hey! I\'m the StakeGuard AI. I can browse rooms, create escrow contracts, check stakes, and more.\n\nTry asking:\n• "Show me all active rooms"\n• "What is room [id]?"\n• "Create a room for 2 SOL"',
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Build history for API (exclude welcome and error messages)
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    history.push({ role: 'user', content: text });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, walletAddress }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setMessages(prev => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'error',
            content: data.error ?? 'Unknown error from Gemini API.',
          },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: data.reply,
            toolCalls: data.toolCalls?.length ? data.toolCalls : undefined,
          },
        ]);
      }
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'error', content: e.message ?? 'Network error' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, walletAddress]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* ── Toggle button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center justify-center gap-1
                   bg-indigo-700 hover:bg-indigo-600 active:bg-indigo-800 text-white
                   w-8 rounded-l-lg py-5 shadow-2xl transition-colors duration-150"
        title={isOpen ? 'Close AI sidebar' : 'Open AI chat'}
        aria-label="Toggle AI sidebar"
      >
        <span className="text-xs font-bold [writing-mode:vertical-lr] rotate-180 tracking-widest select-none">
          {isOpen ? '✕' : 'AI'}
        </span>
      </button>

      {/* ── Sidebar panel ─────────────────────────────────────────────── */}
      <aside
        className={`
          fixed right-0 top-0 h-full z-40 flex flex-col
          bg-gray-900 border-l border-gray-700 shadow-2xl
          transition-all duration-300 ease-in-out
          ${isOpen ? 'w-[380px]' : 'w-0 overflow-hidden'}
        `}
        aria-label="AI Chat Sidebar"
      >
        {isOpen && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <span className="font-semibold text-white text-sm">StakeGuard AI</span>
                {walletAddress && (
                  <span className="text-xs text-gray-400 truncate max-w-[100px]">
                    {walletAddress.slice(0, 4)}…{walletAddress.slice(-4)}
                  </span>
                )}
              </div>
              {/* Tabs */}
              <div className="flex gap-1">
                {(['chat', 'tools'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      tab === t
                        ? 'bg-indigo-700 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {t === 'chat' ? '💬 Chat' : '🔧 Tools'}
                  </button>
                ))}
              </div>
            </header>

            {/* ── TOOLS TAB ─────────────────────────────────────────── */}
            {tab === 'tools' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <p className="text-xs text-gray-400 mb-3">
                  These are the tools the AI can call on your behalf. All write operations return
                  unsigned Solana transactions that your wallet must sign.
                </p>
                {TOOLS_REF.map(tool => (
                  <div
                    key={tool.name}
                    className={`rounded-lg border p-3 ${tool.color}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-white">{tool.name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/30 text-gray-200">
                        {tool.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed mb-2">{tool.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {tool.params.map(p => (
                        <code
                          key={p}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            p.endsWith('?')
                              ? 'bg-gray-700 text-gray-300'
                              : 'bg-black/40 text-indigo-300'
                          }`}
                        >
                          {p}
                        </code>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── CHAT TAB ──────────────────────────────────────────── */}
            {tab === 'chat' && (
              <>
                {/* Message list */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                  {messages.map(msg => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}
                  {loading && <TypingIndicator />}
                  <div ref={bottomRef} />
                </div>

                {/* Input area */}
                <div className="shrink-0 border-t border-gray-700 p-3">
                  {!walletAddress && (
                    <p className="text-xs text-amber-400 mb-2">
                      ⚠ Connect your wallet so the AI knows your address for transactions.
                    </p>
                  )}
                  <div className="flex gap-2 items-end">
                    <textarea
                      ref={inputRef}
                      rows={2}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask the AI… (Enter to send, Shift+Enter for newline)"
                      disabled={loading}
                      className="
                        flex-1 resize-none rounded-lg bg-gray-800 border border-gray-600
                        text-sm text-white placeholder-gray-500
                        px-3 py-2 focus:outline-none focus:border-indigo-500
                        disabled:opacity-50
                      "
                    />
                    <button
                      onClick={sendMessage}
                      disabled={loading || !input.trim()}
                      className="
                        px-3 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600
                        text-white font-medium text-sm
                        disabled:opacity-40 disabled:cursor-not-allowed
                        transition-colors
                      "
                    >
                      {loading ? '…' : '↵'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const bubbleClass =
    msg.role === 'user'
      ? 'bg-indigo-800 text-white ml-6 rounded-br-sm'
      : msg.role === 'error'
      ? 'bg-red-900/70 text-red-200 border border-red-700'
      : 'bg-gray-800 text-gray-100 mr-6 rounded-bl-sm';

  return (
    <div className={`rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${bubbleClass}`}>
      {msg.role === 'assistant' && <span className="text-xs text-indigo-400 font-medium block mb-1">StakeGuard AI</span>}
      {msg.role === 'error'     && <span className="text-xs text-red-400 font-medium block mb-1">⚠ Error</span>}
      {msg.content}

      {/* Tool call records */}
      {msg.toolCalls?.map((tc, i) => (
        <div key={i} className="mt-2">
          <button
            onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
          >
            <span>🔧 Called <code className="bg-black/30 px-1 rounded">{tc.toolName}</code></span>
            <span className="ml-1">{expanded[i] ? '▲' : '▼'}</span>
          </button>
          {expanded[i] && (
            <div className="mt-1 rounded bg-black/40 p-2 text-xs font-mono overflow-x-auto text-gray-300 space-y-1">
              <div>
                <span className="text-gray-500">args: </span>
                <pre className="inline whitespace-pre-wrap">{JSON.stringify(tc.args, null, 2)}</pre>
              </div>
              <div>
                <span className="text-gray-500">result: </span>
                <pre className="inline whitespace-pre-wrap">{JSON.stringify(tc.result, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="bg-gray-800 text-gray-100 mr-6 rounded-xl rounded-bl-sm px-3 py-2">
      <span className="text-xs text-indigo-400 font-medium block mb-1">StakeGuard AI</span>
      <span className="inline-flex gap-1 items-center">
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
          />
        ))}
      </span>
    </div>
  );
}
