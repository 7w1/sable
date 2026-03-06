import {
  MatrixClient,
  MSC3575List,
  MSC3575RoomSubscription,
  SlidingSync,
  SlidingSyncEvent,
  SlidingSyncState,
  MSC3575_STATE_KEY_LAZY,
  MSC3575_STATE_KEY_ME,
  EventType,
} from '$types/matrix-sdk';
import { StateEvent } from '$types/matrix/room';
import { createLogger } from '$utils/debug';

const log = createLogger('slidingSync');

// List keys — matches Element Web's 5-list strategy
// Multiple lists ensure invites/favourites/DMs populate immediately rather than
// waiting for the slower untagged spider to reach them.
const LIST_SPACES = 'spaces';
const LIST_INVITES = 'invites';
const LIST_FAVOURITES = 'favourites';
const LIST_DIRECTS = 'directs';
const LIST_UNTAGGED = 'untagged';

// Named custom subscription for unencrypted rooms.
// Lazy-loads members so large rooms (e.g. Matrix HQ) don't stall the initial load.
// Registered at construction time alongside the encrypted default subscription.
const UNENCRYPTED_SUBSCRIPTION_NAME = 'unencrypted';

const DEFAULT_LIST_PAGE_SIZE = 250;
// Timeline limit used only for the active-room subscription (not list entries).
// Tiers match common network/device capability ranges:
//   LOW  (30) — constrained connection/device: still fills a screen without paginating
//   MED  (50) — standard; matches Element Web's flat default
//   HIGH (100) — fast connection + desktop: rich initial scroll buffer
const DEFAULT_TIMELINE_LIMIT = 50;
const TIMELINE_LIMIT_LOW = 30;
const TIMELINE_LIMIT_MEDIUM = 50;
const TIMELINE_LIMIT_HIGH = 100;
// List entries carry only the last message for preview (matches Element Web)
const LIST_TIMELINE_LIMIT = 1;
const DEFAULT_POLL_TIMEOUT_MS = 10000;
const DEFAULT_MAX_ROOMS = 5000;
// Initial window per list when first connecting (expanded by spidering on each response)
const INITIAL_RANGE_SIZE = 20;

export type SlidingSyncConfig = {
  enabled?: boolean;
  proxyBaseUrl?: string;
  bootstrapClassicOnColdCache?: boolean;
  listPageSize?: number;
  timelineLimit?: number;
  pollTimeoutMs?: number;
  maxRooms?: number;
  probeTimeoutMs?: number;
};

export type SlidingSyncListDiagnostics = {
  key: string;
  knownCount: number;
  rangeEnd: number;
};

export type SlidingSyncDeviceDiagnostics = {
  saveData: boolean;
  effectiveType: string | null;
  deviceMemoryGb: number | null;
  mobile: boolean;
  missingSignals: number;
};

export type SlidingSyncDiagnostics = {
  proxyBaseUrl: string;
  timelineLimit: number;
  listPageSize: number;
  adaptiveTimeline: boolean;
  device: SlidingSyncDeviceDiagnostics;
  lists: SlidingSyncListDiagnostics[];
};

const clampPositive = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback;
  return Math.round(value);
};

type AdaptiveSignals = SlidingSyncDeviceDiagnostics;

const readAdaptiveSignals = (): AdaptiveSignals => {
  const navigatorLike = typeof navigator !== 'undefined' ? navigator : undefined;
  const connection = (navigatorLike as any)?.connection;
  const effectiveType = connection?.effectiveType;
  const deviceMemory = (navigatorLike as any)?.deviceMemory;

  const uaMobile = (navigatorLike as any)?.userAgentData?.mobile;
  const fallbackMobileUA = navigatorLike?.userAgent ?? '';
  const mobileByUA =
    typeof uaMobile === 'boolean'
      ? uaMobile
      : /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(fallbackMobileUA);

  const saveData = connection?.saveData === true;
  const normalizedEffectiveType = typeof effectiveType === 'string' ? effectiveType : null;
  const normalizedDeviceMemory = typeof deviceMemory === 'number' ? deviceMemory : null;
  const missingSignals =
    Number(normalizedEffectiveType === null) + Number(normalizedDeviceMemory === null);

  return {
    saveData,
    effectiveType: normalizedEffectiveType,
    deviceMemoryGb: normalizedDeviceMemory,
    mobile: mobileByUA,
    missingSignals,
  };
};

