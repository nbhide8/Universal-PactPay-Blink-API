/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Custodial Mode Engine — Non-crypto users, same on-chain escrow
 *
 * This is the KEY innovation: users who don't know anything about crypto
 * can still use blockchain-backed escrow. The API handles everything.
 *
 * HOW IT WORKS:
 *   1. User creates room → API builds Solana tx → Platform wallet signs & submits
 *   2. User funds via Stripe (card) or credits (company balance)
 *   3. Once payment confirmed → Platform wallet stakes SOL into the on-chain PDA
 *   4. On resolve → Platform wallet signs resolve tx → SOL returns to platform
 *   5. API initiates fiat payout (Stripe refund, credit return, etc.)
 *
 * THE BLOCKCHAIN IS ALWAYS INVOLVED:
 *   Every escrow room has a real on-chain PDA with real SOL locked.
 *   The platform wallet acts as a custodial proxy — it's the on-chain
 *   identity for all non-crypto participants.
 *
 * PAYMENT RAILS (how fiat enters/exits):
 *   - "stripe":  Card/bank via Stripe PaymentIntents — real money
 *   - "credits": Company-managed balance — company handles money externally
 *
 * PLATFORM WALLET:
 *   The platform wallet must be funded with SOL. In production:
 *     - Stripe payments trigger a SOL purchase (Jupiter, exchange API)
 *     - Credit deposits are covered by the company's SOL treasury
 *     - Automated treasury management keeps the wallet funded
 *
 * ENV: PLATFORM_WALLET_SECRET required (see src/lib/solana/custodial.ts)
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
  PaymentRail,
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
import {
  getPlatformWalletAddress,
  custodialSignAndSubmit,
  isCustodialAvailable,
} from '@/lib/solana/custodial';

export class CustodialEngine implements EscrowEngine {
  readonly mode = 'custodial' as const;

  /**
   * Helper: determine client action based on payment rail.
   * Stripe → user needs to confirm payment on client side
   * Credits → instant, no client action needed
   */
  private fiatAction(
    rail: PaymentRail | undefined,
    amount: number,
    currency: string,
    roomId: string,
    role: string
  ): { type: 'confirm_payment' | 'none'; payload: string | null; instructions: string; metadata: Record<string, any> } {
    if (rail === 'stripe') {
      // In production: create real Stripe PaymentIntent here
      // const pi = await stripe.paymentIntents.create({ amount: Math.round(amount * 100), currency, ... });
      const mockClientSecret = `pi_${roomId.slice(0, 8)}_${role}_secret_demo`;
      return {
        type: 'confirm_payment',
        payload: mockClientSecret,
        instructions:
          `Confirm this Stripe PaymentIntent to deposit ${amount} ${currency}. ` +
          'Use stripe.confirmCardPayment(clientSecret). Once confirmed, the API will ' +
          'automatically stake the equivalent SOL on-chain via the platform wallet.',
        metadata: {
          amount,
          currency,
          captureMethod: 'manual',
          note: 'On payment confirmation, the webhook triggers automatic on-chain staking.',
        },
      };
    }

    // credits rail — instant, company manages their own money
    return {
      type: 'none',
      payload: null,
      instructions:
        `${amount} ${currency} recorded as ${role} deposit. ` +
        'The platform has staked the equivalent SOL on-chain. ' +
        'Your company should deduct this from the user\'s balance in your system.',
      metadata: {
        amount,
        currency,
        note: 'Credits-based deposit. Company handles real money externally; blockchain handles escrow.',
      },
    };
  }

  async createLockbox(params: CreateLockboxParams): Promise<LockboxResult> {
    if (!isCustodialAvailable()) {
      throw new Error(
        'Custodial mode requires PLATFORM_WALLET_SECRET. ' +
        'The platform wallet signs Solana transactions on behalf of non-crypto users.'
      );
    }

    const platformWallet = getPlatformWalletAddress();
    const rail = params.paymentRail || 'credits';
    const currency = params.currency || (rail === 'stripe' ? 'USD' : 'USD');

    // Build the Solana transaction using the PLATFORM wallet as creator
    const txResult = await buildInitializeRoomTx({
      walletAddress: platformWallet,
      roomId: params.roomId,
      creatorStakeAmount: params.creatorStakeAmount,
      joinerStakeAmount: params.joinerStakeAmount,
    });

    // Platform wallet signs and submits the transaction
    const { signature } = await custodialSignAndSubmit(txResult.transaction);

    // Determine what the user needs to do (pay via their rail)
    const fiatResult = this.fiatAction(
      rail,
      params.creatorStakeAmount,
      currency,
      params.roomId,
      'creator',
    );

    return {
      mode: 'custodial',
      blockchain: 'solana',
      onChain: true,
      paymentRail: rail,
      onChainSignature: signature,
      action: {
        type: fiatResult.type,
        payload: fiatResult.payload,
        instructions: fiatResult.instructions,
        metadata: {
          ...fiatResult.metadata,
          onChainSignature: signature,
          escrowPDA: txResult.accounts.escrowPDA,
          platformWallet,
        },
      },
    };
  }

  async fundLockbox(params: FundLockboxParams): Promise<LockboxResult> {
    if (!isCustodialAvailable()) {
      throw new Error('Custodial mode requires PLATFORM_WALLET_SECRET.');
    }

    const platformWallet = getPlatformWalletAddress();
    const rail = params.paymentRail || 'credits';
    const currency = params.currency || 'USD';

    // Build stake transaction using the PLATFORM wallet as the staker
    const txResult = await buildStakeTx({
      walletAddress: platformWallet,
      roomId: params.roomId,
      participantId: params.participantId,
      amount: params.amount,
      isCreator: params.isCreator,
    });

    // Platform wallet signs and submits
    const { signature } = await custodialSignAndSubmit(txResult.transaction);

    const role = params.isCreator ? 'creator' : 'joiner';
    const fiatResult = this.fiatAction(rail, params.amount, currency, params.roomId, role);

    return {
      mode: 'custodial',
      blockchain: 'solana',
      onChain: true,
      paymentRail: rail,
      onChainSignature: signature,
      action: {
        type: fiatResult.type,
        payload: fiatResult.payload,
        instructions: fiatResult.instructions,
        metadata: {
          ...fiatResult.metadata,
          onChainSignature: signature,
          stakeAmountSol: params.amount,
          platformWallet,
        },
      },
    };
  }

