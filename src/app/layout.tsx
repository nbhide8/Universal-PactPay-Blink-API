import type { Metadata } from 'next';
import { WalletProviders } from '@/providers/WalletProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'StakeGuard — Trustless Escrow Agreements',
  description: 'Create escrow rooms where both parties stake SOL. Skin in the game for everyone.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white min-h-screen">
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}
