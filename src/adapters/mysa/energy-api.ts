/*
mysa2mqtt
Copyright (C) 2025 Pascal Bourque

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Experimental client for Mysa's account-level energy API.
 *
 * The official Mysa app appears to read historical energy from REST endpoints under `/energy/v3/...` on the same host
 * as the device API. The `mysa-js-sdk` does not implement these, but it authorizes requests with `Authorization:
 * <idToken>` (a raw Cognito ID-token JWT, no `Bearer` prefix), which we can reuse via `MysaApiClient.session`.
 *
 * The exact response schema is **not publicly documented and has not been verified** against a live account, so this
 * module fetches defensively and {@link extractEnergyKwh} only returns a value when it can find an unambiguous
 * energy-like field. Callers should log the raw response to confirm the schema before relying on it.
 */

/** The base URL of the Mysa cloud API, as used by `mysa-js-sdk`. */
export const MYSA_API_BASE_URL = 'https://app-prod.mysa.cloud';

/**
 * Fetches the (experimental, unverified) energy payload for a single device.
 *
 * @param deviceId - The Mysa device identifier.
 * @param idToken - The Cognito ID-token JWT (from `MysaApiClient.session.idToken`).
 * @param fetcher - The fetch implementation to use (injectable for testing).
 * @param baseUrl - The API base URL.
 * @returns The parsed JSON response (shape unverified).
 */
export async function fetchMysaDeviceEnergy(
  deviceId: string,
  idToken: string,
  fetcher: typeof fetch = fetch,
  baseUrl: string = MYSA_API_BASE_URL
): Promise<unknown> {
  const response = await fetcher(`${baseUrl}/energy/v3/device/${encodeURIComponent(deviceId)}`, {
    method: 'GET',
    headers: { Authorization: idToken }
  });

  if (!response.ok) {
    throw new Error(`Mysa energy request failed with HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Ranks how strongly a JSON key suggests it holds an energy total. Higher is more specific.
 *
 * @param key - The JSON property name.
 * @returns `3` for `kWh`-like keys, `2` for `energy`-like keys, `1` for `consumption`/`usage`, `0` otherwise.
 */
function energyKeyRank(key: string): number {
  const lower = key.toLowerCase();
  if (lower.includes('kwh')) {
    return 3;
  }
  if (lower.includes('energy')) {
    return 2;
  }
  if (lower.includes('consumption') || lower.includes('usage')) {
    return 1;
  }
  return 0;
}

/**
 * Best-effort extraction of an energy total (assumed kWh) from an unverified Mysa energy payload.
 *
 * Walks the payload and collects finite numeric values whose key looks energy-related, preferring the most specific
 * keys (`kWh` > `energy` > `consumption`/`usage`). To avoid publishing a wrong value, it returns `null` when the
 * most-specific matches disagree (more than one distinct value) or when nothing matches.
 *
 * @param payload - The parsed response from {@link fetchMysaDeviceEnergy}.
 * @returns The extracted energy value, or `null` if none could be determined unambiguously.
 */
export function extractEnergyKwh(payload: unknown): number | null {
  const matches: { rank: number; value: number }[] = [];

  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const rank = energyKeyRank(key);
        if (rank > 0) {
          matches.push({ rank, value });
        }
      }
      visit(value);
    }
  };

  visit(payload);

  if (matches.length === 0) {
    return null;
  }

  const maxRank = Math.max(...matches.map((match) => match.rank));
  const distinctTopValues = Array.from(
    new Set(matches.filter((match) => match.rank === maxRank).map((match) => match.value))
  );

  return distinctTopValues.length === 1 ? distinctTopValues[0] : null;
}
