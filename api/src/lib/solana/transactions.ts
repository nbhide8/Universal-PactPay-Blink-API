/**
 * StakeGuard Server-Side Transaction Builder
 *
 * Builds unsigned Solana transactions that callers sign with their own wallet.
 * This is the core engine behind the StakeGuard API — no wallet adapter
 * needed, just a public key and the API returns a base64-encoded transaction.
 *
 * Pattern used by Jupiter, Tensor, Dialect, and other Solana API products:
 *   1. Client calls API with their pubkey + params
 *   2. Server builds an unsigned Transaction
 *   3. Returns base64-encoded tx
 *   4. Client deserializes → signs → sends
 */
import { AnchorProvider, Program, BN, BorshCoder } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
  AccountMeta,
} from '@solana/web3.js';
import { IDL } from './idl';
import { hashString, getRoomEscrowPDA, getStakeRecordPDA } from './pda';

// ─── Constants ───────────────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey('4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf');
export const PENALTY_WALLET = new PublicKey('2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv');

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Dummy wallet for read-only Anchor provider (we only build instructions, never sign)
const DUMMY_WALLET = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async <T>(tx: T): Promise<T> => tx,
  signAllTransactions: async <T>(txs: T[]): Promise<T[]> => txs,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get a shared Connection for the configured RPC */
export function getConnection(): Connection {
  return new Connection(RPC_URL, 'confirmed');
}

/** Read-only Anchor Program (for fetching on-chain state only) */
function getReadOnlyProgram(connection: Connection): any {
  const provider = new AnchorProvider(connection, DUMMY_WALLET as any, {
    commitment: 'confirmed',
  });
  return new Program(IDL as any, provider) as any;
}

/**
 * Build a raw TransactionInstruction using BorshCoder.
 * Avoids Anchor's account resolver which tries to fetch PDAs that don't exist yet.
 */
function buildRawInstruction(
  ixName: string,
  args: Record<string, any>,
  keys: AccountMeta[]
): TransactionInstruction {
  const coder = new BorshCoder(IDL as any);
  const data = coder.instruction.encode(ixName, args);
  return new TransactionInstruction({ keys, programId: PROGRAM_ID, data });
}

/** Wrap instructions into an unsigned legacy Transaction, serialized as base64 */
async function buildUnsignedTx(
  connection: Connection,
  feePayer: PublicKey,
  ...instructions: any[]
): Promise<string> {
  const tx = new Transaction();
  for (const ix of instructions) {
    tx.add(ix);
  }
  tx.feePayer = feePayer;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;

  // Serialize without signatures — the caller will sign
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
}

// ─── Transaction Builders ────────────────────────────────────────────────────

export interface BuildInitializeRoomInput {
  /** Wallet address of the room creator (fee payer & initializer) */
  walletAddress: string;
  /** Unique room identifier */
  roomId: string;
  /** Creator's required stake in SOL */
  creatorStakeAmount: number;
  /** Joiner's required stake in SOL */
  joinerStakeAmount: number;
}

export interface TransactionResult {
  /** Base64-encoded unsigned transaction — deserialize, sign, send */
  transaction: string;
  /** Human-readable description of what this tx does */
  message: string;
  /** Accounts involved (for transparency) */
  accounts: Record<string, string>;
}

/**
 * Build an `initialize_room` transaction.
 * Creates the on-chain escrow PDA for the room.
 */
export async function buildInitializeRoomTx(
  input: BuildInitializeRoomInput
): Promise<TransactionResult> {
  const connection = getConnection();
  const feePayer = new PublicKey(input.walletAddress);

  const roomHash = Array.from(hashString(input.roomId));
  const escrowPDA = getRoomEscrowPDA(input.roomId);

  const ix = buildRawInstruction(
    'initializeRoom',
    {
      roomHash,
      roomId: input.roomId,
      creatorPubkey: feePayer,
      creatorStakeAmount: new BN(Math.round(input.creatorStakeAmount * LAMPORTS_PER_SOL)),
      joinerStakeAmount: new BN(Math.round(input.joinerStakeAmount * LAMPORTS_PER_SOL)),
    },
    [
      { pubkey: escrowPDA, isWritable: true, isSigner: false },
      { pubkey: feePayer, isWritable: true, isSigner: true },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    ]
  );

  const transaction = await buildUnsignedTx(connection, feePayer, ix);

  return {
    transaction,
    message: `Initialize escrow room "${input.roomId}" with creator stake ${input.creatorStakeAmount} SOL, joiner stake ${input.joinerStakeAmount} SOL`,
    accounts: {
      escrowPDA: escrowPDA.toBase58(),
      initializer: input.walletAddress,
      programId: PROGRAM_ID.toBase58(),
    },
  };
}

