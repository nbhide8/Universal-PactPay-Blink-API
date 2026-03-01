/**
 * End-to-end API test with REAL on-chain Solana transactions.
 * Two wallets go through the full escrow lifecycle:
 *   create → join → stake(creator) → stake(joiner) → approve(both) → resolve
 */
import bs58 from 'bs58';
import { Keypair, Transaction, Connection, VersionedTransaction } from '@solana/web3.js';

const API = 'http://localhost:3001/api/v1';
const RPC = 'https://api.devnet.solana.com';
const connection = new Connection(RPC, 'confirmed');

// ── Wallets ──────────────────────────────────────────────────────────────────
const walletA = Keypair.fromSecretKey(
  bs58.decode('4PDNe8XPq9mE8MTH8CdTmyM6KajNyjirwEp7ZMUu51wGwxuffwdDNuEnvUBAbiyrJ3Bo6DZNRvN1GujLmLFbnNpa')
);
const walletB = Keypair.fromSecretKey(
  bs58.decode('2b3bWprtxLc9QkYhmy4UFTR9zjiWuJUm3kWR7EnTeWYe5ZXkGLRiqq14R1f78iKBMRrhgnABWD2cH3ftLpPwbW3a')
);
const CREATOR = walletA.publicKey.toBase58(); // CQbUJUsP...
const JOINER  = walletB.publicKey.toBase58(); // 4W9x6CEa...

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  Blink API — Full End-to-End On-Chain Test                  ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║  Creator (A): ${CREATOR}  ║`);
console.log(`║  Joiner  (B): ${JOINER}  ║`);
console.log('╚══════════════════════════════════════════════════════════════╝');

// ── Helpers ──────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const json = await res.json();
  return { status: res.status, ...json };
}

/** Sign a base64 unsigned transaction and return signed base64 */
function signTx(base64Tx, keypair) {
  const buf = Buffer.from(base64Tx, 'base64');
  // Try legacy Transaction first, then VersionedTransaction
  try {
    const tx = Transaction.from(buf);
    tx.sign(keypair);
    return tx.serialize().toString('base64');
  } catch {
    const vtx = VersionedTransaction.deserialize(buf);
    vtx.sign([keypair]);
    return Buffer.from(vtx.serialize()).toString('base64');
  }
}

async function signAndSubmit(base64Tx, keypair, roomId, action, meta = {}) {
  const signed = signTx(base64Tx, keypair);
  const result = await api('POST', '/tx/submit', {
    signedTransaction: signed,
    roomId,
    action,
    walletAddress: keypair.publicKey.toBase58(),
    metadata: meta,
  });
  return result;
}

function pass(label) { console.log(`  ✅ ${label}`); }
function fail(label, err) { console.log(`  ❌ ${label}: ${err}`); }
function section(s) { console.log(`\n━━━ ${s} ${'━'.repeat(55 - s.length)}`); }

let passed = 0, failed = 0;
function check(label, condition, detail) {
  if (condition) { pass(label); passed++; }
  else { fail(label, detail || 'assertion failed'); failed++; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 1: Create Room
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 1: Create Room (Creator A)');

const createRes = await api('POST', '/rooms', {
  walletAddress: CREATOR,
  title: 'E2E On-Chain Test',
  description: 'Full lifecycle test with real Solana transactions',
  rewardAmount: 0.01,
  creatorStakeAmount: 0.01,
  joinerStakeAmount: 0.01,
  mode: 'direct',
  isPublic: true,
  tags: ['e2e', 'test'],
  terms: {
    title: 'E2E Test Terms',
    summary: 'Both parties stake 0.01 SOL. Worker delivers, both get refunded.',
    conditions: ['Deliver working code', 'Pass all tests', 'Submit before deadline'],
  },
});

check('Room created', createRes.success && createRes.room, createRes.error);
const ROOM_ID = createRes.room?.id;
const JOIN_CODE = createRes.room?.join_code;
const initTxBase64 = createRes.lockbox?.action?.payload || createRes.transaction;
console.log(`  📦 Room ID:    ${ROOM_ID}`);
console.log(`  🔑 Join Code:  ${JOIN_CODE}`);
console.log(`  📝 Escrow PDA: ${createRes.room?.escrow_pda}`);
check('Init transaction returned', !!initTxBase64, 'no transaction payload');

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 2: Sign & Submit Initialize Room Transaction
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 2: Sign & Submit Init Tx (Creator A)');

const initResult = await signAndSubmit(initTxBase64, walletA, ROOM_ID, 'initialize_room');
check('Init tx submitted', initResult.success, initResult.error);
check('Got tx signature', !!initResult.signature, 'no signature');
if (initResult.signature) console.log(`  🔗 Signature: ${initResult.signature}`);

// Verify room is now initialized in DB
const roomAfterInit = await api('GET', `/rooms/${ROOM_ID}`);
check('Room fetched after init', roomAfterInit.success, roomAfterInit.error);
// Note: escrow_initialized may update asynchronously

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 3: Join Room (Joiner B)
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 3: Join Room (Joiner B)');

const joinRes = await api('POST', '/rooms/join', {
  walletAddress: JOINER,
  joinCode: JOIN_CODE,
});
check('Joiner B joined room', joinRes.success, joinRes.error);
check('Status → awaiting_approval', joinRes.room?.status === 'awaiting_approval', joinRes.room?.status);

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 4: Creator Stakes
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 4: Creator A Stakes 0.01 SOL');

const creatorStakeRes = await api('POST', `/rooms/${ROOM_ID}/stake`, {
  walletAddress: CREATOR,
  isCreator: true,
});
check('Creator stake tx returned', creatorStakeRes.success, creatorStakeRes.error);
check('Stake amount correct (0.01)', creatorStakeRes.stakeAmount === 0.01, `got ${creatorStakeRes.stakeAmount}`);

const creatorStakeTx = creatorStakeRes.lockbox?.action?.payload || creatorStakeRes.transaction;
check('Stake transaction payload present', !!creatorStakeTx, 'no payload');

const creatorStakeSubmit = await signAndSubmit(creatorStakeTx, walletA, ROOM_ID, 'stake', { isCreator: true });
check('Creator stake submitted on-chain', creatorStakeSubmit.success, creatorStakeSubmit.error);
if (creatorStakeSubmit.signature) console.log(`  🔗 Signature: ${creatorStakeSubmit.signature}`);

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 5: Joiner Stakes
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 5: Joiner B Stakes 0.01 SOL');

const joinerStakeRes = await api('POST', `/rooms/${ROOM_ID}/stake`, {
  walletAddress: JOINER,
  isCreator: false,
});
check('Joiner stake tx returned', joinerStakeRes.success, joinerStakeRes.error);
check('Stake amount correct (0.01)', joinerStakeRes.stakeAmount === 0.01, `got ${joinerStakeRes.stakeAmount}`);

const joinerStakeTx = joinerStakeRes.lockbox?.action?.payload || joinerStakeRes.transaction;
check('Stake transaction payload present', !!joinerStakeTx, 'no payload');

const joinerStakeSubmit = await signAndSubmit(joinerStakeTx, walletB, ROOM_ID, 'stake', { isCreator: false });
check('Joiner stake submitted on-chain', joinerStakeSubmit.success, joinerStakeSubmit.error);
if (joinerStakeSubmit.signature) console.log(`  🔗 Signature: ${joinerStakeSubmit.signature}`);

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 6: Check On-Chain State
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 6: Verify Room State After Staking');

const roomAfterStake = await api('GET', `/rooms/${ROOM_ID}`);
check('Room fetched', roomAfterStake.success, roomAfterStake.error);
const room = roomAfterStake.room;
console.log(`  📊 Status: ${room?.status}`);
console.log(`  💰 Creator funded: ${room?.creator_funded}`);
console.log(`  💰 Joiner funded:  ${room?.joiner_funded}`);
console.log(`  📝 Stakes recorded: ${room?.stakes?.length || 0}`);
if (room?.onChain) console.log(`  ⛓️  On-chain data present`);

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 7: Both Approve Resolution
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 7a: Creator A Approves Resolution');

const creatorApproveRes = await api('POST', `/rooms/${ROOM_ID}/approve`, {
  walletAddress: CREATOR,
});
check('Creator approve tx returned', creatorApproveRes.success, creatorApproveRes.error);

const creatorApproveTx = creatorApproveRes.lockbox?.action?.payload || creatorApproveRes.transaction;
if (creatorApproveTx) {
  const creatorApproveSubmit = await signAndSubmit(creatorApproveTx, walletA, ROOM_ID, 'approve');
  check('Creator approve submitted on-chain', creatorApproveSubmit.success, creatorApproveSubmit.error);
  if (creatorApproveSubmit.signature) console.log(`  🔗 Signature: ${creatorApproveSubmit.signature}`);
}

section('STEP 7b: Joiner B Approves Resolution');

const joinerApproveRes = await api('POST', `/rooms/${ROOM_ID}/approve`, {
  walletAddress: JOINER,
});
check('Joiner approve tx returned', joinerApproveRes.success, joinerApproveRes.error);

const joinerApproveTx = joinerApproveRes.lockbox?.action?.payload || joinerApproveRes.transaction;
if (joinerApproveTx) {
  const joinerApproveSubmit = await signAndSubmit(joinerApproveTx, walletB, ROOM_ID, 'approve');
  check('Joiner approve submitted on-chain', joinerApproveSubmit.success, joinerApproveSubmit.error);
  if (joinerApproveSubmit.signature) console.log(`  🔗 Signature: ${joinerApproveSubmit.signature}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 8: Resolve Escrow
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 8: Resolve Escrow (Creator A calls)');

