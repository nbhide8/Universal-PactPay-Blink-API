'use client';

import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import type { Room, RoomStatus } from '@/lib/types';
import { apiUrl } from '@/lib/api';

const STATUS_COLORS: Record<RoomStatus, string> = {
  pending: 'bg-green-900/50 text-green-300 border-green-700',
  awaiting_approval: 'bg-blue-900/50 text-blue-300 border-blue-700',
  terms_negotiation: 'bg-orange-900/50 text-orange-300 border-orange-700',
  approved: 'bg-cyan-900/50 text-cyan-300 border-cyan-700',
  funding: 'bg-purple-900/50 text-purple-300 border-purple-700',
  active: 'bg-amber-900/50 text-amber-300 border-amber-700',
  resolved: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  slashed: 'bg-red-900/50 text-red-300 border-red-700',
  cancelled: 'bg-gray-800/50 text-gray-400 border-gray-700',
  expired: 'bg-gray-800/50 text-gray-400 border-gray-700',
  disputed: 'bg-amber-900/50 text-amber-300 border-amber-700',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Open — Hiring',
  awaiting_approval: 'Under Review',
  funding: 'Staking',
  active: 'In Progress',
  resolved: 'Completed',
  slashed: 'Slashed',
  cancelled: 'Cancelled',
};

export default function DashboardPage() {
  const { connected, publicKey } = useWallet();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicKey) return;

    const fetchJobs = async () => {
      try {
        const response = await fetch(apiUrl(`/api/v1/rooms?userId=${publicKey.toBase58()}`));
        if (response.ok) {
          const data = await response.json();
          setRooms(data);
        }
      } catch (error) {
        console.error('Failed to fetch jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [publicKey]);

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Connect Wallet</h1>
          <p className="text-gray-400 mb-6">Connect your wallet to see your jobs</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/" className="text-amber-400 hover:text-amber-300 mb-2 inline-block text-sm">
              ← Marketplace
            </Link>
            <h1 className="text-3xl font-bold">My Jobs</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/create"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm font-semibold"
            >
              + Post a Job
            </Link>
            <Link
              href="/join"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-semibold"
            >
              Accept Job
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4" />
            <p className="text-gray-400">Loading your jobs...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-xl">
            <p className="text-gray-400 text-lg mb-4">No jobs yet</p>
            <p className="text-gray-500 mb-6">
              Post your first job or accept one with a code
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/create"
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 rounded-lg font-semibold"
              >
                Post a Job
              </Link>
              <Link
                href="/browse"
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg font-semibold"
              >
                Browse Jobs
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {rooms.map((room) => (
              <Link
                key={room.id}
                href={`/room/${room.id}`}
                className="block bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">{room.title}</h3>
                    {room.description && (
                      <p className="text-gray-400 text-sm mb-2 line-clamp-2">{room.description}</p>
                    )}
                    <div className="flex gap-4 text-sm text-gray-500">
                      <span>Code: <span className="font-mono text-gray-300">{room.join_code}</span></span>
                      <span>Bounty: {room.creator_stake_amount} SOL</span>
                      <span>Worker stake: {room.joiner_stake_amount} SOL</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        STATUS_COLORS[room.status] || 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {STATUS_LABELS[room.status] || room.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {room.creator_id === publicKey?.toBase58() ? '📋 Posted by you' : '🔧 Accepted by you'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
