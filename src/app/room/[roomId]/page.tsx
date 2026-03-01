'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';
import Link from 'next/link';
import {
  getRoom,
  stakeRoom,
  markInterest,
  acceptJoiner,
  resolveApproveRoom,
  resolveRoom,
  slashRoom,
  cancelRoom,
  submitTransaction,
  buildAuthMessage,
  type Room,
  type LockboxResult,
} from '@/lib/api';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Setting Up', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '⏳' },
  open: { label: 'Open — Hiring', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '📢' },
  awaiting_joiner_stake: { label: 'Worker Staking', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '💰' },
  active: { label: 'Both Staked — Active', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: '🔨' },
  resolved: { label: 'Resolved', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '✅' },
  slashed: { label: 'Slashed', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '⚠️' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: '🚫' },
};

function RoomDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { publicKey, signTransaction, signMessage, connected } = useWallet();

  const [room, setRoom] = useState<Room | null>(null);
  const [onChain, setOnChain] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const justCreated = searchParams.get('created') === 'true';
  const justJoined = searchParams.get('joined') === 'true';
  const joinCode = searchParams.get('joinCode');

  const fetchRoom = useCallback(async () => {
    try {
      const data = await getRoom(roomId);
      setRoom(data.room);
      setOnChain(data.onChain);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roomId]);

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => { fetchRoom(); }, [fetchRoom]);

  // Auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(fetchRoom, 5000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  // After joining, re-fetch aggressively
  useEffect(() => {
    if (justJoined) {
      const t1 = setTimeout(fetchRoom, 500);
      const t2 = setTimeout(fetchRoom, 1500);
      const t3 = setTimeout(fetchRoom, 3000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [justJoined, fetchRoom]);

  // === Redirect away from resolved/cancelled/slashed rooms ===
  useEffect(() => {
    if (room && ['resolved', 'cancelled', 'slashed'].includes(room.status)) {
      // Give user time to see the tx link before redirecting
      const timer = setTimeout(() => {
        router.push('/browse');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [room, router]);

  const wallet = publicKey?.toBase58();

  // Participant detection
  const isCreator: boolean = !!wallet && room?.creator_wallet === wallet;
  const isJoiner: boolean = !!wallet && room?.joiner_wallet === wallet;
  const isParticipant = isCreator || isJoiner;
  const hasMarkedInterest = !!wallet && (room?.interested_wallets || []).includes(wallet);

  // Derived state
  const myFunded = isCreator ? !!room?.creator_funded : isJoiner ? !!room?.joiner_funded : false;
  const creatorFunded = !!room?.creator_funded;
  const joinerFunded = !!room?.joiner_funded;
  const bothStaked = creatorFunded && joinerFunded;
  const myResolveApproved = isCreator ? !!room?.creator_resolve_approved : !!room?.joiner_resolve_approved;
  const otherResolveApproved = isCreator ? !!room?.joiner_resolve_approved : !!room?.creator_resolve_approved;
  const interestedWallets = room?.interested_wallets || [];

  // === Workflow step computation ===
  // Creator: auto-staked at creation → wait for interest → accept joiner → wait for joiner stake → resolve → finalize
  // Joiner: mark interest → wait for acceptance → stake → resolve → wait for finalization
  type WorkflowStep = 'pending_init' | 'wait_interest' | 'accept_joiner' | 'wait_joiner_stake' | 'stake' | 'resolve' | 'finalize' | 'done' | 'mark_interest' | 'wait_acceptance';
  let currentStep: WorkflowStep = 'done';

  const bothApproved = !!room?.creator_resolve_approved && !!room?.joiner_resolve_approved;

  if (room && !['resolved', 'cancelled', 'slashed'].includes(room.status)) {
    if (isCreator) {
      if (room.status === 'pending') {
        currentStep = 'pending_init'; // Init+stake still in progress
      } else if (room.status === 'open' && interestedWallets.length === 0) {
        currentStep = 'wait_interest'; // Waiting for people to mark interest
      } else if (room.status === 'open' && interestedWallets.length > 0) {
        currentStep = 'accept_joiner'; // Has interested wallets, pick one
      } else if (room.status === 'awaiting_joiner_stake') {
        currentStep = 'wait_joiner_stake'; // Joiner needs to stake
      } else if (room.status === 'active' && !myResolveApproved) {
        currentStep = 'resolve'; // Both staked, approve resolution
      } else if (room.status === 'active' && bothApproved) {
        currentStep = 'finalize'; // Both approved, creator must sign on-chain resolve
      } else {
        currentStep = 'done'; // Waiting for other party
      }
    } else if (isJoiner) {
      if (room.status === 'awaiting_joiner_stake' && !joinerFunded) {
        currentStep = 'stake'; // Stake now
      } else if (room.status === 'active' && !myResolveApproved) {
        currentStep = 'resolve'; // Both staked, approve resolution
      } else if (room.status === 'active' && bothApproved) {
        currentStep = 'done'; // Waiting for creator to finalize
      } else {
        currentStep = 'done';
      }
    } else if (wallet) {
      // Non-participant — can mark interest if room is open
      if (room.status === 'open' && !hasMarkedInterest) {
        currentStep = 'mark_interest';
      } else if (hasMarkedInterest) {
        currentStep = 'wait_acceptance';
      }
    }
  }

  // === Action handlers ===

  async function handleLockbox(lockbox: LockboxResult, actionName: string, metadata?: Record<string, any>) {
    if (!lockbox.action.payload) {
      setSuccess(`${actionName} completed`);
      await fetchRoom();
      return;
    }
    if (!signTransaction) {
      throw new Error('Wallet does not support transaction signing');
    }
    const txBytes = Buffer.from(lockbox.action.payload, 'base64');
    const tx = Transaction.from(txBytes);
    const signed = await signTransaction(tx);
    const signedBase64 = Buffer.from(signed.serialize()).toString('base64');
    const result = await submitTransaction({
      signedTransaction: signedBase64,
      roomId,
      action: actionName.toLowerCase(),
      walletAddress: wallet,
      metadata,
    });
    setTxSignature(result.signature);
    setSuccess(`${actionName} confirmed! Tx: ${result.signature.slice(0, 8)}...`);
    // Immediate refresh after transaction
    await fetchRoom();
  }

  async function handleAction(actionName: string, fn: () => Promise<any>, metadata?: Record<string, any>) {
    setActionLoading(actionName);
    setError('');
    setSuccess('');
    try {
      const result = await fn();
      if (result?.lockbox) {
        await handleLockbox(result.lockbox, actionName, metadata);
      } else {
        setSuccess(`${actionName} completed`);
        // Immediate refresh after any action
        await fetchRoom();
      }
      // Extra refresh after a short delay to catch DB propagation
      setTimeout(fetchRoom, 1000);
      setTimeout(fetchRoom, 3000);
    } catch (err: any) {
      setError(err.message || `${actionName} failed`);
    } finally {
      setActionLoading('');
    }
  }

  async function buildSigParams(action: string): Promise<{ signature?: string; message?: string }> {
    if (!signMessage || !publicKey) return {};
    try {
      const msg = buildAuthMessage(action, roomId);
      const encoded = new TextEncoder().encode(msg);
      const sig = await signMessage(encoded);
      return { message: msg, signature: Buffer.from(sig).toString('base64') };
    } catch {
      return {};
    }
  }

  const doStake = async (asCreator: boolean) => {
    handleAction('Stake', async () => {
      const sig = await buildSigParams('stake');
      return stakeRoom(roomId, { walletAddress: wallet!, isCreator: asCreator, ...sig });
    }, { isCreator: asCreator });
  };

  const doMarkInterest = () => handleAction('MarkInterest', async () => {
    return markInterest(roomId, { walletAddress: wallet! });
  });

  const doAcceptJoiner = (joinerWallet: string) => handleAction('AcceptJoiner', async () => {
    return acceptJoiner(roomId, { walletAddress: wallet!, joinerWallet });
  });

  const doResolveApprove = () => handleAction('ResolveApprove', async () => {
    return resolveApproveRoom(roomId, { walletAddress: wallet! });
  });

  // Finalize resolution on-chain: calls /resolve to get unsigned tx,
  // signs it (creator only — includes reward transfer), submits
  const doFinalizeResolve = () => handleAction('Resolve', async () => {
    const sig = await buildSigParams('resolve');
    return resolveRoom(roomId, { walletAddress: wallet!, ...sig });
  });

  const doSlash = () => handleAction('Slash', async () => {
    const sig = await buildSigParams('slash');
    return slashRoom(roomId, { walletAddress: wallet!, ...sig });
  });

  const doCancel = () => handleAction('Cancel', async () => {
    const sig = await buildSigParams('cancel');
    return cancelRoom(roomId, { walletAddress: wallet!, ...sig });
  });

  // === Loading ===
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-400">Loading room...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold mb-2">Room not found</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <Link href="/browse" className="text-amber-400 hover:text-amber-300">← Back to Jobs</Link>
        </div>
      </div>
    );
  }

  // === Resolved/cancelled/slashed — show goodbye screen ===
  if (['resolved', 'cancelled', 'slashed'].includes(room.status)) {
    const cfg = STATUS_CONFIG[room.status] || STATUS_CONFIG.resolved;
    const resolutionTxSig = room.metadata?.resolution_tx_sig || txSignature;
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">{cfg.icon}</div>
          <h2 className="text-2xl font-bold mb-2">{room.title}</h2>
          <p className="text-lg text-gray-300 mb-2">{cfg.label}</p>
          {room.status === 'resolved' && (
            <>
              <p className="text-emerald-400 text-sm mb-2">Contract successfully resolved! Both parties&apos; stakes have been released.</p>
              {room.reward_amount > 0 && (
                <p className="text-amber-400 text-sm mb-4">💰 {room.reward_amount} SOL reward transferred to the worker.</p>
              )}
            </>
          )}
          {room.status === 'slashed' && (
            <p className="text-red-400 text-sm mb-4">Stakes were burned. Both parties lost their collateral.</p>
          )}
          {room.status === 'cancelled' && (
            <p className="text-gray-400 text-sm mb-4">This job was cancelled.</p>
          )}
          {resolutionTxSig && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
              <p className="text-gray-400 text-xs mb-2">Solana Transaction</p>
              <a
                href={`https://explorer.solana.com/tx/${resolutionTxSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300 font-mono text-sm break-all underline"
              >
                {resolutionTxSig.slice(0, 20)}...{resolutionTxSig.slice(-8)}
              </a>
              <p className="text-gray-500 text-xs mt-1">View on Solana Explorer →</p>
            </div>
          )}
          <p className="text-gray-500 text-xs mb-6">Redirecting to browse...</p>
          <Link href="/browse" className="text-amber-400 hover:text-amber-300 font-medium">← Back to Jobs</Link>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[room.status] || { label: room.status, color: 'bg-gray-500/20 text-gray-400', icon: '❓' };

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-amber-400 hover:text-amber-300">PackedPay</Link>
            <span className="text-gray-500">|</span>
            <Link href="/browse" className="text-gray-400 hover:text-white text-sm">← Jobs</Link>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={doRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition"
              title="Refresh room data"
            >
              <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Error / Success banners */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6">
            <p className="text-emerald-400 text-sm">{success}</p>
            {txSignature && (
              <a href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank" rel="noopener noreferrer" className="text-xs text-violet-400 hover:text-violet-300 mt-1 block">
                View on Solana Explorer →
              </a>
            )}
          </div>
        )}

        {/* justCreated banner — share code */}
        {justCreated && joinCode && isCreator && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-green-400 mb-2">📤 Share the Join Code</h3>
            <p className="text-gray-300 text-sm mb-3">Give this code to a worker so they can join:</p>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <span className="text-3xl font-mono font-bold text-amber-400 tracking-widest">{joinCode}</span>
            </div>
          </div>
        )}

        {/* justJoined fallback */}
        {justJoined && !isJoiner && !isCreator && (
          <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-amber-300 mb-2">🤝 You&apos;ve accepted this job!</h3>
            <p className="text-gray-300 text-sm mb-3">Loading your participant data...</p>
            <button onClick={() => fetchRoom()} disabled={loading}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2">
              {loading ? <><span className="animate-spin">⏳</span> Loading...</> : <>🔄 Refresh</>}
            </button>
          </div>
        )}

        {/* Room Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{room.title}</h1>
            {room.description && <p className="text-gray-400 max-w-2xl">{room.description}</p>}
            {room.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {room.tags.map((tag) => <span key={tag} className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-400">{tag}</span>)}
              </div>
            )}
          </div>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm ${statusCfg.color}`}>
            <span>{statusCfg.icon}</span>
            <span className="font-medium">{statusCfg.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Escrow Summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">💰 Escrow Summary</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">🏆 Reward</p>
                  <p className="text-xl font-bold text-amber-400">{room.reward_amount} SOL</p>
                  <p className="text-xs text-gray-500 mt-1">Paid to worker on resolve</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Creator Stake</p>
                  <p className="text-xl font-bold text-purple-400">{room.creator_stake_amount} SOL</p>
                  <p className={`text-xs mt-1 ${creatorFunded ? 'text-green-400' : 'text-gray-500'}`}>
                    {creatorFunded ? '✅ Staked' : '⏳ Not staked'}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Worker Stake</p>
                  <p className="text-xl font-bold text-blue-400">{room.joiner_stake_amount} SOL</p>
                  <p className={`text-xs mt-1 ${joinerFunded ? 'text-green-400' : 'text-gray-500'}`}>
                    {joinerFunded ? '✅ Staked' : '⏳ Not staked'}
                  </p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total in Escrow</p>
                  <p className="text-xl font-bold text-green-400">{(room.creator_stake_amount + room.reward_amount + room.joiner_stake_amount).toFixed(4)} SOL</p>
                </div>
              </div>
              <div className="mt-3 bg-gray-800/30 rounded-lg p-3">
                <p className="text-xs text-gray-500">
                  💡 Creator deposits <span className="text-purple-400">{room.creator_stake_amount} SOL</span> stake + <span className="text-amber-400">{room.reward_amount} SOL</span> reward = <span className="text-white font-medium">{(room.creator_stake_amount + room.reward_amount).toFixed(4)} SOL</span> total.
                  On resolve: creator gets <span className="text-purple-400">{room.creator_stake_amount} SOL</span> back, worker gets <span className="text-blue-400">{room.joiner_stake_amount} SOL</span> + <span className="text-amber-400">{room.reward_amount} SOL</span> reward.
                </p>
              </div>
            </div>

            {/* Participants */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">👥 Participants</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-4">
                  <div>
                    <p className="text-sm text-gray-400">Job Poster</p>
                    <p className="font-mono text-sm text-white">{room.creator_wallet ? `${room.creator_wallet.slice(0, 6)}...${room.creator_wallet.slice(-4)}` : 'Unknown'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCreator && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">You</span>}
                    {creatorFunded && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Staked ✓</span>}
                    {room.creator_resolve_approved && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Resolved ✓</span>}
                  </div>
                </div>
                {room.joiner_wallet ? (
                  <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-4">
                    <div>
                      <p className="text-sm text-gray-400">Worker</p>
                      <p className="font-mono text-sm text-white">{room.joiner_wallet.slice(0, 6)}...{room.joiner_wallet.slice(-4)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isJoiner && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">You</span>}
                      {joinerFunded && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Staked ✓</span>}
                      {room.joiner_resolve_approved && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Resolved ✓</span>}
                    </div>
                  </div>
                ) : interestedWallets.length > 0 ? (
                  <div className="bg-gray-800/30 rounded-lg p-4 border border-dashed border-gray-700">
                    <p className="text-amber-400 text-sm font-medium mb-2">🙋 {interestedWallets.length} interested worker{interestedWallets.length > 1 ? 's' : ''}</p>
                    <div className="space-y-1">
                      {interestedWallets.map((w: string) => (
                        <p key={w} className="font-mono text-xs text-gray-400">{w.slice(0,6)}...{w.slice(-4)}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-800/30 rounded-lg p-4 text-center border border-dashed border-gray-700">
                    <p className="text-gray-500 text-sm">Waiting for workers to mark interest...</p>
                    {room.join_code && isCreator && (
                      <p className="text-xs text-gray-600 mt-2">Join code: <span className="text-amber-400 font-mono font-bold">{room.join_code}</span></p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Contract Terms */}
            {room.terms && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">📋 Contract Terms</h3>
                {room.terms.summary && <p className="text-gray-400 text-sm mb-4">{room.terms.summary}</p>}
                {room.terms.conditions?.length > 0 && (
                  <div className="space-y-2">
                    {room.terms.conditions.map((cond: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                        <span className="text-sm mt-0.5">{cond.required ? '✅' : '⬜'}</span>
                        <div>
                          <p className="text-sm text-white">{cond.description}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{cond.type} {cond.required ? '(required)' : '(optional)'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* On-chain Status */}
            {onChain && (
              <div className="bg-gray-900 border border-violet-800/30 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4 text-violet-300">⛓️ On-Chain Escrow</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Status: </span><span className="text-white">{onChain.status}</span></div>
                  <div><span className="text-gray-500">Creator Funded: </span><span className={onChain.creatorFunded ? 'text-green-400' : 'text-gray-500'}>{onChain.creatorFunded ? 'Yes' : 'No'}</span></div>
                  <div><span className="text-gray-500">Joiner Funded: </span><span className={onChain.joinerFunded ? 'text-green-400' : 'text-gray-500'}>{onChain.joinerFunded ? 'Yes' : 'No'}</span></div>
                  {onChain.escrowBalance !== undefined && <div><span className="text-gray-500">Escrow Balance: </span><span className="text-amber-400">{onChain.escrowBalance} SOL</span></div>}
                </div>
              </div>
            )}
          </div>

          {/* ============ SIDEBAR: ACTIONS ============ */}
          <div className="space-y-4">
            {!connected && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
                <p className="text-gray-400 text-sm mb-3">Connect wallet to take actions</p>
                <WalletMultiButton />
              </div>
            )}

            {/* === WORKFLOW ACTIONS === */}
            {connected && wallet && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">⚡ Workflow</h3>

                {/* ── Progress tracker ── */}
                <div className="space-y-2 mb-5">
                  {isCreator ? (
                    <>
                      <StepChip label="1. Staked SOL" done={creatorFunded} active={currentStep === 'pending_init'} />
                      <StepChip label="2. Accept a worker" done={!!room.joiner_wallet} active={currentStep === 'wait_interest' || currentStep === 'accept_joiner'} />
                      <StepChip label="3. Worker stakes" done={bothStaked} active={currentStep === 'wait_joiner_stake'} />
                      <StepChip label="4. Approve resolution" done={myResolveApproved} active={currentStep === 'resolve'} />
                      <StepChip label="5. Finalize on-chain" done={room.status === 'resolved'} active={currentStep === 'finalize'} />
                    </>
                  ) : isJoiner ? (
                    <>
                      <StepChip label="1. Accepted by creator" done={true} active={false} />
                      <StepChip label="2. Stake your SOL" done={joinerFunded} active={currentStep === 'stake'} />
                      <StepChip label="3. Approve resolution" done={myResolveApproved} active={currentStep === 'resolve'} />
                      <StepChip label="4. Creator finalizes" done={room.status === 'resolved'} active={bothApproved && room.status === 'active'} />
                    </>
                  ) : (
                    <>
                      <StepChip label="1. Mark interest" done={hasMarkedInterest} active={currentStep === 'mark_interest'} />
                      <StepChip label="2. Wait for acceptance" done={false} active={currentStep === 'wait_acceptance'} />
                    </>
                  )}
                </div>

                {/* ── Current action ── */}
                <div className="space-y-3">
                  {/* CREATOR: pending init */}
                  {isCreator && currentStep === 'pending_init' && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
                      <p className="text-yellow-400 text-sm font-medium">⏳ Room initialization in progress...</p>
                    </div>
                  )}

                  {/* CREATOR: Waiting for interest */}
                  {isCreator && currentStep === 'wait_interest' && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                      <p className="text-blue-400 text-sm font-medium mb-2">📢 Your room is live! Waiting for workers to express interest.</p>
                      {room.join_code && (
                        <div className="mt-2">
                          <p className="text-gray-400 text-xs mb-1">Share this join code:</p>
                          <span className="text-2xl font-mono font-bold text-amber-400 tracking-widest">{room.join_code}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CREATOR: Accept a joiner from interested list */}
                  {isCreator && currentStep === 'accept_joiner' && (
                    <div className="space-y-3">
                      <p className="text-amber-400 text-sm font-medium">🙋 {interestedWallets.length} worker{interestedWallets.length > 1 ? 's' : ''} interested — pick one:</p>
                      {interestedWallets.map((w: string) => (
                        <div key={w} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                          <span className="font-mono text-xs text-gray-300">{w.slice(0,6)}...{w.slice(-4)}</span>
                          <button onClick={() => doAcceptJoiner(w)} disabled={!!actionLoading}
                            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition">
                            {actionLoading === 'AcceptJoiner' ? '...' : 'Accept'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CREATOR: Waiting for joiner to stake */}
                  {isCreator && currentStep === 'wait_joiner_stake' && (
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 text-center">
                      <p className="text-purple-400 text-sm font-medium">⏳ Waiting for worker to stake {room.joiner_stake_amount} SOL...</p>
                    </div>
                  )}

                  {/* JOINER: Stake */}
                  {isJoiner && currentStep === 'stake' && (
                    <button onClick={() => doStake(false)} disabled={!!actionLoading}
                      className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-3 rounded-lg font-bold transition flex items-center justify-center gap-2">
                      {actionLoading === 'Stake' ? <><span className="animate-spin">⏳</span> Staking...</> : <>💰 Stake {room.joiner_stake_amount} SOL</>}
                    </button>
                  )}

                  {/* NON-PARTICIPANT: Mark interest */}
                  {!isParticipant && currentStep === 'mark_interest' && (
                    <button onClick={doMarkInterest} disabled={!!actionLoading}
                      className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white py-3 rounded-lg font-bold transition flex items-center justify-center gap-2">
                      {actionLoading === 'MarkInterest' ? <><span className="animate-spin">⏳</span> Marking...</> : <>🙋 Mark Interest</>}
                    </button>
                  )}

                  {/* NON-PARTICIPANT: Waiting for acceptance */}
                  {!isParticipant && currentStep === 'wait_acceptance' && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                      <p className="text-amber-400 text-sm font-medium">🙋 You&apos;ve expressed interest!</p>
                      <p className="text-gray-400 text-xs mt-1">Waiting for the creator to accept you...</p>
                    </div>
                  )}

                  {/* BOTH PARTICIPANTS: Approve resolution */}
                  {currentStep === 'resolve' && (
                    <button onClick={doResolveApprove} disabled={!!actionLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-lg font-bold transition flex items-center justify-center gap-2">
                      {actionLoading === 'ResolveApprove' ? <><span className="animate-spin">⏳</span> Approving...</> : <>🏁 Approve Resolution</>}
                    </button>
                  )}

                  {/* CREATOR: Finalize resolution on-chain (sign resolve tx + reward transfer) */}
                  {isCreator && currentStep === 'finalize' && (
                    <div className="space-y-3">
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center">
                        <p className="text-emerald-400 text-sm font-medium mb-1">✅ Both parties approved!</p>
                        <p className="text-gray-400 text-xs">Sign the on-chain resolve transaction to release stakes and transfer the {room.reward_amount} SOL reward to the worker.</p>
                      </div>
                      <button onClick={doFinalizeResolve} disabled={!!actionLoading}
                        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white py-3 rounded-lg font-bold transition flex items-center justify-center gap-2">
                        {actionLoading === 'Resolve' ? <><span className="animate-spin">⏳</span> Finalizing...</> : <>🔏 Finalize Resolution On-Chain</>}
                      </button>
                    </div>
                  )}

                  {/* JOINER: Waiting for creator to finalize */}
                  {isJoiner && bothApproved && room.status === 'active' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center">
                      <p className="text-emerald-400 text-sm font-medium mb-1">✅ Both parties approved!</p>
                      <p className="text-amber-400 text-xs">Waiting for the creator to sign the on-chain resolve transaction...</p>
                    </div>
                  )}

                  {/* Waiting for other party resolution */}
                  {currentStep === 'done' && myResolveApproved && !otherResolveApproved && isParticipant && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center">
                      <p className="text-emerald-400 text-sm font-medium">✅ You approved resolution</p>
                      <p className="text-amber-400 text-xs mt-1">Waiting for the other party to approve...</p>
                    </div>
                  )}

                  {/* Resolution status chips */}
                  {bothStaked && (myResolveApproved || otherResolveApproved) && (
                    <div className="flex items-center gap-3 text-xs pt-1">
                      <span className={room.creator_resolve_approved ? 'text-green-400' : 'text-gray-500'}>
                        {room.creator_resolve_approved ? '✅' : '⏳'} Creator
                      </span>
                      <span className={room.joiner_resolve_approved ? 'text-green-400' : 'text-gray-500'}>
                        {room.joiner_resolve_approved ? '✅' : '⏳'} Worker
                      </span>
                    </div>
                  )}
                </div>

                {/* Destructive actions */}
                {isParticipant && (
                  <div className="mt-6 pt-4 border-t border-gray-800">
                    {room.status === 'active' && (
                      <button onClick={doSlash} disabled={!!actionLoading}
                        className="w-full bg-red-600/60 hover:bg-red-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2">
                        {actionLoading === 'Slash' ? <><span className="animate-spin">⏳</span> Slashing...</> : <>⚠️ Slash (Burn All Stakes)</>}
                      </button>
                    )}
                    {['pending', 'open', 'awaiting_joiner_stake'].includes(room.status) && isCreator && (
                      <button onClick={doCancel} disabled={!!actionLoading}
                        className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 mt-2">
                        {actionLoading === 'Cancel' ? <><span className="animate-spin">⏳</span> Cancelling...</> : <>🚫 Cancel Job</>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Room Info */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">ℹ️ Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Room ID</span>
                  <span className="text-gray-300 font-mono text-xs">{room.id.slice(0, 12)}...</span>
                </div>
                {room.join_code && isCreator && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Join Code</span>
                    <span className="text-amber-400 font-mono font-bold">{room.join_code}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-300">{new Date(room.created_at).toLocaleDateString()}</span>
                </div>
                {room.metadata?.contract_deadline && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deadline</span>
                    <span className="text-gray-300">{new Date(room.metadata.contract_deadline).toLocaleDateString()}</span>
                  </div>
                )}
                {room.metadata?.on_chain_address && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">On-Chain</span>
                    <a href={`https://explorer.solana.com/address/${room.metadata.on_chain_address}?cluster=devnet`}
                      target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 font-mono text-xs">
                      {room.metadata.on_chain_address.slice(0, 8)}...
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Step progress chip */
function StepChip({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-all ${
      done
        ? 'bg-green-800/30 text-green-400'
        : active
          ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300 font-medium'
          : 'bg-gray-800/30 text-gray-500'
    }`}>
      <span>{done ? '✅' : active ? '👉' : '⬜'}</span>
      <span>{label}</span>
    </div>
  );
}

export default function RoomDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin text-4xl">⏳</div>
      </div>
    }>
      <RoomDetailContent />
    </Suspense>
  );
}
