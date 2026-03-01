'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { joinRoom } from '@/lib/api';

function JoinJobContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { publicKey, connected } = useWallet();
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) setJoinCode(code);
  }, [searchParams]);

  const handleJoin = async () => {
    if (!connected || !publicKey) { setError('Connect your wallet first'); return; }
    if (!joinCode.trim()) { setError('Enter a join code'); return; }

    setLoading(true);
    setError('');

    try {
      const { room } = await joinRoom({
        walletAddress: publicKey.toBase58(),
        joinCode: joinCode.trim(),
      });
      router.push(`/room/${room.id}?joined=true`);
    } catch (err: any) {
      setError(err.message || 'Failed to join');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-amber-400 hover:text-amber-300">PackedPay</Link>
            <span className="text-gray-500">|</span>
            <h1 className="text-lg font-semibold">Join a Job</h1>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🤝</div>
            <h2 className="text-2xl font-bold mb-2">Accept a Job</h2>
            <p className="text-gray-400">Enter the join code shared by the job poster</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Join Code</label>
              <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABCD1234"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-4 text-white text-center text-2xl font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()} />
            </div>

            <button onClick={handleJoin} disabled={loading || !connected || !joinCode.trim()}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white py-4 rounded-lg font-medium text-lg transition">
              {loading ? '⏳ Joining...' : '🚀 Accept Job'}
            </button>
          </div>

          {!connected && (
            <div className="mt-6 text-center">
              <p className="text-gray-500 text-sm mb-3">Connect your wallet to continue</p>
              <WalletMultiButton />
            </div>
          )}
        </div>

        <div className="text-center mt-8">
          <Link href="/browse" className="text-gray-400 hover:text-amber-400 text-sm transition">or browse available jobs →</Link>
        </div>
      </main>
    </div>
  );
}

export default function JoinJobPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading...</p></div>}>
      <JoinJobContent />
    </Suspense>
  );
}
