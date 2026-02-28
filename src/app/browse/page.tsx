'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';

interface BrowseJob {
  id: string;
  title: string;
  description: string | null;
  status: string;
  creator_stake_amount: number;
  joiner_stake_amount: number;
  creator_id: string;
  joiner_id: string | null;
  tags: string[];
  join_code: string;
  created_at: string;
  contract_deadline: string | null;
  is_public: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-green-500/20 text-green-400 border-green-500/30',
  awaiting_approval: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  funding: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  active: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  resolved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  slashed: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Open — Hiring',
  awaiting_approval: 'Under Review',
  funding: 'Staking in Progress',
  active: 'In Progress',
  resolved: 'Completed',
  slashed: 'Slashed',
  cancelled: 'Cancelled',
};

export default function BrowseJobsPage() {
  const { publicKey } = useWallet();
  const [jobs, setJobs] = useState<BrowseJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const limit = 12;

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
      });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(apiUrl(`/api/v1/rooms?${params}`));
      const json = await res.json();
      if (json.success) {
        setJobs(json.data.rooms);
        setTotal(json.data.total);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl">💼</span>
              <span className="text-xl font-bold text-amber-400 hover:text-amber-300">StakeWork</span>
            </Link>
            <span className="text-gray-500">|</span>
            <h1 className="text-lg font-semibold">Job Board</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/create"
              className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              + Post a Job
            </Link>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search jobs by title or description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-3 text-white text-sm"
            >
              <option value="">All Statuses</option>
              <option value="pending">Open (Hiring)</option>
              <option value="awaiting_approval">Under Review</option>
              <option value="funding">Staking</option>
              <option value="active">In Progress</option>
              <option value="resolved">Completed</option>
              <option value="slashed">Slashed</option>
            </select>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [s, o] = e.target.value.split(':');
                setSortBy(s);
                setSortOrder(o as 'asc' | 'desc');
                setPage(1);
              }}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-3 text-white text-sm"
            >
              <option value="created_at:desc">Newest First</option>
              <option value="created_at:asc">Oldest First</option>
              <option value="creator_stake_amount:desc">Highest Bounty</option>
              <option value="creator_stake_amount:asc">Lowest Bounty</option>
            </select>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-400 text-sm">
            {total} job{total !== 1 ? 's' : ''} found
            {statusFilter && <span className="text-amber-400"> — filtering by {STATUS_LABELS[statusFilter] || statusFilter}</span>}
          </p>
          <button
            onClick={fetchJobs}
            className="text-sm text-gray-500 hover:text-white transition"
          >
            Refresh
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-6 animate-pulse">
                <div className="h-4 bg-gray-800 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-800 rounded w-1/2 mb-4" />
                <div className="h-20 bg-gray-800 rounded mb-4" />
                <div className="h-8 bg-gray-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && jobs.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold mb-2">No jobs found</h3>
            <p className="text-gray-400 mb-6">
              {search
                ? 'Try adjusting your search or filters'
                : 'Be the first to post a job on the marketplace!'}
            </p>
            <Link
              href="/create"
              className="inline-block bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 rounded-lg font-medium transition"
            >
              Post a Job
            </Link>
          </div>
        )}

        {/* Job Grid */}
        {!loading && jobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} myWallet={publicKey?.toBase58()} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm disabled:opacity-40 hover:bg-gray-800 transition"
            >
              Previous
            </button>
            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }

              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition ${
                    p === page
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-900 border border-gray-700 hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm disabled:opacity-40 hover:bg-gray-800 transition"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Job Card Component ─────────────────────────────────────────────────────

function JobCard({ job, myWallet }: { job: BrowseJob; myWallet?: string }) {
  const isCreator = job.creator_id === myWallet;
  const isJoiner = job.joiner_id === myWallet;
  const isJoinable = job.status === 'pending' && !job.joiner_id && !isCreator;
  const totalStake = job.creator_stake_amount + job.joiner_stake_amount;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition group">
      {/* Card Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-semibold text-white group-hover:text-amber-300 transition line-clamp-1">
            {job.title}
          </h3>
          <span
            className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ml-2 ${
              STATUS_COLORS[job.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
            }`}
          >
            {job.status === 'pending' && !job.joiner_id ? 'Hiring' : (STATUS_LABELS[job.status] || job.status)}
          </span>
        </div>

        {job.description && (
          <p className="text-gray-400 text-sm mb-4 line-clamp-2">{job.description}</p>
        )}

        {/* Tags */}
        {job.tags && job.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {job.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400"
              >
                {tag}
              </span>
            ))}
            {job.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{job.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Stake Info */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Bounty</p>
            <p className="text-sm font-bold text-amber-400">{job.creator_stake_amount} SOL</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Worker Stake</p>
            <p className="text-sm font-bold text-blue-400">{job.joiner_stake_amount} SOL</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Total Locked</p>
            <p className="text-sm font-bold text-green-400">{totalStake} SOL</p>
          </div>
        </div>

        {/* Deadline */}
        {job.contract_deadline && (
          <div className="text-xs text-gray-500 mb-3">
            Deadline: <span className="text-gray-400">{new Date(job.contract_deadline).toLocaleDateString()}</span>
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Posted by{' '}
            <span className="text-gray-400 font-mono">
              {job.creator_id.slice(0, 4)}...{job.creator_id.slice(-4)}
            </span>
          </span>
          <span>{timeAgoShort(job.created_at)}</span>
        </div>
        {isCreator && (
          <div className="mt-2">
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
              Your Job
            </span>
          </div>
        )}
        {isJoiner && (
          <div className="mt-2">
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
              Accepted
            </span>
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="border-t border-gray-800 p-4 bg-gray-900/50">
        {isJoinable ? (
          <Link
            href={`/join?code=${job.join_code}`}
            className="block w-full bg-amber-600 hover:bg-amber-500 text-white text-center py-2 rounded-lg text-sm font-medium transition"
          >
            Accept Job
          </Link>
        ) : isCreator || isJoiner ? (
          <Link
            href={`/room/${job.id}`}
            className="block w-full bg-gray-800 hover:bg-gray-700 text-white text-center py-2 rounded-lg text-sm font-medium transition"
          >
            View Job Details
          </Link>
        ) : (
          <Link
            href={`/room/${job.id}`}
            className="block w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-center py-2 rounded-lg text-sm font-medium transition"
          >
            View Details
          </Link>
        )}
      </div>
    </div>
  );
}

function timeAgoShort(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
