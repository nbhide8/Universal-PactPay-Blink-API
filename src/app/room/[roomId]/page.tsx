'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';
import {
  initializeRoom,
  stake,
  approveResolve,
  resolve as resolveEscrow,
  slash as slashEscrow,
  cancelRoom as cancelEscrowOnChain,
} from '@/lib/solana/escrow';
import ChatPanel from './ChatPanel';

// --- Types used within this page ---
interface RoomView {
  id: string;
  title: string;
  description: string | null;
  join_code: string;
  status: string;
  creator_id: string;
  joiner_id: string | null;
  creator_stake_amount: number;
  joiner_stake_amount: number;
  on_chain_address: string | null;
  contract_deadline: string | null;
  created_at: string;
  creator_wallet: string;
  joiner_wallet: string | null;
  terms: any | null;
  conditions: any[];
  creator_approved_terms: boolean;
  joiner_approved_terms: boolean;
  stakes: any[];
}

type ModalAction = 'approve_terms' | 'stake' | 'resolve' | 'slash' | 'cancel' | null;

export default function RoomPage() {
  const { publicKey, connected, ...walletRest } = useWallet();
  const wallet = { publicKey, connected, ...walletRest };
  const { connection } = useConnection();
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.roomId as string;
  const showJoinCode = searchParams.get('joinCode');

  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeModal, setActiveModal] = useState<ModalAction>(null);
  const [showChat, setShowChat] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const myWallet = publicKey?.toBase58();
  const isCreator = room?.creator_id === myWallet;
  const isJoiner = room?.joiner_id === myWallet;

  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/api/v1/rooms/${roomId}?userId=${myWallet}`));
      if (!res.ok) throw new Error('Failed to load room');
      const data = await res.json();
      setRoom(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId, myWallet]);

  useEffect(() => {
    if (myWallet) fetchRoom();
  }, [fetchRoom, myWallet]);

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (!myWallet) return;
    const interval = setInterval(fetchRoom, 10000);
    return () => clearInterval(interval);
  }, [fetchRoom, myWallet]);

  const handleAction = async (action: string, payload?: any) => {
    if (!publicKey || !room) return;
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      if (action === 'approve_terms') {
        const res = await fetch(apiUrl(`/api/v1/rooms/${roomId}`), {
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
        setSuccess('Terms approved!');
      } else if (action === 'init_and_stake') {
        // Initialize the room on-chain
        const sig1 = await initializeRoom({
          roomId,
          creatorPubkey: publicKey!.toBase58(),
          creatorStakeAmount: room.creator_stake_amount,
          joinerStakeAmount: room.joiner_stake_amount,
          wallet,
          connection,
        });
        console.log('Init tx:', sig1);

        // Stake
        const sig2 = await stake({
          roomId,
          participantId: 'creator-participant-id', // placeholder
          amount: room.creator_stake_amount,
          isCreator: true,
          wallet,
          connection,
        });
        console.log('Stake tx:', sig2);

        // Record stake in DB
        await fetch(apiUrl(`/api/v1/rooms/${roomId}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'record_stake',
            userId: myWallet,
            txSignature: sig2,
            amount: room.creator_stake_amount,
          }),
        });
        setSuccess('Room initialized on-chain and your stake is in!');
      } else if (action === 'stake_joiner') {
        const sig = await stake({
          roomId,
          participantId: 'joiner-participant-id',
          amount: room.joiner_stake_amount,
          isCreator: false,
          wallet,
          connection,
        });
        console.log('Joiner stake tx:', sig);

        await fetch(apiUrl(`/api/v1/rooms/${roomId}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'record_stake',
            userId: myWallet,
            txSignature: sig,
            amount: room.joiner_stake_amount,
          }),
        });
        setSuccess('Your stake is in! Room is now active.');
      } else if (action === 'approve_resolve') {
        const sig = await approveResolve({ roomId, wallet, connection });
        setSuccess('You voted to resolve. Waiting for other party...');
      } else if (action === 'resolve') {
        const sig = await resolveEscrow({
          roomId,
          creatorParticipantId: 'creator-participant-id',
          joinerParticipantId: 'joiner-participant-id',
          creatorWallet: room.creator_wallet,
          joinerWallet: room.joiner_wallet!,
          wallet,
          connection,
        });
        await fetch(apiUrl(`/api/v1/rooms/${roomId}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_action',
            userId: myWallet,
            actionType: 'resolve',
            description: 'Both parties agreed to resolve',
          }),
        });
        setSuccess('Contract resolved! Both parties got their SOL back.');
      } else if (action === 'slash') {
        const sig = await slashEscrow({
          roomId,
          creatorParticipantId: 'creator-participant-id',
          joinerParticipantId: 'joiner-participant-id',
          wallet,
          connection,
        });
        await fetch(apiUrl(`/api/v1/rooms/${roomId}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_action',
            userId: myWallet,
            actionType: 'slash',
            description: 'Terms were violated — slashing both stakes',
          }),
        });
        setSuccess('Contract slashed. Both stakes sent to penalty wallet.');
      } else if (action === 'cancel') {
        const sig = await cancelEscrowOnChain({
          roomId,
          joinerWallet: room.joiner_wallet || undefined,
          wallet,
          connection,
        });
        setSuccess('Room cancelled. Partial stakes refunded.');
      }

      await fetchRoom();
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
      setActiveModal(null);
    }
  };

  const copyJoinCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.join_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Connect Wallet</h1>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Room not found</h1>
          <Link href="/dashboard" className="text-violet-400 hover:text-violet-300">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const bothApproved = room.creator_approved_terms && room.joiner_approved_terms;
  const creatorStaked = room.stakes?.some((s: any) => s.is_creator && s.status === 'confirmed');
  const joinerStaked = room.stakes?.some((s: any) => !s.is_creator && s.status === 'confirmed');
  const fullyFunded = creatorStaked && joinerStaked;

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-violet-400 hover:text-violet-300 mb-4 inline-block text-sm">
          ← My Rooms
        </Link>

        {/* Error / Success messages */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">
            {error}
            <button onClick={() => setError('')} className="float-right text-red-400">&times;</button>
          </div>
        )}
        {success && (
          <div className="bg-green-900/50 border border-green-700 text-green-300 px-4 py-3 rounded-lg mb-4">
            {success}
            <button onClick={() => setSuccess('')} className="float-right text-green-400">&times;</button>
          </div>
        )}

        {/* Room Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold mb-1">{room.title}</h1>
              {room.description && (
                <p className="text-gray-400 mb-3">{room.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm">
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(room.status)}`}>
                  {room.status.replace(/_/g, ' ')}
                </span>
                {isCreator && <span className="text-yellow-400">👑 You are the Creator</span>}
                {isJoiner && <span className="text-cyan-400">🤝 You are the Joiner</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400 mb-1">Join Code</div>
              <button
                onClick={copyJoinCode}
                className="font-mono text-2xl tracking-widest bg-gray-800 px-4 py-2 rounded-lg hover:bg-gray-700 transition"
              >
                {room.join_code}
              </button>
              <div className="text-xs text-gray-500 mt-1">
                {copiedCode ? '✅ Copied!' : 'Click to copy'}
              </div>
            </div>
          </div>
        </div>

        {/* Join Code Banner for new rooms */}
        {showJoinCode && (
          <div className="bg-violet-900/30 border border-violet-700 rounded-xl p-6 mb-6 text-center">
            <p className="text-violet-300 mb-2">🎉 Room created! Share this code:</p>
            <div className="text-4xl font-mono tracking-[0.5em] font-bold text-white mb-2">
              {room.join_code}
            </div>
            <p className="text-sm text-violet-400">
              The other party enters this code to join your escrow agreement
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stakes Overview */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">💰 Stakes</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border ${creatorStaked ? 'border-green-700 bg-green-900/20' : 'border-gray-700 bg-gray-800'}`}>
                  <div className="text-sm text-gray-400 mb-1">Creator Stake</div>
                  <div className="text-2xl font-bold">{room.creator_stake_amount} SOL</div>
                  <div className="text-xs mt-1">
                    {creatorStaked ? (
                      <span className="text-green-400">✅ Funded</span>
                    ) : (
                      <span className="text-yellow-400">⏳ Pending</span>
                    )}
                  </div>
                </div>
                <div className={`p-4 rounded-lg border ${joinerStaked ? 'border-green-700 bg-green-900/20' : 'border-gray-700 bg-gray-800'}`}>
                  <div className="text-sm text-gray-400 mb-1">Joiner Stake</div>
                  <div className="text-2xl font-bold">{room.joiner_stake_amount} SOL</div>
                  <div className="text-xs mt-1">
                    {joinerStaked ? (
                      <span className="text-green-400">✅ Funded</span>
                    ) : (
                      <span className="text-yellow-400">⏳ Pending</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Terms */}
            {room.terms && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4">📋 Contract Terms</h2>
                {room.terms.summary && (
                  <p className="text-gray-300 mb-4">{room.terms.summary}</p>
                )}

                {room.conditions && room.conditions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-400">Conditions:</h3>
                    {room.conditions.map((cond: any, i: number) => (
                      <div key={i} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                        <div className="flex justify-between items-start">
                          <span className="font-medium">{cond.title || `Condition ${i + 1}`}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                            {cond.type}
                          </span>
                        </div>
                        {cond.description && (
                          <p className="text-sm text-gray-400 mt-1">{cond.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Responsible: {cond.responsible_party}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Term Approval Status */}
                <div className="mt-4 flex gap-4 text-sm">
                  <span className={room.creator_approved_terms ? 'text-green-400' : 'text-yellow-400'}>
                    {room.creator_approved_terms ? '✅' : '⏳'} Creator
                  </span>
                  <span className={room.joiner_approved_terms ? 'text-green-400' : 'text-yellow-400'}>
                    {room.joiner_approved_terms ? '✅' : '⏳'} Joiner
                  </span>
                </div>
              </div>
            )}

            {/* Deadline */}
            {room.contract_deadline && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm">
                <span className="text-gray-400">⏰ Deadline:</span>{' '}
                <span className="text-white">
                  {new Date(room.contract_deadline).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Action Sidebar */}
          <div className="space-y-6">
            {/* Status-based actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">⚡ Actions</h2>
              <div className="space-y-3">

                {/* Waiting for joiner to join */}
                {room.status === 'pending' && isCreator && (
                  <div className="text-center text-gray-400 text-sm">
                    <p className="mb-2">Waiting for someone to join...</p>
                    <p className="font-mono text-lg text-white">{room.join_code}</p>
                  </div>
                )}

                {/* Approve Terms */}
                {(room.status === 'awaiting_approval' || room.status === 'terms_negotiation') && (
                  <>
                    {isCreator && !room.creator_approved_terms && (
                      <button
                        onClick={() => handleAction('approve_terms')}
                        disabled={actionLoading}
                        className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-lg font-semibold transition"
                      >
                        ✅ Approve Terms
                      </button>
                    )}
                    {isJoiner && !room.joiner_approved_terms && (
                      <button
                        onClick={() => handleAction('approve_terms')}
                        disabled={actionLoading}
                        className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-lg font-semibold transition"
                      >
                        ✅ Approve Terms
                      </button>
                    )}
                    {((isCreator && room.creator_approved_terms) ||
                      (isJoiner && room.joiner_approved_terms)) && (
                      <p className="text-green-400 text-sm text-center">
                        ✅ You approved. Waiting for other party...
                      </p>
                    )}
                  </>
                )}

                {/* Stake - Creator initializes room + stakes */}
                {(room.status === 'approved' || room.status === 'funding') && isCreator && !creatorStaked && (
                  <button
                    onClick={() => setActiveModal('stake')}
                    disabled={actionLoading}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg font-semibold transition"
                  >
                    💰 Initialize & Stake {room.creator_stake_amount} SOL
                  </button>
                )}

                {/* Stake - Joiner stakes */}
                {(room.status === 'approved' || room.status === 'funding') && isJoiner && creatorStaked && !joinerStaked && (
                  <button
                    onClick={() => setActiveModal('stake')}
                    disabled={actionLoading}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg font-semibold transition"
                  >
                    💰 Stake {room.joiner_stake_amount} SOL
                  </button>
                )}

                {isJoiner && !creatorStaked && (room.status === 'approved' || room.status === 'funding') && (
                  <p className="text-yellow-400 text-sm text-center">
                    ⏳ Waiting for creator to stake first...
                  </p>
                )}

                {/* Active room - resolve/slash */}
                {room.status === 'active' && (
                  <>
                    <button
                      onClick={() => setActiveModal('resolve')}
                      disabled={actionLoading}
                      className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-semibold transition"
                    >
                      ✅ Approve Resolve
                    </button>
                    <button
                      onClick={() => setActiveModal('slash')}
                      disabled={actionLoading}
                      className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg font-semibold transition"
                    >
                      🔥 Slash (Nuclear Option)
                    </button>
                  </>
                )}

                {/* Cancel option before fully funded */}
                {['pending', 'awaiting_approval', 'terms_negotiation', 'approved', 'funding'].includes(
                  room.status
                ) &&
                  isCreator && (
                    <button
                      onClick={() => setActiveModal('cancel')}
                      disabled={actionLoading}
                      className="w-full py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 disabled:opacity-50 rounded-lg text-sm text-gray-400 transition"
                    >
                      Cancel Room
                    </button>
                  )}

                {/* Terminal states */}
                {room.status === 'resolved' && (
                  <div className="text-center p-4 bg-green-900/20 border border-green-800 rounded-lg">
                    <p className="text-green-400 font-semibold">✅ Contract Resolved</p>
                    <p className="text-sm text-gray-400 mt-1">All stakes returned</p>
                  </div>
                )}
                {room.status === 'slashed' && (
                  <div className="text-center p-4 bg-red-900/20 border border-red-800 rounded-lg">
                    <p className="text-red-400 font-semibold">🔥 Contract Slashed</p>
                    <p className="text-sm text-gray-400 mt-1">Stakes sent to penalty wallet</p>
                  </div>
                )}
                {room.status === 'cancelled' && (
                  <div className="text-center p-4 bg-gray-800 border border-gray-700 rounded-lg">
                    <p className="text-gray-400 font-semibold">❌ Room Cancelled</p>
                  </div>
                )}
              </div>
            </div>

            {/* Participants */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">👥 Participants</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">👑</span>
                  <div>
                    <div className="text-sm font-medium">Creator</div>
                    <div className="text-xs text-gray-400 font-mono">
                      {truncateAddress(room.creator_wallet)}
                    </div>
                  </div>
                </div>
                {room.joiner_wallet ? (
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🤝</span>
                    <div>
                      <div className="text-sm font-medium">Joiner</div>
                      <div className="text-xs text-gray-400 font-mono">
                        {truncateAddress(room.joiner_wallet)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">Waiting for joiner...</div>
                )}
              </div>
            </div>

            {/* Chat toggle */}
            {room.joiner_id && (
              <button
                onClick={() => setShowChat(!showChat)}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl font-semibold transition"
              >
                💬 {showChat ? 'Hide' : 'Show'} Chat
              </button>
            )}
          </div>
        </div>

        {/* Chat Panel */}
        {showChat && room.joiner_id && (
          <div className="mt-6">
            <ChatPanel roomId={roomId} userId={myWallet!} />
          </div>
        )}
      </div>

      {/* Confirmation Modals */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full">
            {activeModal === 'stake' && (
              <>
                <h3 className="text-xl font-bold mb-3">💰 Confirm Stake</h3>
                <p className="text-gray-400 mb-4">
                  You are about to stake{' '}
                  <strong className="text-white">
                    {isCreator ? room.creator_stake_amount : room.joiner_stake_amount} SOL
                  </strong>{' '}
                  into the escrow.
                </p>
                <p className="text-sm text-yellow-400 mb-6">
                  ⚠️ This SOL will be locked until both parties resolve or someone slashes.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction(isCreator ? 'init_and_stake' : 'stake_joiner')}
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg font-semibold"
                  >
                    {actionLoading ? 'Processing...' : 'Confirm Stake'}
                  </button>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="px-6 py-3 bg-gray-800 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {activeModal === 'resolve' && (
              <>
                <h3 className="text-xl font-bold mb-3">✅ Approve Resolve</h3>
                <p className="text-gray-400 mb-4">
                  Vote to resolve this contract. Once <strong>both</strong> parties approve,
                  all stakes are returned.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction('approve_resolve')}
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-semibold"
                  >
                    {actionLoading ? 'Processing...' : 'I Approve'}
                  </button>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="px-6 py-3 bg-gray-800 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {activeModal === 'slash' && (
              <>
                <h3 className="text-xl font-bold mb-3">🔥 SLASH — Nuclear Option</h3>
                <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-4">
                  <p className="text-red-300 text-sm">
                    <strong>WARNING:</strong> Slashing means <strong>BOTH</strong> parties lose their
                    stake. All funds go to the penalty wallet. This is irreversible.
                  </p>
                </div>
                <p className="text-gray-400 mb-4 text-sm">
                  Only do this if the other party violated the terms and you accept losing your own
                  stake as a consequence.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction('slash')}
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg font-semibold"
                  >
                    {actionLoading ? 'Processing...' : '🔥 Slash (Both Lose)'}
                  </button>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="px-6 py-3 bg-gray-800 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {activeModal === 'cancel' && (
              <>
                <h3 className="text-xl font-bold mb-3">Cancel Room</h3>
                <p className="text-gray-400 mb-4">
                  Cancel this room. Any partial stakes will be refunded.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction('cancel')}
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 rounded-lg font-semibold"
                  >
                    {actionLoading ? 'Processing...' : 'Confirm Cancel'}
                  </button>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="px-6 py-3 bg-gray-800 rounded-lg"
                  >
                    Never mind
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function truncateAddress(addr: string) {
  if (!addr) return '—';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    awaiting_approval: 'bg-blue-900/50 text-blue-300 border-blue-700',
    terms_negotiation: 'bg-orange-900/50 text-orange-300 border-orange-700',
    approved: 'bg-cyan-900/50 text-cyan-300 border-cyan-700',
    funding: 'bg-purple-900/50 text-purple-300 border-purple-700',
    active: 'bg-green-900/50 text-green-300 border-green-700',
    resolved: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
    slashed: 'bg-red-900/50 text-red-300 border-red-700',
    cancelled: 'bg-gray-800/50 text-gray-400 border-gray-700',
    expired: 'bg-gray-800/50 text-gray-400 border-gray-700',
    disputed: 'bg-amber-900/50 text-amber-300 border-amber-700',
  };
  return colors[status] || 'bg-gray-800 text-gray-400 border-gray-700';
}
