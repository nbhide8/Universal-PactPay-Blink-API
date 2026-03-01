/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Stripe Client — Singleton Stripe SDK instance
 *
 * Used by the escrow service, webhook handler, and event dispatcher.
 *
 * ENV:
 *   STRIPE_SECRET_KEY      — sk_test_xxx or sk_live_xxx
 *   STRIPE_WEBHOOK_SECRET  — whsec_xxx (for webhook signature verification)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Get the singleton Stripe instance.
 * Throws if STRIPE_SECRET_KEY is not set.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is required for fiat escrow. ' +
      'Get it from https://dashboard.stripe.com/apikeys'
    );
  }

  _stripe = new Stripe(key, {
    apiVersion: '2025-01-27.acacia' as any,
    typescript: true,
    appInfo: {
      name: 'Blink Hybrid Escrow',
      version: '2.0.0',
    },
  });

  return _stripe;
}

/**
 * Check if Stripe is configured.
 */
export function isStripeAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Get the webhook signing secret for verifying Stripe webhook events.
 */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required for webhook verification.');
  }
  return secret;
}
