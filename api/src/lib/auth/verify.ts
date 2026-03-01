/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Wallet Signature Verification
 *
 * For mutating actions (stake, approve, resolve, slash, cancel), callers
 * must prove they own the wallet address they claim to be using.
 *
 * HOW IT WORKS:
 *   1. Caller signs a message: "stakeguard:<action>:<roomId>:<timestamp>"
 *      using their Solana private key (ed25519).
 *   2. They send { walletAddress, signature, message } to the API.
 *   3. API verifies the ed25519 signature matches the public key.
 *   4. API checks the timestamp is within 5 minutes (replay protection).
 *
 * TERMINAL USAGE (with solana-keygen keypair):
 *   # Generate the message
 *   MSG="stakeguard:stake:room-abc-123:$(date +%s)"
 *   # Sign with a Node.js one-liner (or the provided helper script)
 *   SIG=$(node -e "
 *     const nacl = require('tweetnacl');
 *     const bs58 = require('bs58');
 *     const kp = require('./keypair.json');
 *     const key = nacl.sign.keyPair.fromSecretKey(new Uint8Array(kp));
 *     const msg = Buffer.from('$MSG');
 *     const sig = nacl.sign.detached(msg, key.secretKey);
 *     console.log(bs58.encode(sig));
 *   ")
 *   # Call the API
 *   curl -X POST .../api/v1/rooms/room-abc-123/stake \
 *     -H "Content-Type: application/json" \
 *     -d "{\"walletAddress\": \"...\", \"signature\": \"$SIG\", \"message\": \"$MSG\", ...}"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { PublicKey } from '@solana/web3.js';

// We use tweetnacl for ed25519 signature verification
// (lighter than importing all of @solana/web3.js in some contexts)
let nacl: typeof import('tweetnacl') | null = null;

async function getNacl() {
  if (!nacl) {
    nacl = await import('tweetnacl');
  }
  return nacl;
}

/** Maximum age for a signed message (5 minutes) */
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

/** Expected message format: "stakeguard:<action>:<roomId>:<timestamp>" */
const MESSAGE_PATTERN = /^stakeguard:(\w+):([^:]+):(\d+)$/;

export interface VerifySignatureParams {
  walletAddress: string;
  signature: string;   // base58 or base64 encoded ed25519 signature
  message: string;     // the signed message plaintext
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  action?: string;
  roomId?: string;
  timestamp?: number;
}

/**
 * Verify that a wallet signature is valid and fresh.
 */
export async function verifyWalletSignature(
  params: VerifySignatureParams
): Promise<VerificationResult> {
  const { walletAddress, signature, message } = params;

  // 1. Parse the message format
  const match = message.match(MESSAGE_PATTERN);
  if (!match) {
    return {
      valid: false,
      error: 'Invalid message format. Expected: stakeguard:<action>:<roomId>:<timestamp>',
    };
  }

  const [, action, roomId, timestampStr] = match;
  const timestamp = parseInt(timestampStr, 10) * 1000; // seconds → ms

  // 2. Check timestamp freshness (replay protection)
  const now = Date.now();
  if (Math.abs(now - timestamp) > MAX_MESSAGE_AGE_MS) {
    return {
      valid: false,
      error: `Signature expired. Message timestamp must be within ${MAX_MESSAGE_AGE_MS / 60000} minutes of current time.`,
    };
  }

  // 3. Decode the public key
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(walletAddress);
  } catch {
    return { valid: false, error: 'Invalid wallet address (not a valid Solana public key).' };
  }

  // 4. Decode the signature (try base58 first, then base64)
  let sigBytes: Uint8Array;
  try {
    // Try base58 decode
    const bs58Module = await import('bs58');
    const bs58 = bs58Module.default || bs58Module;
    sigBytes = bs58.decode(signature);
  } catch {
    try {
      // Fallback to base64
      sigBytes = new Uint8Array(Buffer.from(signature, 'base64'));
    } catch {
      return { valid: false, error: 'Invalid signature encoding. Use base58 or base64.' };
    }
  }

  if (sigBytes.length !== 64) {
    return { valid: false, error: `Invalid signature length: ${sigBytes.length} (expected 64 bytes).` };
  }

  // 5. Verify the ed25519 signature
  const tw = await getNacl();
  const messageBytes = new TextEncoder().encode(message);
  const pubkeyBytes = pubkey.toBytes();

  const isValid = tw.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);

  if (!isValid) {
    return {
      valid: false,
      error: 'Signature verification failed. The signature does not match the wallet address.',
    };
  }

  return { valid: true, action, roomId, timestamp };
}

/**
 * Express-style extraction: pulls signature fields from request body
 * and verifies. Returns the result or null if no signature was provided
 * (for backward compatibility / dev mode).
 */
export async function verifyRequestSignature(
  body: Record<string, any>,
  expectedAction?: string,
  expectedRoomId?: string
): Promise<VerificationResult | null> {
  // If no signature provided, return null (caller decides whether to enforce)
  if (!body.signature || !body.message) {
    return null;
  }

  if (!body.walletAddress) {
    return { valid: false, error: 'walletAddress is required when signature is provided.' };
  }

  const result = await verifyWalletSignature({
    walletAddress: body.walletAddress,
    signature: body.signature,
    message: body.message,
  });

  if (!result.valid) return result;

  // Optionally verify the action and roomId match what the route expects
  if (expectedAction && result.action !== expectedAction) {
    return {
      valid: false,
      error: `Signature action mismatch. Expected "${expectedAction}", got "${result.action}".`,
    };
  }

  if (expectedRoomId && result.roomId !== expectedRoomId) {
    return {
      valid: false,
      error: `Signature roomId mismatch. Expected "${expectedRoomId}", got "${result.roomId}".`,
    };
  }

  return result;
}

/**
 * Check if signature enforcement is enabled.
 * When REQUIRE_SIGNATURES=true, all mutating endpoints reject unsigned requests.
 * When false (default / dev), signatures are verified if present but not required.
 */
export function isSignatureRequired(): boolean {
  return process.env.REQUIRE_SIGNATURES === 'true';
}
