import {
  createClient,
  MatrixClient,
  IndexedDBStore,
  IndexedDBCryptoStore,
} from '$types/matrix-sdk';

import { clearNavToActivePathStore } from '$state/navToActivePath';
import {
  Session,
  Sessions,
  SessionStoreName,
  getSessionStoreName,
  MATRIX_SESSIONS_KEY,
} from '$state/sessions';
import { getLocalStorageItem } from '$state/utils/atomWithLocalStorage';
import { createLogger } from '$utils/debug';
import { pushSessionToSW } from '../sw-session';
import { cryptoCallbacks } from './secretStorageKeys';
import { SlidingSyncConfig, SlidingSyncDiagnostics, SlidingSyncManager } from './slidingSync';

const log = createLogger('initMatrix');
const slidingSyncByClient = new WeakMap<MatrixClient, SlidingSyncManager>();
type SyncTransport = 'classic' | 'sliding';
type SyncTransportMeta = {
  transport: SyncTransport;
  slidingConfigured: boolean;
  fallbackFromSliding: boolean;
};
const syncTransportByClient = new WeakMap<MatrixClient, SyncTransportMeta>();

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve) => {
    const req = window.indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // resolve anyway — we tried
    req.onblocked = () => resolve();
  });

const deleteSyncStoreGroup = async (syncStoreName: string): Promise<void> => {
  await Promise.all([
    deleteDatabase(syncStoreName),
    deleteDatabase(syncStoreName.replace(/^sync/, 'crypto')),
    deleteDatabase(`${syncStoreName}::matrix-sdk-crypto`),
  ]);
};

const deleteSessionStores = async (storeName: SessionStoreName): Promise<void> => {
  await Promise.all([
    deleteDatabase(storeName.sync),
    deleteDatabase(storeName.crypto),
    deleteDatabase(`${storeName.rustCryptoPrefix}::matrix-sdk-crypto`),
  ]);
};

/**
 * Reads the account stored in an IndexedDB sync store without opening a full MatrixClient.
 * Returns undefined if the database doesn't exist or has no account record.
 */
const readStoredAccount = (dbName: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    const req = window.indexedDB.open(dbName);
    req.onerror = () => resolve(undefined);
    req.onsuccess = () => {
      const db = req.result;
      try {
        if (!db.objectStoreNames.contains('account')) {
          db.close();
          resolve(undefined);
        } else {
          const tx = db.transaction('account', 'readonly');
          const store = tx.objectStore('account');
          const getReq = store.get('account');
          getReq.onsuccess = () => {
            db.close();
            const record = getReq.result;
            if (!record?.account_data) {
              resolve(undefined);
            } else {
              try {
                const data = JSON.parse(record.account_data);
                resolve(data?.user_id ?? undefined);
              } catch {
                resolve(undefined);
              }
            }
          };
          getReq.onerror = () => {
            db.close();
            resolve(undefined);
          };
        }
      } catch {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        resolve(undefined);
      }
    };
  });

/**
 * Pre-flight check: scans every IndexedDB database and deletes any that
 * belong to a userId not present in the stored sessions list, or whose
 * sync-store data contradicts the expected session userId.
 * Call this once on startup before initClient.
 */
export const clearMismatchedStores = async (): Promise<void> => {
  const sessions = getLocalStorageItem<Sessions>(MATRIX_SESSIONS_KEY, []);
  const knownUserIds = new Set(sessions.map((s) => s.userId));
  const knownStoreNames = new Set(
    sessions.flatMap((s) => {
      const sn = getSessionStoreName(s);
      return [sn.sync, sn.crypto, `${sn.rustCryptoPrefix}::matrix-sdk-crypto`];
    })
  );

  let allDbs: IDBDatabaseInfo[] = [];
  try {
    allDbs = await window.indexedDB.databases();
  } catch {
    // databases() not supported in all browsers
  }

  await Promise.all(
    allDbs.map(async ({ name }) => {
      if (!name) return;

      const containsKnownUser = Array.from(knownUserIds).some((uid) => name.includes(uid));
      const looksLikeUserDb = name.includes('@');
      if (looksLikeUserDb && !containsKnownUser && !knownStoreNames.has(name)) {
        log.warn(`clearMismatchedStores: "${name}" has unknown user — deleting`);
        await deleteDatabase(name);
        return;
      }

      if (!name.startsWith('sync')) return;

      const storedUserId = await readStoredAccount(name);
      if (!storedUserId) return;

      if (!knownUserIds.has(storedUserId)) {
        log.warn(`clearMismatchedStores: "${name}" has unknown user ${storedUserId} — deleting`);
        await deleteSyncStoreGroup(name);
        return;
      }

      const expectedStore = `sync${storedUserId}`;
      if (name !== expectedStore && !knownStoreNames.has(name)) {
        log.warn(`clearMismatchedStores: "${name}" is misplaced for ${storedUserId} — deleting`);
        await deleteSyncStoreGroup(name);
      }
    })
  );

  await Promise.all(
    sessions.map(async (session) => {
      const sn = getSessionStoreName(session);
      const storedUserId = await readStoredAccount(sn.sync);
      if (storedUserId && storedUserId !== session.userId) {
        log.warn(
          `clearMismatchedStores: "${sn.sync}" has ${storedUserId} but session is ${session.userId} — deleting`
        );
        await deleteSessionStores(sn);
      }
    })
  );
};