  async approveLockbox(params: ApproveParams): Promise<LockboxResult> {
    if (!isCustodialAvailable()) {
      throw new Error('Custodial mode requires PLATFORM_WALLET_SECRET.');
    }

    const platformWallet = getPlatformWalletAddress();

    // Platform wallet approves on-chain on behalf of the custodial user
    const txResult = await buildApproveResolveTx({
      walletAddress: platformWallet,
      roomId: params.roomId,
    });

    const { signature } = await custodialSignAndSubmit(txResult.transaction);

    return {
      mode: 'custodial',
      blockchain: 'solana',
      onChain: true,
      onChainSignature: signature,
      action: {
        type: 'none',
        payload: null,
        instructions:
          'Approval recorded on-chain. The platform wallet signed the approve transaction. ' +
          'No action needed from the user.',
        metadata: {
          onChainSignature: signature,
          approvedBy: params.approverId,
          platformWallet,
        },
      },
    };
  }

  async resolveLockbox(params: ResolveParams): Promise<LockboxResult> {
    if (!isCustodialAvailable()) {
      throw new Error('Custodial mode requires PLATFORM_WALLET_SECRET.');
    }

    const platformWallet = getPlatformWalletAddress();

    // Platform wallet resolves on-chain — SOL returns to platform wallet
    const txResult = await buildResolveTx({
      walletAddress: platformWallet,
      roomId: params.roomId,
      creatorParticipantId: params.creatorParticipantId,
      joinerParticipantId: params.joinerParticipantId,
      // In custodial mode, both parties' SOL returns to platform wallet
      creatorWallet: platformWallet,
      joinerWallet: platformWallet,
    });

    const { signature } = await custodialSignAndSubmit(txResult.transaction);

    return {
      mode: 'custodial',
      blockchain: 'solana',
      onChain: true,
      onChainSignature: signature,
      action: {
        type: 'none',
        payload: null,
        instructions:
          'Escrow resolved on-chain. SOL has been returned to the platform wallet. ' +
          'Initiate fiat payouts to both parties via your payment rail (Stripe refund, credit return, etc.).',
        metadata: {
          onChainSignature: signature,
          status: 'resolved',
          settlements: [
            { recipient: 'creator', recipientId: params.creatorAddress },
            { recipient: 'joiner', recipientId: params.joinerAddress },
          ],
          platformWallet,
          note: 'SOL returned to platform treasury. Process fiat payouts externally.',
        },
      },
    };
  }

  async slashLockbox(params: SlashParams): Promise<LockboxResult> {
    if (!isCustodialAvailable()) {
      throw new Error('Custodial mode requires PLATFORM_WALLET_SECRET.');
    }

    const platformWallet = getPlatformWalletAddress();

    // Platform wallet slashes on-chain — SOL goes to penalty wallet
    const txResult = await buildSlashTx({
      walletAddress: platformWallet,
      roomId: params.roomId,
      creatorParticipantId: params.creatorParticipantId,
      joinerParticipantId: params.joinerParticipantId,
    });

    const { signature } = await custodialSignAndSubmit(txResult.transaction);

    return {
      mode: 'custodial',
      blockchain: 'solana',
      onChain: true,
      onChainSignature: signature,
      action: {
        type: 'none',
        payload: null,
        instructions:
          'Escrow slashed on-chain. All SOL sent to the penalty wallet. ' +
          'Both parties forfeit their deposits. No fiat refunds should be issued.',
        metadata: {
          onChainSignature: signature,
          status: 'slashed',
          penaltyWallet: txResult.accounts.penaltyWallet,
          platformWallet,
          note: 'Both fiat deposits are now penalties. Handle in your billing system.',
        },
      },
    };
  }

  async cancelLockbox(params: CancelParams): Promise<LockboxResult> {
    if (!isCustodialAvailable()) {
      throw new Error('Custodial mode requires PLATFORM_WALLET_SECRET.');
    }

    const platformWallet = getPlatformWalletAddress();

    const txResult = await buildCancelRoomTx({
      walletAddress: platformWallet,
      roomId: params.roomId,
      // In custodial mode, both parties are represented by platform wallet
      joinerWallet: params.joinerAddress ? platformWallet : undefined,
    });

    const { signature } = await custodialSignAndSubmit(txResult.transaction);

    return {
      mode: 'custodial',
      blockchain: 'solana',
      onChain: true,
      onChainSignature: signature,
      action: {
        type: 'none',
        payload: null,
        instructions:
          'Escrow cancelled on-chain. Any staked SOL returned to platform wallet. ' +
          'Issue fiat refunds to participants who had funded.',
        metadata: {
          onChainSignature: signature,
          status: 'cancelled',
          platformWallet,
          note: 'Process fiat refunds via your payment rail (Stripe refund, credit return).',
        },
      },
    };
  }

  async getLockboxState(params: GetStateParams): Promise<LockboxState> {
    // Same on-chain state — the PDA exists for custodial rooms too
    const onChain = await fetchOnChainRoom(params.roomId);

    if (!onChain) {
      return { mode: 'custodial', blockchain: 'solana', exists: false };
    }

    return {
      mode: 'custodial',
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
