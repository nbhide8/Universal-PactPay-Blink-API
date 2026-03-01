/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GET/POST /api/v1/events — Event Listener Management
 *
 * GET  → Listener status + recent events
 * POST → Start/stop the listener, or manually trigger a poll
 *
 * The event listener watches the Solana blockchain for StakeGuard
 * program events and dispatches them to the Stripe action handler.
 *
 * In production, the listener starts automatically on boot.
 * This endpoint provides manual control and visibility.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  startEventListener,
  stopEventListener,
  isListenerRunning,
  getListenerStats,
  pollForEvents,
} from '@/lib/events/listener';
import { registerStripeDispatcher } from '@/lib/events/dispatcher';

let _dispatcherRegistered = false;

export async function GET() {
  const stats = getListenerStats();

  return NextResponse.json({
    success: true,
    listener: {
      ...stats,
      dispatcherRegistered: _dispatcherRegistered,
      description: 'Watches Solana for StakeGuard events → triggers Stripe actions',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'start': {
        // Register the Stripe dispatcher if not already done
        if (!_dispatcherRegistered) {
          registerStripeDispatcher();
          _dispatcherRegistered = true;
        }

        const intervalMs = body.intervalMs || 10_000;
        startEventListener(intervalMs);

        return NextResponse.json({
          success: true,
          message: `Event listener started (${intervalMs}ms interval)`,
          stats: getListenerStats(),
        });
      }

      case 'stop': {
        stopEventListener();
        return NextResponse.json({
          success: true,
          message: 'Event listener stopped',
          stats: getListenerStats(),
        });
      }

      case 'poll': {
        // Ensure dispatcher is registered
        if (!_dispatcherRegistered) {
          registerStripeDispatcher();
          _dispatcherRegistered = true;
        }

        // Manual one-shot poll
        const events = await pollForEvents();
        return NextResponse.json({
          success: true,
          message: `Polled ${events.length} events`,
          events: events.map(e => ({
            name: e.name,
            data: e.data,
            signature: e.signature,
            slot: e.slot,
          })),
          stats: getListenerStats(),
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use "start", "stop", or "poll".' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
