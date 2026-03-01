/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct Mode Engine — Crypto-native users sign their own transactions
 *
 * This is the mode for users who HAVE a Solana wallet.
 * The API builds unsigned transactions and returns them as base64.
 * The user signs with their wallet and submits to /api/v1/tx/submit.
 *
 * This is the standard pattern used by Jupiter, Tensor, and other Solana APIs.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type {
  EscrowEngine,
  CreateLockboxParams,
  FundLockboxParams,
  ApproveParams,
  ResolveParams,
  SlashParams,
  CancelParams,
  GetStateParams,
  LockboxResult,
  LockboxState,
} from './types';
import {
  buildInitializeRoomTx,
  buildStakeTx,
  buildApproveResolveTx,
  buildResolveTx,
  buildSlashTx,
  buildCancelRoomTx,
  fetchOnChainRoom,
} from '@/lib/solana/transactions';

export class DirectEngine implements EscrowEngine {
  readonly mode = 'direct' as const;

  async createLockbox(params: CreateLockboxParams): Promise<LockboxResult> {
    const txResult = await buildInitializeRoomTx({
      walletAddress: params.creatorId,
      roomId: params.roomId,
      creatorStakeAmount: params.creatorStakeAmount,
      joinerStakeAmount: params.joinerStakeAmount,
    });

    return {
      mode: 'direct',
      blockchain: 'solana',
      onChain: true,
      action: {
        type: 'sign_transaction',
        payload: txResult.transaction,
        instructions:
          'Sign this Solana transaction with your wallet and submit to POST /api/v1/tx/submit',
        metadata: {
          accounts: txResult.accounts,
          message: txResult.message,
        },
      },
    };
  }

  async fundLockbox(params: FundLockboxParams): Promise<LockboxResult> {
    const txResult = await buildStakeTx({
      walletAddress: params.funderId,
      roomId: params.roomId,
      participantId: params.participantId,
      amount: params.amount,
      isCreator: params.isCreator,
    });

    return {
      mode: 'direct',
      blockchain: 'solana',
      onChain: true,
      action: {
        type: 'sign_transaction',
        payload: txResult.transaction,
        instructions: `Sign this transaction to stake ${params.amount} SOL into the escrow PDA`,
        metadata: {
          accounts: txResult.accounts,
          stakeAmountSol: params.amount,
        },
      },
    };
  }

  async approveLockbox(params: ApproveParams): Promise<LockboxResult> {
    const txResult = await buildApproveResolveTx({
      walletAddress: params.approverId,
      roomId: params.roomId,
    });

    return {
      mode: 'direct',
      blockchain: 'solana',
      onChain: true,
      action: {
        type: 'sign_transaction',
        payload: txResult.transaction,
        instructions: 'Sign this transaction to approve resolution on-chain',
        metadata: {
          accounts: txResult.accounts,
        },
      },
    };
  }

  async resolveLockbox(params: ResolveParams): Promise<LockboxResult> {
    const txResult = await buildResolveTx({
      walletAddress: params.callerAddress,
      roomId: params.roomId,
      creatorParticipantId: params.creatorParticipantId,
      joinerParticipantId: params.joinerParticipantId,
      creatorWallet: params.creatorAddress,
      joinerWallet: params.joinerAddress,
    });

    return {
      mode: 'direct',
      blockchain: 'solana',
      onChain: true,
      action: {
        type: 'sign_transaction',
        payload: txResult.transaction,
        instructions: 'Sign this transaction to resolve the escrow and return SOL to both parties',
        metadata: {
          accounts: txResult.accounts,
        },
      },
    };
  }

  async slashLockbox(params: SlashParams): Promise<LockboxResult> {
    const txResult = await buildSlashTx({
      walletAddress: params.callerAddress,
      roomId: params.roomId,
      creatorParticipantId: params.creatorParticipantId,
      joinerParticipantId: params.joinerParticipantId,
    });

    return {
      mode: 'direct',
      blockchain: 'solana',
      onChain: true,
      action: {
        type: 'sign_transaction',
        payload: txResult.transaction,
        instructions: 'Sign this transaction to slash the escrow — all SOL goes to the penalty wallet',
        metadata: {
          accounts: txResult.accounts,
        },
      },
    };
  }

  async cancelLockbox(params: CancelParams): Promise<LockboxResult> {
    const txResult = await buildCancelRoomTx({
      walletAddress: params.callerAddress,
      roomId: params.roomId,
      joinerWallet: params.joinerAddress,
    });

    return {
      mode: 'direct',
      blockchain: 'solana',
      onChain: true,
      action: {
        type: 'sign_transaction',
        payload: txResult.transaction,
        instructions: 'Sign this transaction to cancel the escrow room',
        metadata: {
          accounts: txResult.accounts,
        },
      },
    };
  }

  async getLockboxState(params: GetStateParams): Promise<LockboxState> {
    const onChain = await fetchOnChainRoom(params.roomId);

    if (!onChain) {
      return { mode: 'direct', blockchain: 'solana', exists: false };
    }

    return {
      mode: 'direct',
      blockchain: 'solana',
      exists: true,
      status: onChain.isActive ? 'active' : onChain.isFullyFunded ? 'funded' : 'created',
      creatorFunded: onChain.creatorStaked > 0,
      joinerFunded: onChain.joinerStaked > 0,
      creatorApproved: onChain.creatorApprovedResolve,
      joinerApproved: onChain.joinerApprovedResolve,
      totalLocked:
        (onChain.creatorStakeAmount || 0) + (onChain.joinerStakeAmount || 0),
      currency: 'SOL',
      raw: onChain,
    };
  }
}