// ─── Stake ───────────────────────────────────────────────────────────────────

export interface BuildStakeTxInput {
  walletAddress: string;
  roomId: string;
  participantId: string;
  /** In SOL */
  amount: number;
  isCreator: boolean;
}

/**
 * Build a `stake` transaction.
 * Transfers SOL from the staker into the escrow PDA.
 */
export async function buildStakeTx(
  input: BuildStakeTxInput
): Promise<TransactionResult> {
  const connection = getConnection();
  const feePayer = new PublicKey(input.walletAddress);

  const roomHash = Array.from(hashString(input.roomId));
  const participantHash = Array.from(hashString(input.participantId));
  const escrowPDA = getRoomEscrowPDA(input.roomId);
  const stakeRecordPDA = getStakeRecordPDA(input.roomId, input.participantId);

  const ix = buildRawInstruction(
    'stake',
    {
      roomHash,
      participantHash,
      roomId: input.roomId,
      participantId: input.participantId,
      amount: new BN(Math.round(input.amount * LAMPORTS_PER_SOL)),
      isCreator: input.isCreator,
    },
    [
      { pubkey: escrowPDA, isWritable: true, isSigner: false },
      { pubkey: stakeRecordPDA, isWritable: true, isSigner: false },
      { pubkey: feePayer, isWritable: true, isSigner: true },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    ]
  );

  const transaction = await buildUnsignedTx(connection, feePayer, ix);

  return {
    transaction,
    message: `Stake ${input.amount} SOL into room "${input.roomId}" as ${input.isCreator ? 'creator' : 'joiner'}`,
    accounts: {
      escrowPDA: escrowPDA.toBase58(),
      stakeRecordPDA: stakeRecordPDA.toBase58(),
      staker: input.walletAddress,
    },
  };
}

// ─── Approve Resolve ─────────────────────────────────────────────────────────

export interface BuildApproveResolveTxInput {
  walletAddress: string;
  roomId: string;
}

/**
 * Build an `approve_resolve` transaction.
 * Records the signer's vote to resolve the contract.
 */
export async function buildApproveResolveTx(
  input: BuildApproveResolveTxInput
): Promise<TransactionResult> {
  const connection = getConnection();
  const feePayer = new PublicKey(input.walletAddress);

  const roomHash = Array.from(hashString(input.roomId));
  const escrowPDA = getRoomEscrowPDA(input.roomId);

  const ix = buildRawInstruction(
    'approveResolve',
    { roomHash, roomId: input.roomId },
    [
      { pubkey: escrowPDA, isWritable: true, isSigner: false },
      { pubkey: feePayer, isWritable: false, isSigner: true },
    ]
  );

  const transaction = await buildUnsignedTx(connection, feePayer, ix);

  return {
    transaction,
    message: `Approve resolution for room "${input.roomId}"`,
    accounts: {
      escrowPDA: escrowPDA.toBase58(),
      signer: input.walletAddress,
    },
  };
}

// ─── Resolve ─────────────────────────────────────────────────────────────────

export interface BuildResolveTxInput {
  walletAddress: string;
  roomId: string;
  creatorParticipantId: string;
  joinerParticipantId: string;
  creatorWallet: string;
  joinerWallet: string;
}

/**
 * Build a `resolve` transaction.
 * Returns staked SOL to both parties. Requires both to have approved first.
 */
