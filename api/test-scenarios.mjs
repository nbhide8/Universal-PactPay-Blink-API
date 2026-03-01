/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  StakeGuard — 3 Real-World Scenarios (On-Chain E2E)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Job: "Wash my car" — 0.1 SOL reward
 *  Person A (Creator) stakes 0.1 SOL   |   Person B (Joiner) stakes 0.1 SOL
 *
 *  Scenario 1 — HAPPY PATH:
 *    Both satisfied → both approve → resolve → both get their 0.1 SOL back
 *
 *  Scenario 2 — SLASH BY PERSON A:
 *    Person B backs out → Person A slashes → both lose 0.1 SOL (penalty wallet)
 *
 *  Scenario 3 — SLASH BY PERSON B:
 *    Person A ghosts/betrays → Person B slashes → both lose 0.1 SOL (penalty wallet)
 */
import bs58 from 'bs58';
import { Keypair, Transaction, Connection, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';

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
const A = walletA.publicKey.toBase58();
const B = walletB.publicKey.toBase58();
const PENALTY = '2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv';

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║  StakeGuard — 3 Real-World Car Wash Escrow Scenarios             ║');
console.log('╠═══════════════════════════════════════════════════════════════════╣');
console.log(`║  Person A (Creator):  ${A}   ║`);
console.log(`║  Person B (Joiner):   ${B}   ║`);
console.log(`║  Penalty Wallet:      ${PENALTY}   ║`);
console.log(`║  Stake: 0.1 SOL each  |  Reward: 0.1 SOL for car wash           ║`);
console.log('╚═══════════════════════════════════════════════════════════════════╝');

// ── Helpers ──────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return { status: res.status, ...(await res.json()) };
}

function signTx(base64Tx, keypair) {
  const buf = Buffer.from(base64Tx, 'base64');
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
  return api('POST', '/tx/submit', {
    signedTransaction: signed,
    roomId,
    action,
    walletAddress: keypair.publicKey.toBase58(),
    metadata: meta,
  });
}

