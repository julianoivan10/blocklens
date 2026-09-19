import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formatting lives in `@/lib/format`. Re-exported here so existing
 * imports keep working; prefer importing from `@/lib/format` directly.
 */
export {
  formatCurrency,
  formatPrice,
  formatCompactNumber,
  formatCompactCurrency,
  formatLargeNumber,
  formatCompactCount,
  formatPercentage,
  formatShare,
  formatSupply,
  formatDate,
  formatTimeAgo,
  truncateAddress,
} from './format';
