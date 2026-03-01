/**
 * ─────────────────────────────────────────────────────────────────────────────
 * On-Chain Event Listener — Watches Solana for Escrow State Changes
 *
 * This is the BRIDGE between blockchain consensus and fiat actions.
 *
 * The listener watches the Blink program for events:
 *   - RoomResolved  → trigger Stripe capture + transfer
 *   - RoomSlashed   → trigger Stripe capture as penalty
 *   - RoomCancelled → trigger Stripe refund
 *
 * The listener ensures the backend CANNOT arbitrarily move money.
 * Only verified on-chain events trigger Stripe actions.
 *
 * MODES:
 *   - Polling (default): periodically fetches recent program transactions
 *     and parses events from transaction logs. Simple, reliable, works
 *     on all RPC providers.
 *
 *   - WebSocket (future): subscribes to program logs via ws://. Lower
 *     latency but requires a WebSocket-capable RPC.
 *
 * The listener is idempotent — processing the same event twice has no effect
 * because the dispatcher checks deposit status before executing Stripe actions.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { getConnection, PROGRAM_ID } from '@/lib/solana/transactions';
import { IDL } from '@/lib/solana/idl';

// ─── Event Types ─────────────────────────────────────────────────────────────

export interface ChainEvent {
  name: string;
  data: Record<string, any>;
  signature: string;
  slot: number;
  timestamp: number | null;
}

export type EventHandler = (event: ChainEvent) => Promise<void>;

// ─── Parsed Event Types ──────────────────────────────────────────────────────

export interface RoomResolvedEvent {
  roomId: string;
  creatorReturned: bigint;
  joinerReturned: bigint;
}

export interface RoomSlashedEvent {
  roomId: string;
  slashedBy: string;
  creatorLost: bigint;
  joinerLost: bigint;
  totalPenalty: bigint;
}

export interface RoomCancelledEvent {
  roomId: string;
  cancelledBy: string;
}

export interface StakedEvent {
  roomId: string;
  participantId: string;
  staker: string;
  amount: bigint;
  isCreator: boolean;
  totalStaked: bigint;
  isFullyFunded: boolean;
}

// ─── Event Cache (prevent reprocessing) ──────────────────────────────────────

const processedSignatures = new Set<string>();
const MAX_CACHE_SIZE = 10_000;

function markProcessed(signature: string): boolean {
  if (processedSignatures.has(signature)) return false;
  if (processedSignatures.size >= MAX_CACHE_SIZE) {
    // LRU-ish: clear oldest half
    const entries = Array.from(processedSignatures);
    entries.slice(0, entries.length / 2).forEach(s => processedSignatures.delete(s));
  }
  processedSignatures.add(signature);
  return true;
}

// ─── Event Parser ────────────────────────────────────────────────────────────

let _parser: EventParser | null = null;

function getEventParser(): EventParser {
  if (_parser) return _parser;
  const coder = new BorshCoder(IDL as any);
  _parser = new EventParser(PROGRAM_ID, coder);
  return _parser;
}

/**
 * Parse events from a confirmed transaction's logs.
 * Returns an array of decoded events from the Blink program.
 */
export function parseEventsFromLogs(
  logs: string[],
  signature: string,
  slot: number,
  blockTime: number | null
): ChainEvent[] {
  const events: ChainEvent[] = [];

  try {
    const parser = getEventParser();
    const parsed = Array.from(parser.parseLogs(logs));

    for (const event of parsed) {
      events.push({
        name: event.name,
        data: event.data as Record<string, any>,
        signature,
        slot,
        timestamp: blockTime,
      });
    }
  } catch {
    // If Borsh decoding fails, try manual log parsing as fallback
    for (const log of logs) {
      if (log.includes('RoomResolved')) {
        events.push({ name: 'RoomResolved', data: {}, signature, slot, timestamp: blockTime });
      } else if (log.includes('RoomSlashed')) {
        events.push({ name: 'RoomSlashed', data: {}, signature, slot, timestamp: blockTime });
      } else if (log.includes('RoomCancelled')) {
        events.push({ name: 'RoomCancelled', data: {}, signature, slot, timestamp: blockTime });
      }
    }
  }

  return events;
}

// ─── Polling Listener ────────────────────────────────────────────────────────

let _lastSignature: string | undefined;
let _pollInterval: ReturnType<typeof setInterval> | null = null;
let _handlers: EventHandler[] = [];

/**
 * Fetch recent transactions for the Blink program and parse events.
 * This is called on each poll interval.
 */
export async function pollForEvents(): Promise<ChainEvent[]> {
  const connection = getConnection();
  const allEvents: ChainEvent[] = [];

  try {
    // Get recent confirmed transaction signatures for our program
    const signatures = await connection.getSignaturesForAddress(
      PROGRAM_ID,
      { limit: 25, until: _lastSignature },
      'confirmed'
    );

    if (signatures.length === 0) return [];

    // Update cursor for next poll
    _lastSignature = signatures[0].signature;

    // Fetch full transactions (in parallel, batches of 5)
    for (let i = 0; i < signatures.length; i += 5) {
      const batch = signatures.slice(i, i + 5);
      const txPromises = batch.map(sig =>
        connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })
      );

      const txs = await Promise.all(txPromises);

      for (let j = 0; j < txs.length; j++) {
        const tx = txs[j];
        const sigInfo = batch[j];

        if (!tx?.meta?.logMessages) continue;
        if (!markProcessed(sigInfo.signature)) continue;

        const events = parseEventsFromLogs(
          tx.meta.logMessages,
          sigInfo.signature,
          tx.slot,
          tx.blockTime ?? null
        );

        allEvents.push(...events);
      }
    }

    // Dispatch events to registered handlers
    for (const event of allEvents) {
      for (const handler of _handlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error(`[EventListener] Handler error for ${event.name}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[EventListener] Polling error:', err);
  }

  return allEvents;
}

/**
 * Register an event handler. Called for every new on-chain event.
 */
export function onEvent(handler: EventHandler): () => void {
  _handlers.push(handler);
  return () => {
    _handlers = _handlers.filter(h => h !== handler);
  };
}

/**
 * Start the polling event listener.
 * Polls the Solana RPC every `intervalMs` milliseconds for new program events.
 *
 * @param intervalMs - Poll interval in milliseconds (default: 10 seconds)
 * @returns A stop function
 */
export function startEventListener(intervalMs = 10_000): () => void {
  if (_pollInterval) {
    console.warn('[EventListener] Already running');
    return () => stopEventListener();
  }

  console.log(`[EventListener] Starting — polling every ${intervalMs}ms`);
  console.log(`[EventListener] Watching program: ${PROGRAM_ID.toBase58()}`);

  // Initial poll
  pollForEvents().catch(console.error);

  // Recurring polls
  _pollInterval = setInterval(() => {
    pollForEvents().catch(console.error);
  }, intervalMs);

  return () => stopEventListener();
}

/**
 * Stop the polling event listener.
 */
export function stopEventListener(): void {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
    console.log('[EventListener] Stopped');
  }
}

/**
 * Check if the event listener is currently running.
 */
export function isListenerRunning(): boolean {
  return _pollInterval !== null;
}

/**
 * Get listener stats.
 */
export function getListenerStats(): {
  running: boolean;
  processedCount: number;
  lastSignature: string | undefined;
  handlerCount: number;
} {
  return {
    running: isListenerRunning(),
    processedCount: processedSignatures.size,
    lastSignature: _lastSignature,
    handlerCount: _handlers.length,
  };
}