const resolveAdaptiveTimelineLimit = (
  configuredLimit: number | undefined,
  pageSize: number,
  signals: AdaptiveSignals
): number => {
  if (typeof configuredLimit === 'number' && configuredLimit > 0) {
    return clampPositive(configuredLimit, DEFAULT_TIMELINE_LIMIT);
  }

  if (signals.saveData || signals.effectiveType === 'slow-2g' || signals.effectiveType === '2g') {
    return Math.min(pageSize, TIMELINE_LIMIT_LOW);
  }

  if (
    signals.effectiveType === '3g' ||
    (signals.deviceMemoryGb !== null && signals.deviceMemoryGb <= 4)
  ) {
    return Math.min(pageSize, TIMELINE_LIMIT_MEDIUM);
  }

  // Mobile PWAs/browsers often omit NetworkInformation and/or device memory APIs.
  // If any key adaptive signals are missing on mobile, pick a conservative medium limit.
  if (signals.mobile && signals.missingSignals > 0) {
    return Math.min(pageSize, TIMELINE_LIMIT_MEDIUM);
  }

  return Math.min(pageSize, TIMELINE_LIMIT_HIGH);
};

// Lean required_state for list sidebar entries.
// Matches Element Web's REQUIRED_STATE_LIST exactly, plus Sable-specific cosmetics
// and m.room.name (needed for sidebar display names in rooms without a canonical alias).
// Lazy member loading is intentionally absent — it belongs only in room subscriptions
// so that the sidebar list entries stay as bandwidth-efficient as possible.
const LIST_REQUIRED_STATE: MSC3575RoomSubscription['required_state'] = [
  [EventType.RoomMember, MSC3575_STATE_KEY_ME], // know we're in the room
  [EventType.RoomCreate, ''], // isSpaceRoom() checks
  [EventType.RoomName, ''], // room display name (Sable needs this for sidebar)
  [EventType.RoomAvatar, ''], // sidebar / list avatar
  [EventType.RoomCanonicalAlias, ''], // room name fallback
  [EventType.RoomEncryption, ''], // E2E lock icon
  [EventType.RoomTombstone, ''], // hide replaced rooms
  [EventType.RoomJoinRules, ''], // public/private icon
  [EventType.SpaceChild, '*'], // space child membership
  [EventType.SpaceParent, '*'], // space parent membership
  [EventType.RoomPowerLevels, ''], // permission checks before room opens
  // Sable cosmetics — needed in the sidebar before a room is opened
  [StateEvent.RoomCosmeticsColor, '*'],
  [StateEvent.RoomCosmeticsFont, '*'],
  [StateEvent.RoomCosmeticsPronouns, '*'],
];

// include_old_rooms state shared by all list entries.
// Fetches minimal state for tombstoned / replaced predecessor rooms so the SDK
// can correctly hide them and resolve successor room chains.
const LIST_INCLUDE_OLD_ROOMS: MSC3575RoomSubscription = {
  timeline_limit: 0,
  required_state: LIST_REQUIRED_STATE,
};

// Default (encrypted) subscription — used as the SlidingSync constructor default.
// Requests all state events: the E2E layer needs full member state for key distribution
// and defaulting to the safe/complete set avoids missed events when room encryption
// status is not yet known (e.g. on first load after a hard refresh).
// Matches Element Web's ENCRYPTED_SUBSCRIPTION / constructor default strategy.
const buildEncryptedSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: [['*', '*']],
});

