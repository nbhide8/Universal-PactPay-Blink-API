'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { getRooms, type Room } from '@/lib/api';

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: 'Open', color: 'bg-green-500/20 text-green-400' },
  awaiting_approval: { label: 'Review', color: 'bg-blue-500/20 text-blue-400' },
  funding: { label: 'Funding', color: 'bg-purple-500/20 text-purple-400' },
  active: { label: 'Active', color: 'bg-amber-500/20 text-amber-400' },
  resolved: { label: 'Done', color: 'bg-emerald-500/20 text-emerald-400' },
  slashed: { label: 'Slashed', color: 'bg-red-500/20 text-red-400' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-500/20 text-gray-400' },
};

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const [myJobs, setMyJobs] = useState<Room[]>([]);
  const [myWork, setMyWork] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'posted' | 'accepted'>('posted');

  const fetchData = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const wallet = publicKey.toBase58();
      const [posted, accepted] = await Promise.all([
        getRooms({ creatorId: wallet, limit: 50 }),
        getRooms({ joinerId: wallet, limit: 50 }),
      ]);
      setMyJobs(posted.rooms);
      setMyWork(accepted.rooms);
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeList = tab === 'posted' ? myJobs : myWork;

  const totalEarnings = myWork.filter((r) => r.status === 'resolved').reduce((sum, r) => sum + r.creator_stake_amount + r.joiner_stake_amount, 0);
  const totalPosted = myJobs.reduce((sum, r) => sum + r.creator_stake_amount, 0);

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔐</div>
          <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-6">View your jobs and accepted work</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-amber-400 hover:text-amber-300">StakeWork</Link>
            <span className="text-gray-500">|</span>
            <h1 className="text-lg font-semibold">Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/create" className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">+ Post a Job</Link>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{myJobs.length}</p>
            <p className="text-xs text-gray-500 mt-1">Jobs Posted</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{myWork.length}</p>
            <p className="text-xs text-gray-500 mt-1">Jobs Accepted</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-400">{totalEarnings.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">SOL Earned</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-purple-400">{totalPosted.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">SOL Posted</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-6 w-fit">
          <button onClick={() => setTab('posted')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'posted' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            My Jobs ({myJobs.length})
          </button>
          <button onClick={() => setTab('accepted')} className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'accepted' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            Accepted Work ({myWork.length})
          </button>
        </div>

        {loading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse">
                <div className="h-5 bg-gray-800 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {!loading && activeList.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">{tab === 'posted' ? '📝' : '🔧'}</div>
            <h3 className="text-lg font-semibold mb-2">{tab === 'posted' ? 'No jobs posted yet' : 'No accepted work yet'}</h3>
            <p className="text-gray-400 mb-6">{tab === 'posted' ? 'Create your first job listing' : 'Browse available jobs'}</p>
            <Link href={tab === 'posted' ? '/create' : '/browse'} className="inline-block bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-lg font-medium transition">
              {tab === 'posted' ? 'Post a Job' : 'Browse Jobs'}
            </Link>
          </div>
        )}

        {!loading && activeList.length > 0 && (
          <div className="space-y-3">
            {activeList.map((room) => {
              const badge = STATUS_BADGE[room.status] || { label: room.status, color: 'bg-gray-500/20 text-gray-400' };
              return (
                <Link key={room.id} href={`/room/${room.id}`} className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition group">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-base font-semibold text-white group-hover:text-amber-300 transition truncate">{room.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Bounty: <span className="text-amber-400">{room.creator_stake_amount} SOL</span></span>
                        <span>Stake: <span className="text-blue-400">{room.joiner_stake_amount} SOL</span></span>
                        {room.joiner_id && <span>Worker: <span className="text-gray-400 font-mono">{room.joiner_id.slice(0, 4)}...{room.joiner_id.slice(-4)}</span></span>}
                      </div>
                    </div>
                    <span className="text-gray-600 group-hover:text-gray-400 transition">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