const buildClient = async (session: Session): Promise<MatrixClient> => {
  const storeName = getSessionStoreName(session);

  const indexedDBStore = new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: storeName.sync,
  });

  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, storeName.crypto);

  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store: indexedDBStore,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });

  await indexedDBStore.startup();
  return mx;
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  const storeName = getSessionStoreName(session);
  log.log('initClient', { userId: session.userId, baseUrl: session.baseUrl, storeName });

  const isMismatch = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("doesn't match") ||
      msg.includes('does not match') ||
      msg.includes('account in the store') ||
      msg.includes('account in the constructor')
    );
  };

  const wipeAllStores = async () => {
    log.warn('initClient: wiping all stores for', session.userId);
    await deleteSessionStores(storeName);
    try {
      const allDbs = await window.indexedDB.databases();
      await Promise.all(
        allDbs.map(async ({ name }) => {
          if (name && name.includes(session.userId)) {
            log.warn('initClient: also wiping db', name);
            await deleteDatabase(name);
          }
        })
      );
    } catch {
      // databases() not available in all browsers
    }
  };

  let mx: MatrixClient;
  try {
    mx = await buildClient(session);
  } catch (err) {
    if (!isMismatch(err)) throw err;
    log.warn('initClient: mismatch on buildClient — wiping and retrying:', err);
    await wipeAllStores();
    mx = await buildClient(session);
  }

  try {
    await mx.initRustCrypto({ cryptoDatabasePrefix: storeName.rustCryptoPrefix });
  } catch (err) {
    if (!isMismatch(err)) throw err;
    log.warn('initClient: mismatch on initRustCrypto — wiping and retrying:', err);
    mx.stopClient();
    await wipeAllStores();
    mx = await buildClient(session);
    await mx.initRustCrypto({ cryptoDatabasePrefix: storeName.rustCryptoPrefix });
  }

  mx.setMaxListeners(50);
  return mx;
};

export type StartClientConfig = {
  baseUrl?: string;
  slidingSync?: SlidingSyncConfig;
};

export type ClientSyncDiagnostics = SyncTransportMeta & {
  syncState: string | null;
  sliding?: SlidingSyncDiagnostics;
};

const disposeSlidingSync = (mx: MatrixClient): void => {
  const manager = slidingSyncByClient.get(mx);
  if (!manager) return;
  manager.dispose();
  slidingSyncByClient.delete(mx);
};

export const stopClient = (mx: MatrixClient): void => {
  disposeSlidingSync(mx);
  mx.stopClient();
};

export const startClient = async (mx: MatrixClient, config?: StartClientConfig) => {
  log.log('startClient', mx.getUserId());
  disposeSlidingSync(mx);
  const slidingConfig = config?.slidingSync;
  const proxyBaseUrl = slidingConfig?.proxyBaseUrl ?? config?.baseUrl;
  const slidingEnabled = false; // temporary
  const canUseSliding = slidingEnabled && typeof proxyBaseUrl === 'string';
  syncTransportByClient.set(mx, {
    transport: 'classic',
    slidingConfigured: canUseSliding,
    fallbackFromSliding: false,
  });

  if (!canUseSliding) {
    await mx.startClient({
      lazyLoadMembers: true,
    });
    return;
  }

  const resolvedProxyBaseUrl = proxyBaseUrl;
  const manager = new SlidingSyncManager(mx, resolvedProxyBaseUrl, slidingConfig ?? {});
  const supported = await SlidingSyncManager.probe(
    mx,
    resolvedProxyBaseUrl,
    manager.probeTimeoutMs
  );
  if (!supported) {
    syncTransportByClient.set(mx, {
      transport: 'classic',
      slidingConfigured: canUseSliding,
      fallbackFromSliding: true,
    });
    log.warn('Sliding Sync unavailable, falling back to classic sync for', mx.getUserId());
    await mx.startClient({
      lazyLoadMembers: true,
    });
    return;
  }

  manager.attach();
  slidingSyncByClient.set(mx, manager);
  syncTransportByClient.set(mx, {
    transport: 'sliding',
    slidingConfigured: true,
    fallbackFromSliding: false,
  });

  try {
    await mx.startClient({
      lazyLoadMembers: true,
      slidingSync: manager.slidingSync,
    });
  } catch (err) {
    disposeSlidingSync(mx);
    throw err;
  }
};

export const clearCacheAndReload = async (mx: MatrixClient) => {
  log.log('clearCacheAndReload', mx.getUserId());
  stopClient(mx);
  clearNavToActivePathStore(mx.getSafeUserId());
  await mx.store.deleteAllData();
  window.location.reload();
};

export const getClientSyncDiagnostics = (mx: MatrixClient): ClientSyncDiagnostics => {
  const meta = syncTransportByClient.get(mx) ?? {
    transport: 'classic',
    slidingConfigured: false,
    fallbackFromSliding: false,
  };
  return {
    ...meta,
    syncState: mx.getSyncState(),
    sliding: slidingSyncByClient.get(mx)?.getDiagnostics(),
  };
};

/**
 * Logs out a Matrix client and cleans up its SDK stores + IndexedDB databases.
 * Does NOT touch the Jotai sessions atom — callers must do that themselves
 * so the correct Jotai Provider store is used.
 */
export const logoutClient = async (mx: MatrixClient, session?: Session) => {
  log.log('logoutClient', { userId: mx.getUserId(), sessionUserId: session?.userId });
  pushSessionToSW();
  stopClient(mx);
  try {
    await mx.logout();
  } catch {
    // ignore
  }

  if (session) {
    const storeName: SessionStoreName = getSessionStoreName(session);
    await mx.clearStores({ cryptoDatabasePrefix: storeName.rustCryptoPrefix });
    await deleteDatabase(storeName.sync);
    await deleteDatabase(storeName.crypto);
    await deleteDatabase(`${storeName.rustCryptoPrefix}::matrix-sdk-crypto`);
  } else {
    await mx.clearStores();
    window.localStorage.clear();
  }
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();
  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) window.indexedDB.deleteDatabase(name);
  });
  window.localStorage.clear();
  window.location.reload();
};