// Custom subscription for unencrypted rooms, registered under UNENCRYPTED_SUBSCRIPTION_NAME.
// Lazy-loads members so large public rooms don't stall the initial room open.
// Matches Element Web's UNENCRYPTED_SUBSCRIPTION strategy.
const buildUnencryptedSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: [
    // Everything from the list state
    ...LIST_REQUIRED_STATE,
    // Lazy-load members — keeps large rooms fast; encrypted rooms use ['*','*'] instead
    [EventType.RoomMember, MSC3575_STATE_KEY_ME],
    [EventType.RoomMember, MSC3575_STATE_KEY_LAZY],
    // Additional state only needed when viewing the room
    [EventType.RoomHistoryVisibility, ''],
    [EventType.RoomPowerLevels, ''],
    // Room topic — displayed in room header, lobby hero, and room intro
    [StateEvent.RoomTopic, ''],
    // Pinned events — used by pin indicator, pin menu, and message highlight
    [StateEvent.RoomPinnedEvents, ''],
    [StateEvent.PoniesRoomEmotes, '*'],
    [StateEvent.RoomWidget, '*'],
    [StateEvent.GroupCallPrefix, '*'],
  ],
});

// Build the five priority lists that mirror Element Web's sssLists exactly.
// Each list starts at a small initial range and is expanded by the spidering
// loop in expandListsToKnownCount() on every successful lifecycle response.
// Multiple priority lists ensure invites/favourites/DMs appear immediately
// rather than waiting for the untagged spider to reach them.
const buildLists = (): Map<string, MSC3575List> => {
  const lists = new Map<string, MSC3575List>();

  // Spaces — needed to build the space tree immediately; no message preview needed
  lists.set(LIST_SPACES, {
    ranges: [[0, INITIAL_RANGE_SIZE - 1]],
    timeline_limit: 0,
    required_state: LIST_REQUIRED_STATE,
    include_old_rooms: LIST_INCLUDE_OLD_ROOMS,
    filters: {
      room_types: ['m.space'],
    },
  });

  // Invites — high priority so they appear before spidering finishes
  lists.set(LIST_INVITES, {
    ranges: [[0, INITIAL_RANGE_SIZE - 1]],
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: LIST_REQUIRED_STATE,
    include_old_rooms: LIST_INCLUDE_OLD_ROOMS,
    filters: {
      is_invite: true,
    },
  });

  // Favourites — separate list so starred rooms load with priority
  lists.set(LIST_FAVOURITES, {
    ranges: [[0, INITIAL_RANGE_SIZE - 1]],
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: LIST_REQUIRED_STATE,
    include_old_rooms: LIST_INCLUDE_OLD_ROOMS,
    filters: {
      tags: ['m.favourite'],
    },
  });

  // Direct messages — separate list so DMs load with priority
  // Excludes favourites and low-priority DMs (they appear in those lists instead)
  lists.set(LIST_DIRECTS, {
    ranges: [[0, INITIAL_RANGE_SIZE - 1]],
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: LIST_REQUIRED_STATE,
    include_old_rooms: LIST_INCLUDE_OLD_ROOMS,
    filters: {
      is_dm: true,
      is_invite: false,
      not_tags: ['m.favourite', 'm.lowpriority'],
    },
  });

  // Everything else — SSS de-dupes invites/DMs/favourites from here automatically
  lists.set(LIST_UNTAGGED, {
    ranges: [[0, INITIAL_RANGE_SIZE - 1]],
    timeline_limit: LIST_TIMELINE_LIMIT,
    required_state: LIST_REQUIRED_STATE,
    include_old_rooms: LIST_INCLUDE_OLD_ROOMS,
    filters: {
      is_invite: false,
    },
  });

  return lists;
};

const getListEndIndex = (list: MSC3575List | null): number => {
  if (!list?.ranges?.length) return -1;
  return list.ranges.reduce((max, range) => Math.max(max, range[1] ?? -1), -1);
};

export class SlidingSyncManager {
  private disposed = false;

  private readonly maxRooms: number;

  private readonly listKeys: string[];

  private timelineLimit: number;

  private readonly listPageSize: number;

  private readonly adaptiveTimeline: boolean;

  private deviceDiagnostics: SlidingSyncDeviceDiagnostics;

  private readonly configuredTimelineLimit?: number;

  private readonly onConnectionChange: () => void;

  private readonly onLifecycle: (state: SlidingSyncState, resp: unknown, err?: Error) => void;

  /** Room ID of the currently-open room, used to pick encryption-aware subscriptions. */
  private activeRoomId?: string;

  public readonly slidingSync: SlidingSync;

  public readonly probeTimeoutMs: number;

