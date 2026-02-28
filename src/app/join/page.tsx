'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';

export default function AcceptJobPage() {
  const { connected, publicKey } = useWallet();
  const router = useRouter();

  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!publicKey) {
      setError('Please connect your wallet');
      return;
    }

    if (joinCode.trim().length !== 6) {
      setError('Job code must be 6 characters');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/v1/rooms/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: publicKey.toBase58(),
          walletAddress: publicKey.toBase58(),
          joinCode: joinCode.toUpperCase(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept job');
      }

      const room = await response.json();
      router.push(`/room/${room.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Connect Wallet</h1>
          <p className="text-gray-400 mb-6">Connect your wallet to accept a job</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <Link href="/" className="text-amber-400 hover:text-amber-300 mb-6 inline-block">
          ← Back to Marketplace
        </Link>

        <h1 className="text-3xl font-bold mb-2">Accept a Job</h1>
        <p className="text-gray-400 mb-8">
          Enter the 6-character job code shared by the poster.
        </p>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleAccept} className="space-y-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <label className="block text-sm text-gray-400 mb-4">Job Code</label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              maxLength={6}
              className="w-full text-center text-4xl font-mono tracking-[0.5em] bg-gray-800 border border-gray-700 rounded-lg px-4 py-4 text-white uppercase"
              required
            />
            <p className="text-xs text-gray-500 mt-3">
              The job poster should have shared this code with you
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || joinCode.length !== 6}
            className="w-full py-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-lg font-semibold transition"
          >
            {loading ? 'Accepting...' : '🤝 Accept Job'}
          </button>
        </form>
      </div>
    </div>
  );
}
