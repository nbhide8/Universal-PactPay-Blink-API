/**
 * Blink TypeScript SDK
 * Uses @coral-xyz/anchor Program client for type-safe, IDL-driven instruction calls.
 */
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { IDL } from './idl';
import { hashString, getRoomEscrowPDA, getStakeRecordPDA } from './pda';

// ─── Constants ───────────────────────────────────────────────────────────────

export const PROGRAM_ID = new PublicKey('4ixiwwbedA1p3s79zgPmqf9C2JKLJ1WkEDVtCw9yQSxf');
export const PENALTY_WALLET = new PublicKey('2c8QGXM2tRMh7yb1Zva48ZmQTPMmLZCu159x2hscxxwv');
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// ─── Anchor Program factory ───────────────────────────────────────────────────

/**
 * Build an Anchor Program instance from a wallet adapter wallet.
 * WalletContextState satisfies Anchor's Wallet interface
 * (publicKey + signTransaction + signAllTransactions).
 */
function getProgram(connection: Connection, wallet: WalletContextState): any {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: 'confirmed',
    skipPreflight: false,
  });
  return new Program(IDL as any, provider) as any;
}

// ─── initialize_room ─────────────────────────────────────────────────────────

export interface InitializeRoomParams {
  roomId: string;
  creatorPubkey: string;
  /** In SOL (not lamports) */
  creatorStakeAmount: number;
  /** In SOL (not lamports) */
  joinerStakeAmount: number;
  wallet: WalletContextState;
  connection: Connection;
}

