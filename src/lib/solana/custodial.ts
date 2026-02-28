/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Custodial Solana Operations — Platform Wallet
 *
 * The platform wallet signs and submits Solana transactions on behalf
 * of non-crypto users. This is what makes StakeGuard accessible to
 * users who don't have a Solana wallet.
 *
 * EVERY escrow still lives on the Solana blockchain — the platform
 * wallet acts as a custodial proxy for fiat/credit users.
 *
 * Flow:
 *   1. Non-crypto user pays via Stripe or company credits
 *   2. API builds the Solana transaction (same as direct mode)
 *   3. Platform wallet SIGNS and SUBMITS the transaction
 *   4. SOL is locked in the on-chain PDA escrow
 *   5. On resolve: platform wallet signs resolve, converts SOL → fiat payout
 *
 * ENV:
 *   PLATFORM_WALLET_SECRET — JSON array of keypair bytes: [1,2,3,...]
 *     Generate: solana-keygen new --outfile platform.json
 *     Then copy the array from the file into the env var
 *
 * SECURITY:
 *   In production, use a KMS (AWS KMS, GCP Cloud HSM) instead of an env var.
 *   The platform wallet must be funded with SOL to stake on behalf of users.
 *   Automate treasury management to convert fiat → SOL as needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Keypair, Transaction } from '@solana/web3.js';
import { getConnection, submitSignedTransaction } from './transactions';

let _platformKeypair: Keypair | null = null;

/**
 * Get the platform wallet keypair.
 * Configured via PLATFORM_WALLET_SECRET env var.
 *
 * Accepted formats:
 *  - JSON array of bytes: [1,2,3,...,64] (standard Solana keypair format)
 *  - Base64-encoded JSON array
 */
export function getPlatformKeypair(): Keypair {
  if (_platformKeypair) return _platformKeypair;

  const secret = process.env.PLATFORM_WALLET_SECRET;
  if (!secret) {
    throw new Error(
      'PLATFORM_WALLET_SECRET is required for custodial mode. ' +
      'Generate with: solana-keygen new --outfile platform.json, ' +
      'then set the JSON array as the env var value.'
    );
  }

  try {
    // Try JSON array first: [1,2,3,...,64]
    if (secret.trim().startsWith('[')) {
      const bytes = JSON.parse(secret);
      _platformKeypair = Keypair.fromSecretKey(new Uint8Array(bytes));
    }
    // Try base64-encoded JSON array
    else {
      const decoded = Buffer.from(secret, 'base64').toString();
      const bytes = JSON.parse(decoded);
      _platformKeypair = Keypair.fromSecretKey(new Uint8Array(bytes));
    }
  } catch {
    throw new Error(
      'Invalid PLATFORM_WALLET_SECRET format. ' +
      'Use a JSON array of 64 bytes: [1,2,3,...] or base64-encoded JSON array.'
    );
  }

  return _platformKeypair!;
}

/**
 * Get the platform wallet's public key as a base58 string.
 * This is what appears as the "creator" or "staker" on-chain for custodial rooms.
 */
export function getPlatformWalletAddress(): string {
  return getPlatformKeypair().publicKey.toBase58();
}

/**
 * Sign an unsigned Solana transaction with the platform keypair and submit it.
 *
 * Used for custodial operations where the API stakes on behalf of non-crypto users.
 * The transaction was built using the platform wallet's public key as the fee payer.
 *
 * Returns the on-chain transaction signature.
 */
export async function custodialSignAndSubmit(
  unsignedTxBase64: string
): Promise<{ signature: string; confirmationStatus: string }> {
  const keypair = getPlatformKeypair();

  const txBuffer = Buffer.from(unsignedTxBase64, 'base64');
  const tx = Transaction.from(txBuffer);

  // Sign with the platform keypair (it's the fee payer)
  tx.partialSign(keypair);

  const signedBase64 = tx.serialize().toString('base64');
  return submitSignedTransaction(signedBase64);
}

/**
 * Check if custodial mode is available (platform wallet configured).
 */
export function isCustodialAvailable(): boolean {
  return !!process.env.PLATFORM_WALLET_SECRET;
}
