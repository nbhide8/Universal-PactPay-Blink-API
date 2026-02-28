'use client';

import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import type { Room, RoomStatus } from '@/lib/types';

const STATUS_COLORS: Record<RoomStatus, string> = {
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

export default function DashboardPage() {
  const { connected, publicKey } = useWallet();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicKey) return;

    const fetchRooms = async () => {
      try {
        const response = await fetch(`/api/rooms?userId=${publicKey.toBase58()}`);
        if (response.ok) {
          const data = await response.json();
          setRooms(data);
        }
      } catch (error) {
        console.error('Failed to fetch rooms:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, [publicKey]);

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

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link href="/" className="text-violet-400 hover:text-violet-300 mb-2 inline-block text-sm">
              ← Home
            </Link>
            <h1 className="text-3xl font-bold">My Rooms</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/create"
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-semibold"
            >
              + Create Room
            </Link>
            <Link
              href="/join"
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-semibold"
            >
              Join Room
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto mb-4" />
            <p className="text-gray-400">Loading rooms...</p>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-xl">
            <p className="text-gray-400 text-lg mb-4">No rooms yet</p>
            <p className="text-gray-500 mb-6">
              Create your first escrow room or join one with a code
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/create"
                className="px-6 py-3 bg-violet-600 hover:bg-violet-700 rounded-lg font-semibold"
              >
                Create Room
              </Link>
              <Link
                href="/join"
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg font-semibold"
              >
                Join Room
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
                      <span>Creator stake: {room.creator_stake_amount} SOL</span>
                      <span>Joiner stake: {room.joiner_stake_amount} SOL</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        STATUS_COLORS[room.status] || 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {room.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {room.creator_id === publicKey?.toBase58() ? '👑 Creator' : '🤝 Joiner'}
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