export async function initializeRoom(params: InitializeRoomParams): Promise<string> {
  const { roomId, creatorPubkey, creatorStakeAmount, joinerStakeAmount, wallet, connection } =
    params;

  const program = getProgram(connection, wallet);
  const roomHash = Array.from(hashString(roomId));
  const escrowPDA = getRoomEscrowPDA(roomId);

  return program.methods
    .initializeRoom(
      roomHash as any,
      roomId,
      new PublicKey(creatorPubkey),
      new BN(creatorStakeAmount * LAMPORTS_PER_SOL),
      new BN(joinerStakeAmount * LAMPORTS_PER_SOL)
    )
    .accounts({
      escrowAccount: escrowPDA,
      initializer: wallet.publicKey!,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();
}

// ─── stake ───────────────────────────────────────────────────────────────────

export interface StakeParams {
  roomId: string;
  participantId: string;
  /** In SOL (not lamports) */
  amount: number;
  isCreator: boolean;
  wallet: WalletContextState;
  connection: Connection;
}

export async function stake(params: StakeParams): Promise<string> {
  const { roomId, participantId, amount, isCreator, wallet, connection } = params;

  const program = getProgram(connection, wallet);
  const roomHash = Array.from(hashString(roomId));
  const participantHash = Array.from(hashString(participantId));
  const escrowPDA = getRoomEscrowPDA(roomId);
  const stakeRecordPDA = getStakeRecordPDA(roomId, participantId);

  return program.methods
    .stake(
      roomHash as any,
      participantHash as any,
      roomId,
      participantId,
      new BN(amount * LAMPORTS_PER_SOL),
      isCreator
    )
    .accounts({
      escrowAccount: escrowPDA,
      stakeRecord: stakeRecordPDA,
      staker: wallet.publicKey!,
      systemProgram: SystemProgram.programId,
    } as any)
    .rpc();
}

// ─── approve_resolve ─────────────────────────────────────────────────────────

export interface ApproveResolveParams {
  roomId: string;
  wallet: WalletContextState;
  connection: Connection;
}

export async function approveResolve(params: ApproveResolveParams): Promise<string> {
  const { roomId, wallet, connection } = params;

  const program = getProgram(connection, wallet);
  const roomHash = Array.from(hashString(roomId));
  const escrowPDA = getRoomEscrowPDA(roomId);

  return program.methods
    .approveResolve(roomHash as any, roomId)
    .accounts({
      escrowAccount: escrowPDA,
      signer: wallet.publicKey!,
    } as any)
    .rpc();
}

// ─── resolve ─────────────────────────────────────────────────────────────────

export interface ResolveParams {
  roomId: string;
  creatorParticipantId: string;
  joinerParticipantId: string;
  creatorWallet: string;
  joinerWallet: string;
  wallet: WalletContextState;
  connection: Connection;
}

export async function resolve(params: ResolveParams): Promise<string> {
  const {
    roomId,
    creatorParticipantId,
    joinerParticipantId,
    creatorWallet,
    joinerWallet,
    wallet,
    connection,
  } = params;

  const program = getProgram(connection, wallet);
  const roomHash = Array.from(hashString(roomId));
  const creatorParticipantHash = Array.from(hashString(creatorParticipantId));
  const joinerParticipantHash = Array.from(hashString(joinerParticipantId));
  const escrowPDA = getRoomEscrowPDA(roomId);
  const creatorStakeRecordPDA = getStakeRecordPDA(roomId, creatorParticipantId);
  const joinerStakeRecordPDA = getStakeRecordPDA(roomId, joinerParticipantId);

  return program.methods
    .resolve(
      roomHash as any,
      roomId,
      creatorParticipantHash as any,
      joinerParticipantHash as any
    )
    .accounts({
      escrowAccount: escrowPDA,
      creatorStakeRecord: creatorStakeRecordPDA,
      joinerStakeRecord: joinerStakeRecordPDA,
      signer: wallet.publicKey!,
      creatorWallet: new PublicKey(creatorWallet),
      joinerWallet: new PublicKey(joinerWallet),
    } as any)
    .rpc();
}

// ─── slash ───────────────────────────────────────────────────────────────────

export interface SlashParams {
  roomId: string;
  creatorParticipantId: string;
  joinerParticipantId: string;
  wallet: WalletContextState;
  connection: Connection;
}

export async function slash(params: SlashParams): Promise<string> {
  const { roomId, creatorParticipantId, joinerParticipantId, wallet, connection } = params;

  const program = getProgram(connection, wallet);
  const roomHash = Array.from(hashString(roomId));
  const creatorParticipantHash = Array.from(hashString(creatorParticipantId));
  const joinerParticipantHash = Array.from(hashString(joinerParticipantId));
  const escrowPDA = getRoomEscrowPDA(roomId);
  const creatorStakeRecordPDA = getStakeRecordPDA(roomId, creatorParticipantId);
  const joinerStakeRecordPDA = getStakeRecordPDA(roomId, joinerParticipantId);

  return program.methods
    .slash(
      roomHash as any,
      roomId,
      creatorParticipantHash as any,
      joinerParticipantHash as any
    )
    .accounts({
      escrowAccount: escrowPDA,
      creatorStakeRecord: creatorStakeRecordPDA,
      joinerStakeRecord: joinerStakeRecordPDA,
      slasher: wallet.publicKey!,
      penaltyWallet: PENALTY_WALLET,
    } as any)
    .rpc();
}

// ─── cancel_room ─────────────────────────────────────────────────────────────

export interface CancelRoomParams {
  roomId: string;
  joinerWallet?: string;
  wallet: WalletContextState;
  connection: Connection;
}

export async function cancelRoom(params: CancelRoomParams): Promise<string> {
  const { roomId, joinerWallet, wallet, connection } = params;

  const program = getProgram(connection, wallet);
  const roomHash = Array.from(hashString(roomId));
  const escrowPDA = getRoomEscrowPDA(roomId);

  return program.methods
    .cancelRoom(roomHash as any, roomId)
    .accounts({
      escrowAccount: escrowPDA,
      creator: wallet.publicKey!,
      ...(joinerWallet ? { joinerWallet: new PublicKey(joinerWallet) } : {}),
    } as any)
    .rpc();
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export interface RoomEscrowData {
  roomId: string;
  creator: string;
  joiner: string;
  creatorStakeAmount: number; // in SOL
  joinerStakeAmount: number;  // in SOL
  creatorStaked: number;      // in SOL
  joinerStaked: number;       // in SOL
  totalStaked: number;        // in SOL
  isActive: boolean;
  isFullyFunded: boolean;
  creatorApprovedResolve: boolean;
  joinerApprovedResolve: boolean;
}

export async function fetchRoomEscrow(
  roomId: string,
  wallet: WalletContextState,
  connection: Connection
): Promise<RoomEscrowData | null> {
  try {
    const program = getProgram(connection, wallet);
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
