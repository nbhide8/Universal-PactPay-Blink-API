'use client';

import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';

const API_DOCS_URL = `${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '')}/api/v1/docs`;

export default function HomePage() {
  const { connected } = useWallet();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💼</span>
            <span className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              StakeWork
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <Link href="/browse" className="text-gray-400 hover:text-white transition">
              Browse Jobs
            </Link>
            {connected && (
              <Link href="/dashboard" className="text-gray-400 hover:text-white transition">
                My Jobs
              </Link>
            )}
            <a href={API_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition">
              API
            </a>
          </div>
        </div>
        <WalletMultiButton />
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="inline-block px-4 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium mb-6">
          Powered by the StakeGuard API
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold mb-4 bg-gradient-to-br from-amber-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
          Jobs &amp; Rewards Marketplace
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mb-10">
          Post a job, stake SOL as a bounty guarantee. Workers accept and stake to show commitment.
          Both parties have skin in the game — nobody walks away empty-handed.
        </p>

        {/* Primary CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <Link
            href="/browse"
            className="px-8 py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-xl text-lg font-semibold transition shadow-lg shadow-amber-600/20"
          >
            🔍 Browse Open Jobs
          </Link>
        </div>

        {connected ? (
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/create"
              className="px-8 py-4 bg-violet-600 hover:bg-violet-700 rounded-xl text-lg font-semibold transition"
            >
              📋 Post a Job
            </Link>
            <Link
              href="/join"
              className="px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-lg font-semibold transition"
            >
              🔗 Accept with Code
            </Link>
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-lg font-semibold transition"
            >
              💼 My Jobs
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-500">Connect your Solana wallet to post or accept jobs</p>
            <WalletMultiButton />
          </div>
        )}

        {/* How it works */}
        <div className="mt-20 max-w-4xl w-full">
          <h2 className="text-2xl font-bold mb-8 text-gray-300">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
            {[
              {
                icon: '📋',
                title: '1. Post a Job',
                desc: 'Describe the work, set the bounty (your stake) and the worker commitment stake. Get a job code.',
              },
              {
                icon: '🤝',
                title: '2. Worker Accepts',
                desc: 'Share the code or let workers find it in the marketplace. They review terms and accept.',
              },
              {
                icon: '💰',
                title: '3. Both Stake SOL',
                desc: 'Poster stakes the bounty guarantee. Worker stakes commitment. Both locked in escrow on Solana.',
              },
              {
                icon: '✅',
                title: '4. Deliver & Resolve',
                desc: 'Job done? Both approve, everyone gets SOL back. Somebody flakes? Slash — both lose.',
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
        <div className="mt-16 max-w-3xl w-full bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-800/50 rounded-2xl p-8 text-left">
          <h3 className="text-lg font-bold mb-4 text-amber-300">💡 Why the poster stakes more:</h3>
          <ul className="space-y-2 text-gray-300 text-sm">
            <li>• <strong>Poster scams the worker?</strong> — They lose their (higher) stake when slashed</li>
            <li>• <strong>Worker ghosts the job?</strong> — Poster slashes, worker loses stake (poster also loses as deterrent)</li>
            <li>• <strong>Job completed successfully?</strong> — Both approve, everyone gets their SOL back</li>
            <li>• <strong>Disputes?</strong> — Slashing burns both stakes. Creates real consequences for bad actors.</li>
          </ul>
        </div>

        {/* Built with StakeGuard API */}
        <div className="mt-16 max-w-4xl w-full">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🛡️</span>
            <h2 className="text-2xl font-bold text-gray-300">Powered by the StakeGuard API</h2>
          </div>
          <p className="text-gray-400 mb-6">
            This marketplace is powered by the{' '}
            <a href={API_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline">
              StakeGuard API
            </a>
            {' '}— a standalone REST API deployed independently on Railway.
            <strong className="text-gray-200"> Every escrow is backed by the Solana blockchain.</strong>
            {' '}Non-crypto users interact through a custodial mode — they pay via Stripe or company credits,
            and the API handles the on-chain staking automatically.
          </p>

          {/* The Two Modes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-900 border border-violet-800/50 rounded-xl p-6">
              <div className="text-2xl mb-2">⛓️</div>
              <h3 className="font-semibold mb-1 text-violet-300">Direct Mode</h3>
              <p className="text-sm text-gray-400 mb-2">For crypto-native users with Solana wallets. Sign transactions yourself.</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• API returns unsigned Solana transactions</li>
                <li>• User signs with wallet &amp; submits</li>
                <li>• SOL locked in on-chain PDA escrow</li>
              </ul>
              <code className="text-xs text-violet-400 mt-3 block">{`"mode": "direct"`}</code>
            </div>
            <div className="bg-gray-900 border border-emerald-800/50 rounded-xl p-6">
              <div className="text-2xl mb-2">🏦</div>
              <h3 className="font-semibold mb-1 text-emerald-300">Custodial Mode</h3>
              <p className="text-sm text-gray-400 mb-2">For non-crypto users. Pay with card or credits — API handles the blockchain.</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• User pays via Stripe or company credits</li>
                <li>• Platform wallet stakes SOL on their behalf</li>
                <li>• Same on-chain PDA escrow — same guarantees</li>
              </ul>
              <code className="text-xs text-emerald-400 mt-3 block">{`"mode": "custodial", "paymentRail": "stripe"`}</code>
            </div>
          </div>

          {/* Key Insight Card */}
          <div className="bg-gradient-to-r from-violet-900/30 to-emerald-900/30 border border-violet-800/40 rounded-xl p-6 mb-6">
            <h3 className="font-semibold mb-2 text-violet-300">🔑 The Key Insight</h3>
            <p className="text-sm text-gray-300">
              Both modes create the <strong>exact same on-chain Solana escrow</strong>. The only difference is
              who signs the transactions: the user (direct) or the API&apos;s platform wallet (custodial).
              Non-crypto users get blockchain-backed guarantees without ever touching crypto.
            </p>
          </div>

          {/* Architecture */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-2xl mb-2">🖥️</div>
              <h3 className="font-semibold mb-1">Standalone API</h3>
              <p className="text-sm text-gray-400">Deployed independently on Railway. Zero dependency on any frontend. Any company can integrate.</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-2xl mb-2">🔑</div>
              <h3 className="font-semibold mb-1">API Key Auth</h3>
              <p className="text-sm text-gray-400">Get your API key, set the X-API-Key header, build your own escrow-backed app.</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-2xl mb-2">⛓️</div>
              <h3 className="font-semibold mb-1">Always On-Chain</h3>
              <p className="text-sm text-gray-400">Every escrow lives on Solana. Real SOL locked in PDA accounts. Verifiable. Trustless.</p>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-sm text-gray-500 mb-3">Create an escrow — crypto or non-crypto, same API:</p>
            <pre className="text-sm text-green-400 overflow-x-auto"><code>{`# Direct mode — crypto user with Solana wallet
curl -X POST https://api.stakeguard.app/api/v1/rooms \\
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \\
  -d '{"walletAddress": "7xKX...", "mode": "direct", "title": "Smart contract audit", "creatorStakeAmount": 5.0, "joinerStakeAmount": 2.0, "terms": {...}}'
# → Returns unsigned Solana transaction to sign

# Custodial mode — non-crypto user pays with Stripe
curl -X POST https://api.stakeguard.app/api/v1/rooms \\
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \\
  -d '{"walletAddress": "user@email.com", "mode": "custodial", "paymentRail": "stripe", "title": "Freelance Design", "creatorStakeAmount": 500, "joinerStakeAmount": 250, "terms": {...}}'
# → Platform wallet creates on-chain escrow, returns Stripe PaymentIntent

# Custodial mode — company credits (no external payment rail)
curl -X POST https://api.stakeguard.app/api/v1/rooms \\
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \\
  -d '{"walletAddress": "user-42", "mode": "custodial", "paymentRail": "credits", "title": "Team Challenge", "creatorStakeAmount": 100, "joinerStakeAmount": 100, "terms": {...}}'
# → Platform wallet creates on-chain escrow instantly, no user action needed`}</code></pre>
          </div>
          <div className="mt-4 text-center">
            <a
              href={API_DOCS_URL}
              target="_blank" rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300 text-sm font-medium"
            >
              View Full API Documentation →
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-6 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <span>Built for HackIllinois 2026</span>
          <span>•</span>
          <span>Solana Devnet</span>
          <span>•</span>
          <a href={API_DOCS_URL} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">StakeGuard API</a>
          <span>•</span>
          <Link href="/browse" className="text-amber-400 hover:text-amber-300">Browse Jobs</Link>
        </div>
      </footer>
    </div>
  );
}
