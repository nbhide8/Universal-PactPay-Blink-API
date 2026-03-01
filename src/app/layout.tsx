import type { Metadata } from 'next';
import { WalletProviders } from '@/providers/WalletProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'PackedPay — Jobs & Rewards Marketplace | Powered by Blink API',
  description: 'A trustless jobs marketplace built on Solana. Post jobs, stake SOL as bounties, workers stake commitment. Powered by the Blink escrow API.',
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
