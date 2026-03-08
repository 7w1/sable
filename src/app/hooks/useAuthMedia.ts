import { useState, useEffect } from 'react';
import { fetchAuthenticatedMedia, needsManualMediaAuth } from '$utils/tauriMediaCache';
import { useMatrixClient } from './useMatrixClient';

/**
 * Returns a usable image URL. On Tauri (no service worker) it fetches
 * with the access token and returns a cached blob: URL instead.
 */
export function useAuthMedia(url?: string): string | undefined {
  const mx = useMatrixClient();
  const manualAuth = needsManualMediaAuth();
  const isAlreadyResolved = !!url && (url.startsWith('blob:') || url.startsWith('data:'));

  const [blobUrl, setBlobUrl] = useState<string | undefined>(() => {
    if (!manualAuth || !url || isAlreadyResolved) return url;
    return undefined;
  });

  useEffect(() => {
    if (!manualAuth || !url || isAlreadyResolved) {
      setBlobUrl(url);
      return undefined;
    }

    let cancelled = false;
    const token = mx.getAccessToken();

    if (!token) {
      setBlobUrl(url);
      return undefined;
    }

    fetchAuthenticatedMedia(url, token)
      .then((result) => {
        if (!cancelled) setBlobUrl(result);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl(url);
      });

    return () => {
      cancelled = true;
    };
  }, [url, mx, manualAuth, isAlreadyResolved]);

  return manualAuth ? blobUrl : url;
}
