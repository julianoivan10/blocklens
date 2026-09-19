/**
 * The envelope every data read crosses the UI boundary in.
 *
 * The product rule is that a failed provider must never be papered over
 * with an invented number, so "unavailable" is a first-class state the
 * interface has to render rather than an exception the page swallows.
 * Provenance travels with the value so a view can say where a figure
 * came from.
 */

export type Provenance = 'live' | 'sample';

export type DataResult<T> =
  | { status: 'ok'; data: T; provenance: Provenance }
  | { status: 'unavailable'; reason: string; provenance: Provenance };

export function ok<T>(data: T, provenance: Provenance = 'live'): DataResult<T> {
  return { status: 'ok', data, provenance };
}

export function unavailable<T>(
  reason: string,
  provenance: Provenance = 'live'
): DataResult<T> {
  return { status: 'unavailable', reason, provenance };
}

export function isOk<T>(
  result: DataResult<T>
): result is { status: 'ok'; data: T; provenance: Provenance } {
  return result.status === 'ok';
}

/**
 * Runs a provider read and converts a throw into an `unavailable`
 * result. The reason is logged in full server-side; what reaches the
 * client is a short, non-leaking summary.
 */
export async function attempt<T>(
  label: string,
  read: () => Promise<T>,
  provenance: Provenance = 'live'
): Promise<DataResult<T>> {
  try {
    return ok(await read(), provenance);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[data] ${label} unavailable: ${detail}`);
    return unavailable(`${label} is temporarily unavailable`, provenance);
  }
}