  public constructor(
    private readonly mx: MatrixClient,
    private readonly proxyBaseUrl: string,
    config: SlidingSyncConfig
  ) {
    const listPageSize = clampPositive(config.listPageSize, DEFAULT_LIST_PAGE_SIZE);
    const adaptiveTimeline = !(
      typeof config.timelineLimit === 'number' && config.timelineLimit > 0
    );
    const signals = readAdaptiveSignals();
    const timelineLimit = resolveAdaptiveTimelineLimit(config.timelineLimit, listPageSize, signals);
    const pollTimeoutMs = clampPositive(config.pollTimeoutMs, DEFAULT_POLL_TIMEOUT_MS);
    this.probeTimeoutMs = clampPositive(config.probeTimeoutMs, 5000);
    this.maxRooms = clampPositive(config.maxRooms, DEFAULT_MAX_ROOMS);
    this.timelineLimit = timelineLimit;
    this.listPageSize = listPageSize;
    this.adaptiveTimeline = adaptiveTimeline;
    this.deviceDiagnostics = signals;
    this.configuredTimelineLimit = config.timelineLimit;

    // Encrypted subscription is the constructor default — it requests all state
    // events ([*,*]) which is the safest choice when room encryption status is
    // not yet known (e.g. first load, hard refresh). Unencrypted rooms get a
    // leaner named custom subscription applied per-room via setActiveRoom().
    // Matches Element Web's ENCRYPTED_SUBSCRIPTION default + addCustomSubscription strategy.
    const lists = buildLists();
    this.listKeys = Array.from(lists.keys());
    this.slidingSync = new SlidingSync(
      proxyBaseUrl,
      lists,
      buildEncryptedSubscription(timelineLimit),
      mx,
      pollTimeoutMs
    );
    this.slidingSync.addCustomSubscription(
      UNENCRYPTED_SUBSCRIPTION_NAME,
      buildUnencryptedSubscription(timelineLimit)
    );

    this.onLifecycle = (state, resp, err) => {
      if (this.disposed || err || !resp || state !== SlidingSyncState.Complete) return;
      this.expandListsToKnownCount();
    };

    this.onConnectionChange = () => {
      if (this.disposed || !this.adaptiveTimeline) return;
      const currentSignals = readAdaptiveSignals();
      this.deviceDiagnostics = currentSignals;
      const nextTimelineLimit = resolveAdaptiveTimelineLimit(
        this.configuredTimelineLimit,
        this.listPageSize,
        currentSignals
      );
      if (nextTimelineLimit === this.timelineLimit) return;
      this.timelineLimit = nextTimelineLimit;
      this.applyTimelineLimit(nextTimelineLimit);
      log.log(
        `Sliding Sync adaptive timeline updated to ${nextTimelineLimit} for ${this.mx.getUserId()}`
      );
    };
  }

  public attach(): void {
    this.slidingSync.on(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    const connection = (
      typeof navigator !== 'undefined' ? (navigator as any).connection : undefined
    ) as
      | {
          addEventListener?: (event: string, cb: () => void) => void;
          removeEventListener?: (event: string, cb: () => void) => void;
          onchange?: (() => void) | null;
        }
      | undefined;
    connection?.addEventListener?.('change', this.onConnectionChange);
    if (connection && connection.onchange === null) {
      connection.onchange = this.onConnectionChange;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onConnectionChange);
      window.addEventListener('offline', this.onConnectionChange);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.slidingSync.removeListener(SlidingSyncEvent.Lifecycle, this.onLifecycle);
    const connection = (
      typeof navigator !== 'undefined' ? (navigator as any).connection : undefined
    ) as
      | {
          addEventListener?: (event: string, cb: () => void) => void;
          removeEventListener?: (event: string, cb: () => void) => void;
          onchange?: (() => void) | null;
        }
      | undefined;
    connection?.removeEventListener?.('change', this.onConnectionChange);
    if (connection?.onchange === this.onConnectionChange) {
      connection.onchange = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onConnectionChange);
      window.removeEventListener('offline', this.onConnectionChange);
    }
  }