export async function buildResolveTx(
  input: BuildResolveTxInput
): Promise<TransactionResult> {
  const connection = getConnection();
  const feePayer = new PublicKey(input.walletAddress);

  const roomHash = Array.from(hashString(input.roomId));
  const creatorParticipantHash = Array.from(hashString(input.creatorParticipantId));
  const joinerParticipantHash = Array.from(hashString(input.joinerParticipantId));
  const escrowPDA = getRoomEscrowPDA(input.roomId);
  const creatorStakeRecordPDA = getStakeRecordPDA(input.roomId, input.creatorParticipantId);
  const joinerStakeRecordPDA = getStakeRecordPDA(input.roomId, input.joinerParticipantId);

  const ix = buildRawInstruction(
    'resolve',
    { roomHash, roomId: input.roomId, creatorParticipantHash, joinerParticipantHash },
    [
      { pubkey: escrowPDA, isWritable: true, isSigner: false },
      { pubkey: creatorStakeRecordPDA, isWritable: true, isSigner: false },
      { pubkey: joinerStakeRecordPDA, isWritable: true, isSigner: false },
      { pubkey: feePayer, isWritable: false, isSigner: true },
      { pubkey: new PublicKey(input.creatorWallet), isWritable: true, isSigner: false },
      { pubkey: new PublicKey(input.joinerWallet), isWritable: true, isSigner: false },
    ]
  );

  const transaction = await buildUnsignedTx(connection, feePayer, ix);

  return {
    transaction,
    message: `Resolve room "${input.roomId}" — return SOL to both parties`,
    accounts: {
      escrowPDA: escrowPDA.toBase58(),
      creatorStakeRecord: creatorStakeRecordPDA.toBase58(),
      joinerStakeRecord: joinerStakeRecordPDA.toBase58(),
      creatorWallet: input.creatorWallet,
      joinerWallet: input.joinerWallet,
    },
  };
}

// ─── Slash ───────────────────────────────────────────────────────────────────

export interface BuildSlashTxInput {
  walletAddress: string;
  roomId: string;
  creatorParticipantId: string;
  joinerParticipantId: string;
}

/**
 * Build a `slash` transaction.
 * Sends ALL staked SOL to the penalty wallet. Both parties lose.
 */
