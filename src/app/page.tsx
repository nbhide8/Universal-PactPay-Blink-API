'use client';

import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';

export default function HomePage() {
  const { connected, publicKey } = useWallet();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛡️</span>
          <span className="text-xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            StakeGuard
          </span>
        </div>
        <WalletMultiButton />
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-5xl md:text-7xl font-extrabold mb-4 bg-gradient-to-br from-violet-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Trust Through Stakes
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mb-10">
          Create escrow agreements where both parties put skin in the game.
          Stake SOL, agree on terms, and resolve trustlessly.
          No one gets screwed — everyone has something to lose.
        </p>

        {connected ? (
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/create"
              className="px-8 py-4 bg-violet-600 hover:bg-violet-700 rounded-xl text-lg font-semibold transition"
            >
              🏗️ Create a Room
            </Link>
            <Link
              href="/join"
              className="px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-lg font-semibold transition"
            >
              🔗 Join with Code
            </Link>
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-lg font-semibold transition"
            >
              📋 My Rooms
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-500">Connect your Solana wallet to get started</p>
            <WalletMultiButton />
          </div>
        )}

        {/* How it works */}
        <div className="mt-20 max-w-4xl w-full">
          <h2 className="text-2xl font-bold mb-8 text-gray-300">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
            {[
              {
                icon: '📝',
                title: '1. Create Room',
                desc: 'Define your contract terms, set stake amounts, and get a join code (like Kahoot!).',
              },
              {
                icon: '🤝',
                title: '2. Join & Agree',
                desc: 'Share the code. The other party reviews terms, negotiates, and approves.',
              },
              {
                icon: '💰',
                title: '3. Both Stake',
                desc: 'Both parties stake SOL. The creator stakes MORE — skin in the game to not abuse power.',
              },
              {
                icon: '✅',
                title: '4. Resolve or Slash',
                desc: 'Both satisfied? Resolve and get money back. Someone broke terms? Slash — both lose.',
              },
            ].map((step) => (
              <div
                key={step.title}
                className="bg-gray-900 border border-gray-800 rounded-xl p-6"
              >
                <div className="text-3xl mb-3">{step.icon}</div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-gray-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Key Points */}
        <div className="mt-16 max-w-3xl w-full bg-gradient-to-r from-violet-900/30 to-cyan-900/30 border border-violet-800/50 rounded-2xl p-8 text-left">
          <h3 className="text-lg font-bold mb-4 text-violet-300">💡 Why creator stakes more:</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• <strong>Creator abuses power?</strong> — They lose their (higher) stake when slashed</li>
            <li>• <strong>Joiner backs out?</strong> — Creator slashes, joiner loses stake, but creator loses too</li>
            <li>• <strong>Both happy?</strong> — Mutual resolve, everyone gets their SOL back</li>
            <li>• <strong>Last-minute betrayal?</strong> — The betrayed party slashes. Both lose. Don&apos;t be that person.</li>
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-4 text-center text-sm text-gray-500">
        Built for HackIllinois 2026 — Solana Devnet
      </footer>
    </div>
  );
}