  public getDiagnostics(): SlidingSyncDiagnostics {
    return {
      proxyBaseUrl: this.proxyBaseUrl,
      timelineLimit: this.timelineLimit,
      listPageSize: this.listPageSize,
      adaptiveTimeline: this.adaptiveTimeline,
      device: this.deviceDiagnostics,
      lists: this.listKeys.map((key) => {
        const listData = this.slidingSync.getListData(key);
        const params = this.slidingSync.getListParams(key);
        return {
          key,
          knownCount: listData?.joinedCount ?? 0,
          rangeEnd: getListEndIndex(params),
        };
      }),
    };
  }

  private expandListsToKnownCount(): void {
    this.listKeys.forEach((key) => {
      const listData = this.slidingSync.getListData(key);
      const knownCount = listData?.joinedCount ?? 0;
      if (knownCount <= 0) return;

      const desiredEnd = Math.min(knownCount, this.maxRooms) - 1;
      const existing = this.slidingSync.getListParams(key);
      const currentEnd = getListEndIndex(existing);
      if (desiredEnd === currentEnd) return;

      this.slidingSync.setListRanges(key, [[0, desiredEnd]]);
      if (knownCount > this.maxRooms) {
        log.warn(
          `Sliding Sync list "${key}" capped at ${this.maxRooms}/${knownCount} rooms for ${this.mx.getUserId()}`
        );
      }
    });
  }

  /**
   * Returns true if the room is known to be encrypted, false if known to be
   * unencrypted, or null if the room is not yet in the client's room store.
   * Callers should default to the safe (encrypted) subscription when null.
   */
  private isRoomEncrypted(roomId: string): boolean | null {
    const room = this.mx.getRoom(roomId);
    if (!room) return null; // unknown room — default to safe encrypted subscription
    return !!room.currentState.getStateEvents(EventType.RoomEncryption, '');
  }

  /**
   * Notify the manager that the user has navigated to a room.
   *
   * Matches Element Web's setRoomVisible strategy:
   * - Encrypted rooms (or rooms where encryption status is unknown) get the default
   *   encrypted subscription: required_state [['*','*']] for full member state.
   * - Unencrypted rooms get the lean UNENCRYPTED_SUBSCRIPTION (lazy-loaded members)
   *   registered as a per-room custom subscription.
   *
   * The subscription set grows as rooms are visited (EW does the same) — previously
   * visited rooms remain subscribed so their state stays fresh.
   */
  public setActiveRoom(roomId: string): void {
    if (this.disposed) return;
    this.activeRoomId = roomId;

    const subs = this.slidingSync.getRoomSubscriptions();
    subs.add(roomId);

    // Encrypted rooms fall through to the default (encrypted) subscription.
    // Default to safety for unknown rooms (e.g. hard refresh before room data arrives).
    if (this.isRoomEncrypted(roomId) === false) {
      this.slidingSync.useCustomSubscription(roomId, UNENCRYPTED_SUBSCRIPTION_NAME);
    }

    this.slidingSync.modifyRoomSubscriptions(subs);
  }

  private applyTimelineLimit(timelineLimit: number): void {
    // Update both the default (encrypted) subscription and the named unencrypted custom
    // subscription so that the adaptive limit takes effect on the next resend.
    // List entries intentionally stay at LIST_TIMELINE_LIMIT (1).
    this.slidingSync.modifyRoomSubscriptionInfo(buildEncryptedSubscription(timelineLimit));
    this.slidingSync.addCustomSubscription(
      UNENCRYPTED_SUBSCRIPTION_NAME,
      buildUnencryptedSubscription(timelineLimit)
    );
    // Resend updated subscriptions to all currently-subscribed rooms
    const subs = this.slidingSync.getRoomSubscriptions();
    if (subs.size > 0) {
      this.slidingSync.modifyRoomSubscriptions(subs);
    }
  }

  public static async probe(
    mx: MatrixClient,
    proxyBaseUrl: string,
    probeTimeoutMs: number
  ): Promise<boolean> {
    try {
      const response = await mx.slidingSync(
        {
          lists: {
            probe: {
              ranges: [[0, 0]],
              timeline_limit: 1,
              required_state: [],
            },
          },
          timeout: 0,
          clientTimeout: probeTimeoutMs,
        },
        proxyBaseUrl
      );

      return typeof response.pos === 'string' && response.pos.length > 0;
    } catch {
      return false;
    }
  }
}
