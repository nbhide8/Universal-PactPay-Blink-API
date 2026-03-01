'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction, Connection } from '@solana/web3.js';
import Link from 'next/link';
import {
  getRoom,
  stakeRoom,
  approveRoom,
  resolveRoom,
  slashRoom,
  cancelRoom,
  submitTransaction,
  buildAuthMessage,
  type Room,
  type LockboxResult,
} from '@/lib/api';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Waiting for Worker', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '⏳' },
  awaiting_approval: { label: 'Awaiting Approval', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '📋' },
  funding: { label: 'Staking Phase', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '💰' },
  active: { label: 'Work in Progress', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: '🔨' },
  resolved: { label: 'Resolved — Complete', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '✅' },
  slashed: { label: 'Slashed', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '⚠️' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: '🚫' },
};

function RoomDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.roomId as string;
  const { publicKey, signTransaction, signMessage, connected } = useWallet();

  const [room, setRoom] = useState<Room | null>(null);
  const [onChain, setOnChain] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [txSignature, setTxSignature] = useState('');

  // Show creation/join banners
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
    }
  }, [roomId]);

  useEffect(() => { fetchRoom(); }, [fetchRoom]);

  // Auto-refresh every 10s  
  useEffect(() => {
    const interval = setInterval(fetchRoom, 10000);
    return () => clearInterval(interval);
  }, [fetchRoom]);

  const wallet = publicKey?.toBase58();
  const isCreator = room?.creator_id === wallet;
  const isJoiner = room?.joiner_id === wallet;
  const isParticipant = isCreator || isJoiner;

  /**
   * Handle a lockbox result from the API:
   * - Custodial mode: action handled server-side, just refresh
   * - Direct mode: sign the unsigned transaction and submit
   */
  async function handleLockbox(lockbox: LockboxResult, actionName: string, metadata?: Record<string, any>) {
    if (lockbox.mode === 'custodial') {
      setSuccess(`${actionName} completed (custodial mode)`);
      await fetchRoom();
      return;
    }

    // Direct mode — we need to sign the transaction
    if (!lockbox.action.payload) {
      setSuccess(`${actionName} completed`);
      await fetchRoom();
      return;
    }

    if (!signTransaction) {
      throw new Error('Wallet does not support transaction signing');
    }

    // Deserialize the base64 unsigned transaction
    const txBytes = Buffer.from(lockbox.action.payload, 'base64');
    const tx = Transaction.from(txBytes);

    // Sign with wallet
    const signed = await signTransaction(tx);
    const signedBase64 = Buffer.from(signed.serialize()).toString('base64');

    // Submit via API
    const result = await submitTransaction({
      signedTransaction: signedBase64,
      roomId,
      action: actionName.toLowerCase(),
      walletAddress: wallet,
      metadata,
    });

    setTxSignature(result.signature);
    setSuccess(`${actionName} confirmed! Tx: ${result.signature.slice(0, 8)}...`);
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
        await fetchRoom();
      }
    } catch (err: any) {
      setError(err.message || `${actionName} failed`);
    } finally {
      setActionLoading('');
    }
  }

  // Build optional signature auth for an action
  async function buildSigParams(action: string): Promise<{ signature?: string; message?: string }> {
    if (!signMessage || !publicKey) return {};
    try {
      const msg = buildAuthMessage(action, roomId);
      const encoded = new TextEncoder().encode(msg);
      const sig = await signMessage(encoded);
      return {
        message: msg,
        signature: Buffer.from(sig).toString('base64'),
      };
    } catch {
      // User declined signing — still try without signature
      return {};
    }
  }

  const doStake = async (asCreator: boolean) => {
    handleAction('Stake', async () => {
      const sig = await buildSigParams('stake');
      return stakeRoom(roomId, { walletAddress: wallet!, isCreator: asCreator, ...sig });
    }, { isCreator: asCreator });
  };

  const doApprove = () => handleAction('Approve', async () => {
    const sig = await buildSigParams('approve');
    return approveRoom(roomId, { walletAddress: wallet!, ...sig });
  });

  const doResolve = () => handleAction('Resolve', async () => {
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
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Banners */}
        {justCreated && joinCode && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-green-400 mb-2">🎉 Job Created!</h3>
            <p className="text-gray-300 mb-3">Share this code with a worker to accept the job:</p>
            <div className="bg-gray-900 rounded-lg p-4 text-center">
              <span className="text-3xl font-mono font-bold text-amber-400 tracking-widest">{joinCode}</span>
            </div>
          </div>
        )}
        {justJoined && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
            <p className="text-blue-400 font-medium">🤝 You've accepted this job! Review the terms and stake SOL to begin.</p>
          </div>
        )}

        {/* Error / Success */}
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
            {/* Stake Summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">💰 Escrow Summary</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Bounty (Creator)</p>
                  <p className="text-xl font-bold text-amber-400">{room.creator_stake_amount} SOL</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Worker Stake</p>
                  <p className="text-xl font-bold text-blue-400">{room.joiner_stake_amount} SOL</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Total Locked</p>
                  <p className="text-xl font-bold text-green-400">{(room.creator_stake_amount + room.joiner_stake_amount).toFixed(4)} SOL</p>
                </div>
              </div>
            </div>

            {/* Participants */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">👥 Participants</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-4">
                  <div>
                    <p className="text-sm text-gray-400">Job Poster</p>
                    <p className="font-mono text-sm text-white">{room.creator_id.slice(0, 8)}...{room.creator_id.slice(-8)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCreator && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">You</span>}
                    {room.creator_approved_terms && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Approved</span>}
                  </div>
                </div>
                {room.joiner_id ? (
                  <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-4">
                    <div>
                      <p className="text-sm text-gray-400">Worker</p>
                      <p className="font-mono text-sm text-white">{room.joiner_id.slice(0, 8)}...{room.joiner_id.slice(-8)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isJoiner && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">You</span>}
                      {room.joiner_approved_terms && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Approved</span>}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-800/30 rounded-lg p-4 text-center border border-dashed border-gray-700">
                    <p className="text-gray-500 text-sm">Waiting for a worker to accept...</p>
                    {room.join_code && isCreator && (
                      <p className="text-xs text-gray-600 mt-2">Join code: <span className="text-amber-400 font-mono">{room.join_code}</span></p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Terms / Conditions */}
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

          {/* Sidebar: Actions */}
          <div className="space-y-4">
            {!connected && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
                <p className="text-gray-400 text-sm mb-3">Connect wallet to take actions</p>
                <WalletMultiButton />
              </div>
            )}

            {connected && isParticipant && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">⚡ Actions</h3>
                <div className="space-y-3">

                  {/* Stake — for funding phase or when participants haven't staked */}
                  {['pending', 'funding', 'awaiting_approval'].includes(room.status) && (
                    <button onClick={() => doStake(isCreator)} disabled={!!actionLoading}
                      className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition flex items-center justify-center gap-2">
                      {actionLoading === 'Stake' ? <span className="animate-spin">⏳</span> : '💰'}
                      {actionLoading === 'Stake' ? 'Staking...' : `Stake ${isCreator ? room.creator_stake_amount : room.joiner_stake_amount} SOL`}
                    </button>
                  )}

                  {/* Approve — both parties must approve */}
                  {['active', 'funding', 'awaiting_approval'].includes(room.status) && (
                    <button onClick={doApprove} disabled={!!actionLoading}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition flex items-center justify-center gap-2">
                      {actionLoading === 'Approve' ? <span className="animate-spin">⏳</span> : '✅'}
                      {actionLoading === 'Approve' ? 'Approving...' : 'Approve Resolution'}
                    </button>
                  )}

                  {/* Resolve — after both approved */}
                  {room.status === 'active' && (
                    <button onClick={doResolve} disabled={!!actionLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition flex items-center justify-center gap-2">
                      {actionLoading === 'Resolve' ? <span className="animate-spin">⏳</span> : '🏁'}
                      {actionLoading === 'Resolve' ? 'Resolving...' : 'Resolve (Complete Job)'}
                    </button>
                  )}

                  {/* Slash */}
                  {['active', 'funding'].includes(room.status) && (
                    <button onClick={doSlash} disabled={!!actionLoading}
                      className="w-full bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition flex items-center justify-center gap-2">
                      {actionLoading === 'Slash' ? <span className="animate-spin">⏳</span> : '⚠️'}
                      {actionLoading === 'Slash' ? 'Slashing...' : 'Slash (Burn Stakes)'}
                    </button>
                  )}

                  {/* Cancel — creator can cancel if not fully funded */}
                  {['pending', 'funding'].includes(room.status) && isCreator && (
                    <button onClick={doCancel} disabled={!!actionLoading}
                      className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition flex items-center justify-center gap-2">
                      {actionLoading === 'Cancel' ? <span className="animate-spin">⏳</span> : '🚫'}
                      {actionLoading === 'Cancel' ? 'Cancelling...' : 'Cancel Job'}
                    </button>
                  )}
                </div>

                {/* Action descriptions */}
                <div className="mt-4 space-y-2 text-xs text-gray-500">
                  <p>💡 <strong>Approve:</strong> Signal that the work is done.</p>
                  <p>💡 <strong>Resolve:</strong> Release escrowed SOL to both parties.</p>
                  <p>💡 <strong>Slash:</strong> Burn ALL stakes. Both parties lose.</p>
                </div>
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
                {room.contract_deadline && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deadline</span>
                    <span className="text-gray-300">{new Date(room.contract_deadline).toLocaleDateString()}</span>
                  </div>
                )}
                {room.on_chain_address && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">On-Chain</span>
                    <a href={`https://explorer.solana.com/address/${room.on_chain_address}?cluster=devnet`}
                      target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 font-mono text-xs">
                      {room.on_chain_address.slice(0, 8)}...
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