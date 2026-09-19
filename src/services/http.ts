import 'server-only';

/**
 * The single outbound HTTP path for every provider adapter.
 *
 * Centralised so timeouts, cache windows, error shapes and user-agent
 * are identical everywhere, and so no adapter can quietly invent its
 * own retry or swallow its own failure.
 */

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

interface RequestOptions {
  /** Provider name, used in error messages and logs. */
  provider: string;
  /** Seconds the response may be reused. Uses Next's fetch cache. */
  revalidate: number;
  /** Abort after this many milliseconds. */
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Cache tags, so a provider's entries can be invalidated together. */
  tags?: string[];
  method?: 'GET' | 'POST';
  body?: unknown;
}

const DEFAULT_TIMEOUT_MS = 8_000;

async function request(url: string, options: RequestOptions): Promise<Response> {
  const {
    provider,
    revalidate,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = {},
    tags,
    method = 'GET',
    body,
  } = options;

  // A hung provider must not hold a page render open indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BlockLens/1.0 (+https://blocklens.app)',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      // POSTs are never cached; GETs use the framework's data cache.
      ...(method === 'POST'
        ? { cache: 'no-store' as const }
        : { next: { revalidate, ...(tags ? { tags } : {}) } }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(
        provider,
        `HTTP ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`,
        res.status
      );
    }

    return res;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new ProviderError(provider, `timed out after ${timeoutMs}ms`);
    }
    throw new ProviderError(provider, (error as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, options: RequestOptions): Promise<T> {
  const res = await request(url, options);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderError(options.provider, 'response was not valid JSON');
  }
}

export async function fetchText(url: string, options: RequestOptions): Promise<string> {
  const res = await request(url, {
    ...options,
    headers: { Accept: 'application/rss+xml, application/xml, text/xml', ...options.headers },
  });
  return res.text();
}

/**
 * Resolves the settled results of several provider calls, keeping the
 * successes and reporting the failures.
 *
 * Used where a view composes independent sources: one provider being
 * down should cost that one reading, not the whole page.
 */
export async function settleAll<T>(
  entries: Array<{ label: string; promise: Promise<T> }>
): Promise<{ values: T[]; failures: string[] }> {
  const settled = await Promise.allSettled(entries.map((e) => e.promise));
  const values: T[] = [];
  const failures: string[] = [];

  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      values.push(result.value);
    } else {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn(`[provider] ${entries[i].label} failed: ${reason}`);
      failures.push(entries[i].label);
    }
  });

  return { values, failures };
}