async function getBalance(pubkey) {
  const bal = await connection.getBalance(pubkey);
  return bal / LAMPORTS_PER_SOL;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let passed = 0, failed = 0;
function pass(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, err) { console.log(`  ❌ ${label}: ${err}`); failed++; }
function check(label, cond, detail) { cond ? pass(label) : fail(label, detail || 'assertion failed'); }
function section(s) { console.log(`\n━━━ ${s} ${'━'.repeat(Math.max(0, 60 - s.length))}`); }
function header(s) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${s}`);
  console.log(`${'═'.repeat(70)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Helper: Full setup flow (create → init → join → both stake)
// ═══════════════════════════════════════════════════════════════════════════
async function setupRoom(title, description) {
  section(`Create room: "${title}"`);
  const createRes = await api('POST', '/rooms', {
    walletAddress: A,
    title,
    description,
    rewardAmount: 0.1,
    creatorStakeAmount: 0.1,
    joinerStakeAmount: 0.1,
    mode: 'direct',
    isPublic: true,
    tags: ['car-wash', 'test'],
    terms: {
      title: 'Car Wash Agreement',
      summary: 'Person B will wash Person A\'s car. Both stake 0.1 SOL.',
      conditions: [
        'Person B must wash the car within 24 hours',
        'Car must be clean inside and out',
        'Person A will inspect and approve',
      ],
    },
  });
  check('Room created', createRes.success, createRes.error);
  const roomId = createRes.room?.id;
  const joinCode = createRes.room?.join_code;
  console.log(`  📦 Room: ${roomId}`);
  console.log(`  🔑 Join Code: ${joinCode}`);

  // Initialize on-chain
  section('Initialize on-chain (Person A)');
  const initTx = createRes.lockbox?.action?.payload || createRes.transaction;
  check('Init tx received', !!initTx, 'no init transaction');
  const initSub = await signAndSubmit(initTx, walletA, roomId, 'initialize_room');
  check('Init tx confirmed', initSub.success, initSub.error);

  // Person B joins
  section('Person B joins with code');
  const joinRes = await api('POST', '/rooms/join', { walletAddress: B, joinCode });
  check('Person B joined', joinRes.success, joinRes.error);

  // Person A stakes 0.1 SOL
  section('Person A stakes 0.1 SOL');
  const aStakeRes = await api('POST', `/rooms/${roomId}/stake`, { walletAddress: A, isCreator: true });
  check('Stake tx received (A)', aStakeRes.success, aStakeRes.error);
  const aStakeTx = aStakeRes.lockbox?.action?.payload || aStakeRes.transaction;
  const aStakeSub = await signAndSubmit(aStakeTx, walletA, roomId, 'stake', { isCreator: true });
  check('Stake confirmed on-chain (A)', aStakeSub.success, aStakeSub.error);

  // Person B stakes 0.1 SOL
  section('Person B stakes 0.1 SOL');
  const bStakeRes = await api('POST', `/rooms/${roomId}/stake`, { walletAddress: B, isCreator: false });
  check('Stake tx received (B)', bStakeRes.success, bStakeRes.error);
  const bStakeTx = bStakeRes.lockbox?.action?.payload || bStakeRes.transaction;
  const bStakeSub = await signAndSubmit(bStakeTx, walletB, roomId, 'stake', { isCreator: false });
  check('Stake confirmed on-chain (B)', bStakeSub.success, bStakeSub.error);

  return roomId;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Record starting balances
// ═══════════════════════════════════════════════════════════════════════════
header('RECORDING STARTING BALANCES');
const startA = await getBalance(walletA.publicKey);
const startB = await getBalance(walletB.publicKey);
const startPenalty = await getBalance(new (await import('@solana/web3.js')).PublicKey(PENALTY));
console.log(`  💰 Person A:       ${startA.toFixed(6)} SOL`);
console.log(`  💰 Person B:       ${startB.toFixed(6)} SOL`);
console.log(`  💰 Penalty Wallet: ${startPenalty.toFixed(6)} SOL`);

// ═══════════════════════════════════════════════════════════════════════════
//  SCENARIO 1: HAPPY PATH — Both satisfied, resolve, both get money back
// ═══════════════════════════════════════════════════════════════════════════
header('SCENARIO 1: HAPPY PATH — Car washed, both satisfied');
console.log('  📖 Person B washes the car. Person A is happy.');
console.log('     Both approve → resolve → both get 0.1 SOL back.');

const room1 = await setupRoom(
  'Car Wash — Happy Path',
  'Person B washes the car perfectly. Both parties approve.'
);

const balA_before1 = await getBalance(walletA.publicKey);
const balB_before1 = await getBalance(walletB.publicKey);

// Both approve
section('Person A approves');
const aApprove1 = await api('POST', `/rooms/${room1}/approve`, { walletAddress: A });
check('Approve tx received (A)', aApprove1.success, aApprove1.error);
const aAppTx1 = aApprove1.lockbox?.action?.payload || aApprove1.transaction;
const aAppSub1 = await signAndSubmit(aAppTx1, walletA, room1, 'approve');
check('Approve confirmed (A)', aAppSub1.success, aAppSub1.error);

section('Person B approves');
const bApprove1 = await api('POST', `/rooms/${room1}/approve`, { walletAddress: B });
check('Approve tx received (B)', bApprove1.success, bApprove1.error);
const bAppTx1 = bApprove1.lockbox?.action?.payload || bApprove1.transaction;
const bAppSub1 = await signAndSubmit(bAppTx1, walletB, room1, 'approve');
check('Approve confirmed (B)', bAppSub1.success, bAppSub1.error);

// Resolve
section('Resolve — return stakes to both');
const resolve1 = await api('POST', `/rooms/${room1}/resolve`, { walletAddress: A });
check('Resolve tx received', resolve1.success, resolve1.error);
const resolveTx1 = resolve1.lockbox?.action?.payload || resolve1.transaction;
const resolveSub1 = await signAndSubmit(resolveTx1, walletA, room1, 'resolve');
check('Resolve confirmed on-chain', resolveSub1.success, resolveSub1.error);
if (resolveSub1.signature) console.log(`  🔗 ${resolveSub1.signature}`);

// Verify balances
await sleep(2000);
const balA_after1 = await getBalance(walletA.publicKey);
const balB_after1 = await getBalance(walletB.publicKey);
const diffA1 = balA_after1 - balA_before1;
const diffB1 = balB_after1 - balB_before1;
section('SCENARIO 1 — Balance Verification');
console.log(`  💰 Person A: ${balA_before1.toFixed(6)} → ${balA_after1.toFixed(6)} (${diffA1 >= 0 ? '+' : ''}${diffA1.toFixed(6)})`);
console.log(`  💰 Person B: ${balB_before1.toFixed(6)} → ${balB_after1.toFixed(6)} (${diffB1 >= 0 ? '+' : ''}${diffB1.toFixed(6)})`);
// After resolve, both should get ~0.1 SOL back (the diff is measured from AFTER staking)
// So the change should be close to +0.1 (stake returned) minus tiny tx fees
check('Person A got ~0.1 SOL back', diffA1 > 0.095 && diffA1 < 0.105, `diff was ${diffA1.toFixed(6)}`);
check('Person B got ~0.1 SOL back', diffB1 > 0.095 && diffB1 < 0.105, `diff was ${diffB1.toFixed(6)}`);
console.log('  ✨ Result: Both parties got their money back. Fair outcome!');

// ═══════════════════════════════════════════════════════════════════════════
//  SCENARIO 2: SLASH BY PERSON A — Person B backs out
// ═══════════════════════════════════════════════════════════════════════════
header('SCENARIO 2: SLASH BY PERSON A — Person B backs out of contract');
console.log('  📖 Person B agreed to wash the car but never showed up.');
console.log('     Person A slashes → both lose 0.1 SOL → penalty wallet.');

const room2 = await setupRoom(
  'Car Wash — B Backs Out',
  'Person B never showed up. Person A slashes the contract.'
);

const balA_before2 = await getBalance(walletA.publicKey);
const balB_before2 = await getBalance(walletB.publicKey);
const penBefore2 = await getBalance(new (await import('@solana/web3.js')).PublicKey(PENALTY));

// Person A slashes
section('Person A slashes the contract');
const slash2 = await api('POST', `/rooms/${room2}/slash`, { walletAddress: A });
check('Slash tx received', slash2.success, slash2.error);
const slashTx2 = slash2.lockbox?.action?.payload || slash2.transaction;
const slashSub2 = await signAndSubmit(slashTx2, walletA, room2, 'slash');
check('Slash confirmed on-chain', slashSub2.success, slashSub2.error);
if (slashSub2.signature) console.log(`  🔗 ${slashSub2.signature}`);

// Verify balances
await sleep(2000);
const balA_after2 = await getBalance(walletA.publicKey);
const balB_after2 = await getBalance(walletB.publicKey);
const penAfter2 = await getBalance(new (await import('@solana/web3.js')).PublicKey(PENALTY));
const diffA2 = balA_after2 - balA_before2;
const diffB2 = balB_after2 - balB_before2;
const diffPen2 = penAfter2 - penBefore2;
section('SCENARIO 2 — Balance Verification');
console.log(`  💰 Person A:  ${balA_before2.toFixed(6)} → ${balA_after2.toFixed(6)} (${diffA2 >= 0 ? '+' : ''}${diffA2.toFixed(6)})`);
console.log(`  💰 Person B:  ${balB_before2.toFixed(6)} → ${balB_after2.toFixed(6)} (${diffB2 >= 0 ? '+' : ''}${diffB2.toFixed(6)})`);
console.log(`  💰 Penalty:   ${penBefore2.toFixed(6)} → ${penAfter2.toFixed(6)} (${diffPen2 >= 0 ? '+' : ''}${diffPen2.toFixed(6)})`);
// Person A: paid 0.1 staking, never got it back → net ~ -0.1 (plus fees for slash tx)
check('Person A lost money (slash fee only, stake already gone)', diffA2 < 0, `diff was ${diffA2.toFixed(6)}`);
// Person B: paid 0.1 staking, never got it back → net 0 change now (already lost at stake time)
// The penalty wallet should have gained ~0.2 SOL (both stakes)
check('Penalty wallet gained ~0.2 SOL', diffPen2 > 0.15, `gained ${diffPen2.toFixed(6)}`);
console.log('  💀 Result: Both lost their stakes. Person B paid the price for backing out.');
console.log('     Person A also lost, but Person B learned an expensive lesson.');

// ═══════════════════════════════════════════════════════════════════════════
//  SCENARIO 3: SLASH BY PERSON B — Person A ghosts/betrays
// ═══════════════════════════════════════════════════════════════════════════
header('SCENARIO 3: SLASH BY PERSON B — Person A betrays at last minute');
console.log('  📖 Person B washed the car. Person A refuses to acknowledge.');
console.log('     Person B slashes → both lose 0.1 SOL → penalty wallet.');
console.log('     Person A loses his higher stake as punishment.');

const room3 = await setupRoom(
  'Car Wash — A Betrays B',
  'Person A ghosts Person B after the car was washed.'
);

const balA_before3 = await getBalance(walletA.publicKey);
const balB_before3 = await getBalance(walletB.publicKey);
const penBefore3 = await getBalance(new (await import('@solana/web3.js')).PublicKey(PENALTY));

// Person B slashes
section('Person B slashes the contract (revenge)');
const slash3 = await api('POST', `/rooms/${room3}/slash`, { walletAddress: B });
check('Slash tx received', slash3.success, slash3.error);
const slashTx3 = slash3.lockbox?.action?.payload || slash3.transaction;
const slashSub3 = await signAndSubmit(slashTx3, walletB, room3, 'slash');
check('Slash confirmed on-chain', slashSub3.success, slashSub3.error);
if (slashSub3.signature) console.log(`  🔗 ${slashSub3.signature}`);

// Verify balances
await sleep(2000);
const balA_after3 = await getBalance(walletA.publicKey);
const balB_after3 = await getBalance(walletB.publicKey);
const penAfter3 = await getBalance(new (await import('@solana/web3.js')).PublicKey(PENALTY));
const diffA3 = balA_after3 - balA_before3;
const diffB3 = balB_after3 - balB_before3;
const diffPen3 = penAfter3 - penBefore3;
section('SCENARIO 3 — Balance Verification');
console.log(`  💰 Person A:  ${balA_before3.toFixed(6)} → ${balA_after3.toFixed(6)} (${diffA3 >= 0 ? '+' : ''}${diffA3.toFixed(6)})`);
console.log(`  💰 Person B:  ${balB_before3.toFixed(6)} → ${balB_after3.toFixed(6)} (${diffB3 >= 0 ? '+' : ''}${diffB3.toFixed(6)})`);
console.log(`  💰 Penalty:   ${penBefore3.toFixed(6)} → ${penAfter3.toFixed(6)} (${diffPen3 >= 0 ? '+' : ''}${diffPen3.toFixed(6)})`);
check('Person B lost some (slash fee)', diffB3 < 0, `diff was ${diffB3.toFixed(6)}`);
check('Penalty wallet gained ~0.2 SOL', diffPen3 > 0.15, `gained ${diffPen3.toFixed(6)}`);
console.log('  💀 Result: Both lost their stakes.');
console.log('     Person A betrayed Person B, but Person A\'s 0.1 SOL stake was burned too.');
console.log('     Neither party benefits from bad behavior — the game theory works!');

// ═══════════════════════════════════════════════════════════════════════════
//  FINAL SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
header('FINAL BALANCE SUMMARY');
const finalA = await getBalance(walletA.publicKey);
const finalB = await getBalance(walletB.publicKey);
const finalPen = await getBalance(new (await import('@solana/web3.js')).PublicKey(PENALTY));
console.log(`  Person A:       ${startA.toFixed(6)} → ${finalA.toFixed(6)} SOL (${(finalA - startA) >= 0 ? '+' : ''}${(finalA - startA).toFixed(6)})`);
console.log(`  Person B:       ${startB.toFixed(6)} → ${finalB.toFixed(6)} SOL (${(finalB - startB) >= 0 ? '+' : ''}${(finalB - startB).toFixed(6)})`);
console.log(`  Penalty Wallet: ${startPenalty.toFixed(6)} → ${finalPen.toFixed(6)} SOL (${(finalPen - startPenalty) >= 0 ? '+' : ''}${(finalPen - startPenalty).toFixed(6)})`);

console.log('\n  📊 Economics breakdown:');
console.log('  ┌──────────────┬─────────────┬─────────────┬─────────────┐');
console.log('  │ Scenario     │ Person A    │ Person B    │ Penalty     │');
console.log('  ├──────────────┼─────────────┼─────────────┼─────────────┤');
console.log('  │ 1: Resolve   │ got back    │ got back    │ +0          │');
console.log('  │ 2: A slashes │ lost 0.1    │ lost 0.1    │ +0.2        │');
console.log('  │ 3: B slashes │ lost 0.1    │ lost 0.1    │ +0.2        │');
console.log('  └──────────────┴─────────────┴─────────────┴─────────────┘');
console.log('');
console.log('  🎯 Game Theory: Neither party can screw the other without');
console.log('     also losing their own stake. Mutual destruction = deterrence.');

console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
console.log(`║  RESULTS: ${String(passed).padStart(2)} passed, ${String(failed).padStart(2)} failed                                       ║`);
console.log('╚═══════════════════════════════════════════════════════════════════╝');

if (failed > 0) process.exit(1);
