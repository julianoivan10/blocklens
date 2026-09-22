import { z } from 'zod';
import { CHAIN_IDS, looksLikeSecret, normalizeAddress, type ChainId } from './chains';
import { TX_TYPES } from './types';
import { ALERT_TYPES, type AlertType } from '@/lib/alerts/evaluate';

export const SECRET_REFUSAL =
  'That looks like a private key or recovery phrase. BlockLens never needs either — paste the public wallet address instead. If you pasted a real key anywhere, treat that wallet as compromised.';

export const addWalletSchema = z
  .object({
    chain: z.enum(CHAIN_IDS as [ChainId, ...ChainId[]]),
    address: z.string().trim().min(1, 'Address is required').max(200),
    label: z.string().trim().min(1, 'Label is required').max(60),
  })
  .superRefine((v, ctx) => {
    if (looksLikeSecret(v.address)) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: SECRET_REFUSAL });
      return;
    }
    if (!normalizeAddress(v.chain, v.address)) {
      ctx.addIssue({
        code: 'custom',
        path: ['address'],
        message: v.chain === 'SOLANA' ? 'Enter a valid Solana address.' : 'Enter a valid 0x… address (42 characters).',
      });
    }
  });

export const updateWalletSchema = z.object({ label: z.string().trim().min(1).max(60) });

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Za-z0-9.-]+$/, 'Symbol contains unsupported characters')
  .transform((s) => s.toUpperCase());

export const manualTransactionSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  symbol,
  quantity: z.coerce.number().positive('Quantity must be positive').finite(),
  /** USD per unit. When omitted, the daily close for the date is used if one exists. */
  priceUsd: z.coerce.number().positive('Price must be positive').finite().optional(),
  feeUsd: z.coerce.number().min(0).finite().optional(),
  date: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 60_000, 'Date cannot be in the future')
    .refine((d) => d.getTime() >= Date.UTC(2009, 0, 3), 'Date is before any crypto asset existed'),
  note: z.string().trim().max(200).optional(),
});

export const reclassifySchema = z
  .object({
    type: z.enum(TX_TYPES as [string, ...string[]]).optional(),
    priceUsd: z.coerce.number().positive().finite().optional(),
    isInternal: z.boolean().optional(),
  })
  .refine((v) => v.type !== undefined || v.priceUsd !== undefined || v.isInternal !== undefined, 'Nothing to change');

/** Which types a leg may be given, by its direction. */
export const TYPES_BY_DIRECTION: Record<1 | -1, string[]> = {
  1: ['BUY', 'TRANSFER_IN', 'SWAP', 'UNSTAKE', 'UNKNOWN'],
  [-1]: ['SELL', 'TRANSFER_OUT', 'SWAP', 'FEE', 'STAKE', 'UNKNOWN'],
};

export const transactionQuerySchema = z.object({
  type: z.enum(TX_TYPES as [string, ...string[]]).optional(),
  review: z.enum(['1', '0']).optional(),
  walletId: z.string().max(40).optional(),
  asset: z.string().max(120).optional(),
  cursor: z.string().max(40).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});

export const alertSchema = z
  .object({
    type: z.enum(Object.keys(ALERT_TYPES) as [AlertType, ...AlertType[]]),
    symbol: symbol.optional(),
    walletId: z.string().max(40).optional().nullable(),
    threshold: z.coerce.number().finite().optional(),
    cooldownMinutes: z.coerce.number().int().min(15).max(10_080).default(360),
    notifyEmail: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const spec = ALERT_TYPES[v.type];
    if (spec.needsSymbol && !v.symbol) ctx.addIssue({ code: 'custom', path: ['symbol'], message: 'Choose an asset' });
    if (spec.needsThreshold && (v.threshold === undefined || v.threshold <= 0)) {
      ctx.addIssue({ code: 'custom', path: ['threshold'], message: 'Enter a positive threshold' });
    }
    if ((v.type === 'ALLOCATION_ABOVE' || v.type === 'PORTFOLIO_DRAWDOWN') && (v.threshold ?? 0) > 100) {
      ctx.addIssue({ code: 'custom', path: ['threshold'], message: 'A percentage cannot exceed 100' });
    }
  });

export const alertUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  threshold: z.coerce.number().positive().finite().optional(),
  cooldownMinutes: z.coerce.number().int().min(15).max(10_080).optional(),
});
