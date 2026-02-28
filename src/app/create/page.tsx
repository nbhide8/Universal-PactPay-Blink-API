'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ConditionType, ContractConditionData } from '@/lib/types';

export default function CreateRoomPage() {
  const { connected, publicKey } = useWallet();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creatorStake, setCreatorStake] = useState('');
  const [joinerStake, setJoinerStake] = useState('');
  const [termsSummary, setTermsSummary] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [contractDeadline, setContractDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conditions, setConditions] = useState<ContractConditionData[]>([
    {
      type: 'custom',
      title: '',
      description: '',
      responsible_party: 'joiner',
      stake_weight: 100,
    },
  ]);

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        type: 'custom',
        title: '',
        description: '',
        responsible_party: 'joiner',
        stake_weight: 0,
      },
    ]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: string, value: any) => {
    const updated = [...conditions];
    (updated[index] as any)[field] = value;
    setConditions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    const creatorAmount = parseFloat(creatorStake);
    const joinerAmount = parseFloat(joinerStake);

    if (creatorAmount < joinerAmount) {
      setError('Creator stake must be >= joiner stake (you need more skin in the game!)');
      return;
    }

    if (creatorAmount <= 0 || joinerAmount <= 0) {
      setError('Stake amounts must be greater than 0');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: publicKey.toBase58(), // In prod, use proper auth
          walletAddress: publicKey.toBase58(),
          title,
          description,
          creatorStakeAmount: creatorAmount,
          joinerStakeAmount: joinerAmount,
          contractDeadline: contractDeadline || undefined,
          terms: {
            title: `Terms for: ${title}`,
            summary: termsSummary,
            conditions: conditions.filter((c) => c.title.trim()),
            additionalNotes: additionalNotes || undefined,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create room');
      }

      const room = await response.json();
      router.push(`/room/${room.id}?joinCode=${room.join_code}`);
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
          <p className="text-gray-400 mb-6">Connect your Solana wallet to create a room</p>
          <WalletMultiButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-violet-400 hover:text-violet-300 mb-6 inline-block">
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Create Escrow Room</h1>
        <p className="text-gray-400 mb-8">
          Define your terms and stake amounts. You&apos;ll get a join code to share.
        </p>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Room Details */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Room Details</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Freelance Web Design Project"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the agreement..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white h-24 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Deadline</label>
                <input
                  type="datetime-local"
                  value={contractDeadline}
                  onChange={(e) => setContractDeadline(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                />
              </div>
            </div>
          </div>

          {/* Stake Amounts */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-2">Stake Amounts (SOL)</h2>
            <p className="text-sm text-gray-500 mb-4">
              Your stake must be ≥ the joiner&apos;s stake. Higher creator stake = more trust.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Your stake (creator) *</label>
                <input
                  type="number"
                  value={creatorStake}
                  onChange={(e) => setCreatorStake(e.target.value)}
                  placeholder="e.g., 2.0"
                  step="0.001"
                  min="0.001"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Joiner&apos;s stake *</label>
                <input
                  type="number"
                  value={joinerStake}
                  onChange={(e) => setJoinerStake(e.target.value)}
                  placeholder="e.g., 1.0"
                  step="0.001"
                  min="0.001"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
                  required
                />
              </div>
            </div>

            {creatorStake && joinerStake && parseFloat(creatorStake) < parseFloat(joinerStake) && (
              <p className="text-red-400 text-sm mt-2">
                ⚠️ Creator stake must be ≥ joiner stake
              </p>
            )}
          </div>

          {/* Contract Terms */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Contract Terms</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Terms Summary *</label>
                <textarea
                  value={termsSummary}
                  onChange={(e) => setTermsSummary(e.target.value)}
                  placeholder="Summarize what both parties agree to..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white h-24 resize-none"
                  required
                />
              </div>

              {/* Conditions */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Conditions</label>
                {conditions.map((condition, index) => (
                  <div
                    key={index}
                    className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3"
                  >
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-gray-300">
                        Condition #{index + 1}
                      </span>
                      {conditions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCondition(index)}
                          className="text-red-400 text-sm hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <input
                          type="text"
                          value={condition.title}
                          onChange={(e) => updateCondition(index, 'title', e.target.value)}
                          placeholder="Condition title"
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <select
                          value={condition.type}
                          onChange={(e) =>
                            updateCondition(index, 'type', e.target.value as ConditionType)
                          }
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                        >
                          <option value="task_completion">Task Completion</option>
                          <option value="payment">Payment</option>
                          <option value="delivery">Delivery</option>
                          <option value="milestone">Milestone</option>
                          <option value="time_based">Time Based</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                    </div>

                    <textarea
                      value={condition.description}
                      onChange={(e) => updateCondition(index, 'description', e.target.value)}
                      placeholder="Describe this condition in detail..."
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white h-16 resize-none mb-3"
                    />

                    <div className="flex gap-3">
                      <select
                        value={condition.responsible_party}
                        onChange={(e) =>
                          updateCondition(index, 'responsible_party', e.target.value)
                        }
                        className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                      >
                        <option value="joiner">Joiner responsible</option>
                        <option value="creator">Creator responsible</option>
                      </select>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addCondition}
                  className="text-violet-400 hover:text-violet-300 text-sm font-medium"
                >
                  + Add Condition
                </button>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Additional Notes</label>
                <textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Any additional notes or disclaimers..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white h-20 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-lg font-semibold transition"
          >
            {loading ? 'Creating Room...' : '🚀 Create Room & Get Join Code'}
          </button>
        </form>
      </div>
    </div>
  );
}
