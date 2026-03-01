export const metadata = {
  title: 'Blink API',
  description: 'Blockchain-backed escrow API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
