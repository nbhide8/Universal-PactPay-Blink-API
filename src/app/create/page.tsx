'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createRoom, stakeRoom, submitTransaction, type ConditionType, type ContractConditionData } from '@/lib/api';

export default function CreateJobPage() {
  const router = useRouter();
  const { publicKey, connected, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [creatorStake, setCreatorStake] = useState('0.1');
  const [creatorStakeAmount, setCreatorStakeAmount] = useState('0.1');
  const [joinerStake, setJoinerStake] = useState('0.05');
  // Custodial mode disabled for now — defaulting to direct/wallet mode
  // const [mode, setMode] = useState<'direct' | 'custodial'>('custodial');
  const [mode, setMode] = useState<'direct' | 'custodial'>('direct');
  const [conditions, setConditions] = useState<ContractConditionData[]>([
    { type: 'task_completion' as ConditionType, description: 'Complete the assigned task as described', required: true },
  ]);

  const addCondition = () => {
    setConditions([...conditions, { type: 'custom' as ConditionType, description: '', required: true }]);
  };

  const removeCondition = (i: number) => {
    setConditions(conditions.filter((_, idx) => idx !== i));
  };

  const updateCondition = (i: number, field: keyof ContractConditionData, value: any) => {
    const updated = [...conditions];
    (updated[i] as any)[field] = value;
    setConditions(updated);
  };

  const handleSubmit = async () => {
    if (!connected || !publicKey) { setError('Connect your wallet first'); return; }
    if (!title.trim()) { setError('Title is required'); return; }
    if (conditions.length === 0) { setError('At least one condition is required'); return; }
    if (conditions.some((c) => !c.description.trim())) { setError('All conditions need a description'); return; }

    setLoading(true);
    setError('');

    try {
      const result = await createRoom({
        walletAddress: publicKey.toBase58(),
        title: title.trim(),
        description: description.trim() || undefined,
        rewardAmount: parseFloat(creatorStake),
        creatorStakeAmount: parseFloat(creatorStakeAmount),
        joinerStakeAmount: parseFloat(joinerStake),
        mode,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        terms: {
          title: title.trim(),
          summary: description.trim() || title.trim(),
          conditions,
        },
      });

      // Direct mode: sign and submit the on-chain init transaction, then auto-stake
      if (result.lockbox?.mode === 'direct' && result.lockbox.action?.payload && signTransaction) {
        // Step 1: Sign & submit init transaction
        const initBytes = Buffer.from(result.lockbox.action.payload, 'base64');
        const initTx = Transaction.from(initBytes);
        const signedInit = await signTransaction(initTx);
        const signedInitB64 = Buffer.from(signedInit.serialize()).toString('base64');
        await submitTransaction({
          signedTransaction: signedInitB64,
          roomId: result.room.id,
          action: 'initialize_room',
          walletAddress: publicKey.toBase58(),
        });

        // Step 2: Auto-stake creator's SOL
        const stakeResult = await stakeRoom(result.room.id, {
          walletAddress: publicKey.toBase58(),
          isCreator: true,
        });
        if (stakeResult.lockbox?.action?.payload) {
          const stakeBytes = Buffer.from(stakeResult.lockbox.action.payload, 'base64');
          const stakeTx = Transaction.from(stakeBytes);
          const signedStake = await signTransaction(stakeTx);
          const signedStakeB64 = Buffer.from(signedStake.serialize()).toString('base64');
          await submitTransaction({
            signedTransaction: signedStakeB64,
            roomId: result.room.id,
            action: 'stake',
            walletAddress: publicKey.toBase58(),
            metadata: { isCreator: true },
          });
        }
      }

      router.push(`/room/${result.room.id}?created=true&joinCode=${result.room.join_code}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-amber-400 hover:text-amber-300">PackedPay</Link>
            <span className="text-gray-500">|</span>
            <h1 className="text-lg font-semibold">Post a Job</h1>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Step indicator */}
        <div className="flex items-center gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${step >= s ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-500'}`}>{s}</div>
              <span className={`text-sm ${step >= s ? 'text-white' : 'text-gray-500'}`}>{['Details', 'Stakes', 'Conditions'][s - 1]}</span>
              {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-amber-600' : 'bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Step 1: Details */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Job Title *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build a landing page"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the work to be done..." rows={5}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Tags (comma-separated)</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. React, Solana, Frontend"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
            </div>
            <div className="flex justify-end">
              <button onClick={() => { if (!title.trim()) { setError('Title is required'); return; } setError(''); setStep(2); }}
                className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-lg font-medium transition">Next: Set Stakes →</button>
            </div>
          </div>
        )}

        {/* Step 2: Stakes */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">💰 Stake Configuration</h3>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Bounty / Reward (SOL)</label>
                  <input type="number" step="0.01" min="0.01" value={creatorStake} onChange={(e) => setCreatorStake(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                  <p className="text-xs text-gray-500 mt-1">Reward paid to the worker</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Your Stake (SOL)</label>
                  <input type="number" step="0.01" min="0.01" value={creatorStakeAmount} onChange={(e) => setCreatorStakeAmount(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                  <p className="text-xs text-gray-500 mt-1">Your collateral (slashed if you bail)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Worker Stake (SOL)</label>
                  <input type="number" step="0.01" min="0" value={joinerStake} onChange={(e) => setJoinerStake(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                  <p className="text-xs text-gray-500 mt-1">Worker puts up as collateral</p>
                </div>
              </div>
              <div className="mt-6 bg-gray-800/50 rounded-lg p-4 space-y-1">
                <p className="text-sm text-gray-400">Total locked in escrow: <span className="text-amber-400 font-bold">{(parseFloat(creatorStakeAmount || '0') + parseFloat(creatorStake || '0') + parseFloat(joinerStake || '0')).toFixed(4)} SOL</span></p>
                <p className="text-xs text-gray-500">Creator deposits: {creatorStakeAmount} SOL stake + {creatorStake} SOL reward = {(parseFloat(creatorStakeAmount || '0') + parseFloat(creatorStake || '0')).toFixed(4)} SOL &middot; Worker stakes: {joinerStake} SOL</p>
              </div>
            </div>

            {/* Custodial mode selector — commented out for now
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-2">🔧 Escrow Mode</h3>
              <p className="text-xs text-gray-500 mb-4">Both modes lock real funds on the Solana blockchain. The difference is how you interact.</p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setMode('custodial')} className={`p-4 rounded-lg border transition text-left ${mode === 'custodial' ? 'border-amber-500 bg-amber-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
                  <p className="font-semibold text-white mb-1">💳 Easy Pay</p>
                  <p className="text-xs text-gray-400">Platform handles blockchain. No wallet needed. Pay via card or credits.</p>
                </button>
                <button onClick={() => setMode('direct')} className={`p-4 rounded-lg border transition text-left ${mode === 'direct' ? 'border-amber-500 bg-amber-500/10' : 'border-gray-700 hover:border-gray-600'}`}>
                  <p className="font-semibold text-white mb-1">🔗 Wallet (On-chain)</p>
                  <p className="text-xs text-gray-400">Sign transactions yourself. Fully trustless — you hold the keys.</p>
                </button>
              </div>
            </div>
            */}

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition">← Back</button>
              <button onClick={() => setStep(3)} className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-lg font-medium transition">Next: Conditions →</button>
            </div>
          </div>
        )}

        {/* Step 3: Conditions */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">📋 Contract Conditions</h3>
                <button onClick={addCondition} className="text-sm text-amber-400 hover:text-amber-300 transition">+ Add Condition</button>
              </div>
              <div className="space-y-4">
                {conditions.map((cond, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <select value={cond.type} onChange={(e) => updateCondition(i, 'type', e.target.value)}
                            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white">
                            <option value="task_completion">Task Completion</option>
                            <option value="milestone">Milestone</option>
                            <option value="deadline">Deadline</option>
                            <option value="custom">Custom</option>
                          </select>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={cond.required} onChange={(e) => updateCondition(i, 'required', e.target.checked)}
                              className="rounded border-gray-600" />
                            <span className="text-xs text-gray-400">Required</span>
                          </label>
                        </div>
                        <input type="text" value={cond.description} onChange={(e) => updateCondition(i, 'description', e.target.value)}
                          placeholder="Describe this condition..."
                          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50" />
                      </div>
                      {conditions.length > 1 && (
                        <button onClick={() => removeCondition(i)} className="text-gray-500 hover:text-red-400 transition mt-1">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">📄 Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Title</span><span className="text-white font-medium">{title}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Bounty</span><span className="text-amber-400 font-bold">{creatorStake} SOL</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Your Stake</span><span className="text-purple-400 font-bold">{creatorStakeAmount} SOL</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Worker Stake</span><span className="text-blue-400 font-bold">{joinerStake} SOL</span></div>
                {/* <div className="flex justify-between"><span className="text-gray-400">Mode</span><span className="text-white">{mode === 'custodial' ? '💳 Easy Pay' : '🔗 Wallet (On-chain)'}</span></div> */}
                <div className="flex justify-between"><span className="text-gray-400">Conditions</span><span className="text-white">{conditions.length}</span></div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition">← Back</button>
              <button onClick={handleSubmit} disabled={loading || !connected}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-8 py-3 rounded-lg font-medium transition flex items-center gap-2">
                {loading ? <><span className="animate-spin">⏳</span> Creating...</> : '🚀 Create Job'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