export async function buildSlashTx(
  input: BuildSlashTxInput
): Promise<TransactionResult> {
  const connection = getConnection();
  const feePayer = new PublicKey(input.walletAddress);

  const roomHash = Array.from(hashString(input.roomId));
  const creatorParticipantHash = Array.from(hashString(input.creatorParticipantId));
  const joinerParticipantHash = Array.from(hashString(input.joinerParticipantId));
  const escrowPDA = getRoomEscrowPDA(input.roomId);
  const creatorStakeRecordPDA = getStakeRecordPDA(input.roomId, input.creatorParticipantId);
  const joinerStakeRecordPDA = getStakeRecordPDA(input.roomId, input.joinerParticipantId);

  const ix = buildRawInstruction(
    'slash',
    { roomHash, roomId: input.roomId, creatorParticipantHash, joinerParticipantHash },
    [
      { pubkey: escrowPDA, isWritable: true, isSigner: false },
      { pubkey: creatorStakeRecordPDA, isWritable: true, isSigner: false },
      { pubkey: joinerStakeRecordPDA, isWritable: true, isSigner: false },
      { pubkey: feePayer, isWritable: false, isSigner: true },
      { pubkey: PENALTY_WALLET, isWritable: true, isSigner: false },
    ]
  );

  const transaction = await buildUnsignedTx(connection, feePayer, ix);

  return {
    transaction,
    message: `Slash room "${input.roomId}" — all staked SOL sent to penalty wallet`,
    accounts: {
      escrowPDA: escrowPDA.toBase58(),
      creatorStakeRecord: creatorStakeRecordPDA.toBase58(),
      joinerStakeRecord: joinerStakeRecordPDA.toBase58(),
      penaltyWallet: PENALTY_WALLET.toBase58(),
    },
  };
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

export interface BuildCancelRoomTxInput {
  walletAddress: string;
  roomId: string;
  joinerWallet?: string;
}

/**
 * Build a `cancel_room` transaction.
 * Creator cancels the room before it's fully funded.
 */
export async function buildCancelRoomTx(
  input: BuildCancelRoomTxInput
): Promise<TransactionResult> {
  const connection = getConnection();
  const feePayer = new PublicKey(input.walletAddress);

  const roomHash = Array.from(hashString(input.roomId));
  const escrowPDA = getRoomEscrowPDA(input.roomId);

  // Anchor Option<AccountInfo> always requires the account slot;
  // pass the program ID as sentinel for None
  const joinerKey = input.joinerWallet
    ? new PublicKey(input.joinerWallet)
    : PROGRAM_ID;
  const keys: AccountMeta[] = [
    { pubkey: escrowPDA, isWritable: true, isSigner: false },
    { pubkey: feePayer, isWritable: true, isSigner: true },
    { pubkey: joinerKey, isWritable: true, isSigner: false },
  ];

  const ix = buildRawInstruction(
    'cancelRoom',
    { roomHash, roomId: input.roomId },
    keys
  );

  const transaction = await buildUnsignedTx(connection, feePayer, ix);

  return {
    transaction,
    message: `Cancel room "${input.roomId}"`,
    accounts: {
      escrowPDA: escrowPDA.toBase58(),
      creator: input.walletAddress,
      ...(input.joinerWallet ? { joinerWallet: input.joinerWallet } : {}),
    },
  };
}

// ─── Read Helpers ────────────────────────────────────────────────────────────

export interface OnChainRoomData {
  roomId: string;
  creator: string;
  joiner: string;
  creatorStakeAmount: number;
  joinerStakeAmount: number;
  creatorStaked: number;
  joinerStaked: number;
  totalStaked: number;
  isActive: boolean;
  isFullyFunded: boolean;
  creatorApprovedResolve: boolean;
  joinerApprovedResolve: boolean;
}

/**
 * Fetch on-chain escrow data for a room (read-only, no wallet needed).
 */
export async function fetchOnChainRoom(
  roomId: string
): Promise<OnChainRoomData | null> {
  try {
    const connection = getConnection();
    const program = getReadOnlyProgram(connection);
    const escrowPDA = getRoomEscrowPDA(roomId);
    const data = await program.account.roomEscrow.fetch(escrowPDA);

    return {
      roomId: data.roomId,
      creator: (data.creator as PublicKey).toBase58(),
      joiner: (data.joiner as PublicKey).toBase58(),
      creatorStakeAmount: (data.creatorStakeAmount as BN).toNumber() / LAMPORTS_PER_SOL,
      joinerStakeAmount: (data.joinerStakeAmount as BN).toNumber() / LAMPORTS_PER_SOL,
      creatorStaked: (data.creatorStaked as BN).toNumber() / LAMPORTS_PER_SOL,
      joinerStaked: (data.joinerStaked as BN).toNumber() / LAMPORTS_PER_SOL,
      totalStaked: (data.totalStaked as BN).toNumber() / LAMPORTS_PER_SOL,
      isActive: data.isActive,
      isFullyFunded: data.isFullyFunded,
      creatorApprovedResolve: data.creatorApprovedResolve,
      joinerApprovedResolve: data.joinerApprovedResolve,
    };
  } catch {
    return null;
  }
}

/**
 * Submit a signed transaction to the network.
 * Accepts base64-encoded signed transaction.
 */
export async function submitSignedTransaction(
  signedTxBase64: string
): Promise<{ signature: string; confirmationStatus: string }> {
  const connection = getConnection();
  const txBuffer = Buffer.from(signedTxBase64, 'base64');

  // Try versioned first, fall back to legacy
  let signature: string;
  try {
    const vtx = VersionedTransaction.deserialize(txBuffer);
    signature = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
  } catch {
    const tx = Transaction.from(txBuffer);
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
  }

  // Wait for confirmation
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');

  return {
    signature,
    confirmationStatus: confirmation.value.err ? 'failed' : 'confirmed',
  };
}
