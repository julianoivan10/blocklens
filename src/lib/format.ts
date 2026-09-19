/**
 * Presentation formatting.
 *
 * Kept separate from `utils.ts` so the formatting vocabulary is one
 * import, and so figures are consistent everywhere: the same value
 * never renders two ways in two views.
 */

/**
 * Price, with precision chosen from magnitude. A sub-dollar token
 * rendered at two decimals loses all of its information, so the
 * precision follows the value rather than being fixed.
 */
export function formatPrice(value: number): string {
  const abs = Math.abs(value);
  let maximumFractionDigits: number;

  if (abs === 0) maximumFractionDigits = 2;
  else if (abs < 0.01) maximumFractionDigits = 6;
  else if (abs < 1) maximumFractionDigits = 4;
  else if (abs < 1000) maximumFractionDigits = 2;
  else maximumFractionDigits = 0;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: abs >= 1000 ? 0 : Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(value);
}

/** Back-compatible alias: the original name used across the app. */
export const formatCurrency = formatPrice;

const UNITS = [
  { threshold: 1e12, suffix: 'T' },
  { threshold: 1e9, suffix: 'B' },
  { threshold: 1e6, suffix: 'M' },
  { threshold: 1e3, suffix: 'K' },
] as const;

function compact(value: number, digits: number): { figure: string; suffix: string } {
  const abs = Math.abs(value);
  for (const { threshold, suffix } of UNITS) {
    if (abs >= threshold) {
      return { figure: (value / threshold).toFixed(digits), suffix };
    }
  }
  return { figure: value.toFixed(abs < 1 ? 2 : 0), suffix: '' };
}

/** Compact money: `$1.32T`, `$28.5B`. */
export function formatCompactCurrency(value: number, digits = 2): string {
  const { figure, suffix } = compact(value, digits);
  return `$${figure}${suffix}`;
}

/** Back-compatible alias. */
export const formatCompactNumber = formatCompactCurrency;

/** Compact count, no currency symbol: `892K`, `1.12M`. */
export function formatCompactCount(value: number, digits = 2): string {
  const { figure, suffix } = compact(value, digits);
  return `${figure}${suffix}`;
}

/** Back-compatible alias. */
export const formatLargeNumber = formatCompactCount;

/** Signed percentage: `+1.88%`, `-0.42%`. */
export function formatPercentage(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/** Unsigned percentage, for shares of a whole. */
export function formatShare(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** Token quantity with its symbol: `19.64M BTC`. */
export function formatSupply(value: number, symbol: string): string {
  return `${formatCompactCount(value)} ${symbol}`;
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** `14 Mar 2024` style, stable between server and client via UTC. */
export function formatDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_FMT.format(date);
}

/**
 * Coarse relative time. Deliberately coarse: minute-accurate
 * relative times drift between server render and hydration.
 */
export function formatTimeAgo(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '—';

  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatDate(date);
}

/** Splits a figure from its unit so they can wear different type. */
export function splitFigure(formatted: string): { value: string; unit: string } {
  const match = formatted.match(/^([^A-Za-z]*)([A-Za-z%]*)$/);
  if (!match) return { value: formatted, unit: '' };
  return { value: match[1], unit: match[2] };
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}