const resolveRes = await api('POST', `/rooms/${ROOM_ID}/resolve`, {
  walletAddress: CREATOR,
});
check('Resolve tx returned', resolveRes.success, resolveRes.error);

const resolveTx = resolveRes.lockbox?.action?.payload || resolveRes.transaction;
if (resolveTx) {
  const resolveSubmit = await signAndSubmit(resolveTx, walletA, ROOM_ID, 'resolve');
  check('Resolve submitted on-chain', resolveSubmit.success, resolveSubmit.error);
  if (resolveSubmit.signature) console.log(`  🔗 Signature: ${resolveSubmit.signature}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 9: Final Verification
// ══════════════════════════════════════════════════════════════════════════════
section('STEP 9: Final State Verification');

const finalRoom = await api('GET', `/rooms/${ROOM_ID}`);
check('Final room fetch', finalRoom.success, finalRoom.error);
const fr = finalRoom.room;
console.log(`  📊 Final status: ${fr?.status}`);
console.log(`  🧾 Resolution tx: ${fr?.resolution_tx_signature || 'none'}`);
console.log(`  📅 Resolved at: ${fr?.resolved_at || 'not yet'}`);

// Check final balances
const balA = await connection.getBalance(walletA.publicKey);
const balB = await connection.getBalance(walletB.publicKey);
console.log(`  💰 Wallet A balance: ${(balA / 1e9).toFixed(6)} SOL`);
console.log(`  💰 Wallet B balance: ${(balB / 1e9).toFixed(6)} SOL`);

// ══════════════════════════════════════════════════════════════════════════════
//  BONUS: Test Cancel Flow (new room)
// ══════════════════════════════════════════════════════════════════════════════
section('BONUS: Cancel Flow (new room)');

const cancelRoomRes = await api('POST', '/rooms', {
  walletAddress: CREATOR,
  title: 'Cancel Test Room',
  description: 'Testing cancel before fully funded',
  rewardAmount: 0.005,
  creatorStakeAmount: 0.005,
  joinerStakeAmount: 0.005,
  mode: 'direct',
  terms: { title: 'Cancel Terms', summary: 'Will be cancelled', conditions: ['N/A'] },
});
check('Cancel test room created', cancelRoomRes.success, cancelRoomRes.error);

const cancelRoomId = cancelRoomRes.room?.id;
const cancelInitTx = cancelRoomRes.lockbox?.action?.payload || cancelRoomRes.transaction;

// Initialize the room on-chain
if (cancelInitTx) {
  const cancelInitSubmit = await signAndSubmit(cancelInitTx, walletA, cancelRoomId, 'initialize_room');
  check('Cancel room initialized on-chain', cancelInitSubmit.success, cancelInitSubmit.error);
}

// Now cancel
const cancelRes = await api('POST', `/rooms/${cancelRoomId}/cancel`, {
  walletAddress: CREATOR,
});
check('Cancel tx returned', cancelRes.success, cancelRes.error);

const cancelTx = cancelRes.lockbox?.action?.payload || cancelRes.transaction;
if (cancelTx) {
  const cancelSubmit = await signAndSubmit(cancelTx, walletA, cancelRoomId, 'cancel');
  check('Cancel submitted on-chain', cancelSubmit.success, cancelSubmit.error);
  if (cancelSubmit.signature) console.log(`  🔗 Signature: ${cancelSubmit.signature}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  Summary
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log(`║  RESULTS: ${passed} passed, ${failed} failed                               ║`);
console.log('╚══════════════════════════════════════════════════════════════╝');

if (failed > 0) process.exit(1);
