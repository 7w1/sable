import { isTauri } from '@tauri-apps/api/core';

const blobCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string>>();

const MEDIA_CACHE_NAME = 'sable-tauri-media-v1';

async function openMediaCache(): Promise<Cache | undefined> {
  try {
    return await caches.open(MEDIA_CACHE_NAME);
  } catch {
    return undefined;
  }
}

/**
 * Fetch a media URL with the given access token and return a blob: URL.
 * Cached in memory and on disk (Cache API) for fast subsequent loads.
 */
export async function fetchAuthenticatedMedia(url: string, accessToken: string): Promise<string> {
  const cached = blobCache.get(url);
  if (cached) return cached;

  const inflight = inflightRequests.get(url);
  if (inflight) return inflight;

  const request = (async () => {
    const diskCache = await openMediaCache();
    if (diskCache) {
      const diskHit = await diskCache.match(url);
      if (diskHit) {
        const blob = await diskHit.blob();
        const objectUrl = URL.createObjectURL(blob);
        blobCache.set(url, objectUrl);
        inflightRequests.delete(url);
        return objectUrl;
      }
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      inflightRequests.delete(url);
      throw new Error(`Media fetch failed: ${res.status}`);
    }

    const cloned = res.clone();
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobCache.set(url, objectUrl);
    inflightRequests.delete(url);

    if (diskCache) {
      diskCache.put(url, cloned).catch(() => {});
    }

    return objectUrl;
  })().catch((err) => {
    inflightRequests.delete(url);
    throw err;
  });

  inflightRequests.set(url, request);
  return request;
}

/** True when media requests need manual auth (Tauri mobile means no service worker). */
export function needsManualMediaAuth(): boolean {
  return isTauri();
}
