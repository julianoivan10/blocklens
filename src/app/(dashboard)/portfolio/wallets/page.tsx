import { Container } from '@/components/ui/section';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { chainProvidersConfigured } from '@/services/chains';
import { WalletManager } from '@/features/portfolio/wallet-manager';
import { CHAINS, CHAIN_IDS } from '@/lib/portfolio/chains';

export const metadata = { title: 'Wallets' };

export default async function WalletsPage() {
  const user = await requireUser('/portfolio/wallets');
  const wallets = await prisma.wallet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { transactions: true } } },
  });

  return (
    <Container className="py-8 sm:py-10">
      <header className="mb-10 max-w-[44rem]">
        <h1 className="font-display text-[1.75rem] leading-none text-ink">Wallets</h1>
        <p className="t-body mt-4">
          Imports public on-chain history from {CHAIN_IDS.map((c) => CHAINS[c].label).join(', ')}. Transfers between wallets
          you track are recognised as internal and never counted as a purchase or a sale.
        </p>
      </header>
      <WalletManager
        enabled={chainProvidersConfigured()}
        wallets={wallets.map((w) => ({
          id: w.id,
          chain: w.chain,
          address: w.address,
          label: w.label,
          syncStatus: w.syncStatus,
          syncError: w.syncError,
          lastSyncedAt: w.lastSyncedAt?.toISOString() ?? null,
          transactionCount: w._count.transactions,
        }))}
      />
    </Container>
  );
}
