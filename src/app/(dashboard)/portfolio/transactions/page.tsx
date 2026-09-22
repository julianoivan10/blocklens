import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Container } from '@/components/ui/section';
import { Badge } from '@/components/ui/badge';
import { requireUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { CHAINS } from '@/lib/portfolio/chains';
import { TX_TYPES } from '@/lib/portfolio/types';
import { formatQuantity, formatUsd, truncateAddress } from '@/lib/format';
import { ManualEntryForm, ReclassifyControl } from '@/features/portfolio/transaction-controls';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Transactions' };

const PAGE = 50;
const DATE = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string; type?: string; page?: string }>;
}) {
  const user = await requireUser('/portfolio/transactions');
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const type = TX_TYPES.find((t) => t === params.type);

  const where: Prisma.TransactionWhereInput = {
    userId: user.id,
    ...(params.review === '1' ? { needsReview: true } : {}),
    ...(type ? { type } : {}),
  };

  const [rows, total, reviewCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      // Only what the table renders — not metadata, contract or asset names.
      select: {
        id: true, timestamp: true, hash: true, chain: true, type: true, source: true, status: true,
        isInternal: true, needsReview: true, reviewReason: true, userOverride: true,
        symbol: true, direction: true, amount: true, usdValue: true, priceSource: true,
        fromAddress: true, toAddress: true,
        wallet: { select: { label: true } },
      },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.count({ where: { userId: user.id, needsReview: true } }),
  ]);

  const qs = (overrides: Record<string, string | undefined>) => {
    const merged = { review: params.review, type, page: undefined as string | undefined, ...overrides };
    const s = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]).toString();
    return s ? `?${s}` : '';
  };

  return (
    <Container className="py-8 sm:py-10" width="wide">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] leading-none text-ink">Transactions</h1>
          <p className="t-micro-tight mt-3 text-ink-ghost">
            {total} {total === 1 ? 'movement' : 'movements'} · {reviewCount} need review
          </p>
        </div>
        <Link href="/portfolio" className="t-micro-tight text-ink-faint hover:text-ink">← Portfolio</Link>
      </header>

      <div className="grid grid-cols-1 gap-x-12 gap-y-12 xl:grid-cols-12">
        <section className="xl:col-span-9">
          <nav className="mb-4 flex flex-wrap gap-1" aria-label="Filter">
            {[
              { label: 'All', href: qs({ review: undefined, type: undefined }), active: !params.review && !type },
              { label: `Needs review (${reviewCount})`, href: qs({ review: '1', type: undefined }), active: params.review === '1' },
              ...TX_TYPES.map((t) => ({ label: t.replace('_', ' ').toLowerCase(), href: qs({ type: t, review: undefined }), active: type === t })),
            ].map((f) => (
              <Link
                key={f.label}
                href={`/portfolio/transactions${f.href}`}
                className={cn('px-2.5 py-1 text-[0.75rem] transition-colors', f.active ? 'bg-panel-raised text-ink' : 'text-ink-ghost hover:text-ink-dim')}
              >
                {f.label}
              </Link>
            ))}
          </nav>

          {rows.length === 0 ? (
            <p className="t-body-sm py-10 text-ink-faint">No transactions match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-left text-[0.8125rem]" data-testid="tx-table">
                <thead>
                  <tr className="border-b border-line">
                    {['Date (UTC)', 'Type', 'Asset', 'Amount', 'USD value', 'Where', 'Counterparty', ''].map((h, i) => (
                      <th key={i} className={cn('t-micro-tight py-3 pr-4 font-normal', (i === 3 || i === 4) && 'text-right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const counterparty = r.direction > 0 ? r.fromAddress : r.toAddress;
                    return (
                      <tr key={r.id} className="border-b border-line-faint align-top">
                        <td className="py-3 pr-4 font-mono text-[0.75rem] text-ink-faint">
                          {r.hash && r.chain ? (
                            <a href={CHAINS[r.chain].explorerTx(r.hash)} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
                              {DATE.format(r.timestamp)}
                            </a>
                          ) : (
                            DATE.format(r.timestamp)
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-ink">{r.type.replace('_', ' ').toLowerCase()}</span>
                            {r.isInternal && <Badge tone="neutral">Own wallets</Badge>}
                            {r.status === 'FAILED' && <Badge tone="down">Failed tx</Badge>}
                            {r.needsReview && <Badge tone="caution" title={r.reviewReason ?? undefined}>Needs review</Badge>}
                            {r.userOverride && r.source === 'WALLET' && <Badge tone="signal">Classified by you</Badge>}
                          </div>
                          {r.needsReview && r.reviewReason && (
                            <p className="mt-1 max-w-[18rem] text-[0.6875rem] leading-snug text-ink-ghost">{r.reviewReason}</p>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-ink">{r.symbol}</td>
                        <td className={cn('py-3 pr-4 text-right font-mono tabular-nums', r.direction > 0 ? 'text-up' : 'text-ink-dim')}>
                          {r.direction > 0 ? '+' : '−'}
                          {formatQuantity(r.amount.toNumber())}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono tabular-nums text-ink-dim">
                          {r.usdValue ? formatUsd(r.usdValue.toNumber()) : '—'}
                          {r.priceSource && <div className="text-[0.625rem] text-ink-ghost">{r.priceSource}</div>}
                        </td>
                        <td className="py-3 pr-4 text-[0.75rem] text-ink-faint">
                          {r.wallet ? `${r.wallet.label} · ${r.chain ? CHAINS[r.chain].label : ''}` : 'Manual'}
                        </td>
                        <td className="py-3 pr-4 font-mono text-[0.6875rem] text-ink-ghost">{counterparty ? truncateAddress(counterparty, 4) : '—'}</td>
                        <td className="py-3 text-right">
                          <ReclassifyControl
                            id={r.id}
                            type={r.type}
                            direction={r.direction > 0 ? 1 : -1}
                            isInternal={r.isInternal}
                            hasValue={r.usdValue !== null}
                            manual={r.source === 'MANUAL'}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            {page > 1 ? <Link href={`/portfolio/transactions${qs({ page: String(page - 1) })}`} className="t-micro-tight text-ink-faint hover:text-ink">← Newer</Link> : <span />}
            {page * PAGE < total && <Link href={`/portfolio/transactions${qs({ page: String(page + 1) })}`} className="t-micro-tight text-ink-faint hover:text-ink">Older →</Link>}
          </div>
        </section>

        <aside className="xl:col-span-3">
          <h2 className="t-micro border-b border-line pb-3">Record a purchase or sale</h2>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-ghost">
            For activity off-chain, such as an exchange. On-chain activity is imported from your wallets.
          </p>
          <div className="mt-6">
            <ManualEntryForm />
          </div>
        </aside>
      </div>
    </Container>
  );
}
