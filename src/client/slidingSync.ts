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

const LIST_JOINED = 'joined';
const LIST_INVITES = 'invites';
const DEFAULT_LIST_PAGE_SIZE = 250;
const DEFAULT_TIMELINE_LIMIT = 30;
const TIMELINE_LIMIT_LOW = 10;
const TIMELINE_LIMIT_MEDIUM = 15;
const TIMELINE_LIMIT_HIGH = 30;
const DEFAULT_POLL_TIMEOUT_MS = 10000;
const DEFAULT_MAX_ROOMS = 5000;

export type SlidingSyncConfig = {
  enabled?: boolean;
  proxyBaseUrl?: string;
  bootstrapClassicOnColdCache?: boolean;
  listPageSize?: number;
  timelineLimit?: number;
  pollTimeoutMs?: number;
  maxRooms?: number;
  includeInviteList?: boolean;
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

const buildDefaultSubscription = (timelineLimit: number): MSC3575RoomSubscription => ({
  timeline_limit: timelineLimit,
  required_state: [
    [EventType.RoomMember, MSC3575_STATE_KEY_ME],
    [EventType.RoomMember, MSC3575_STATE_KEY_LAZY],
    [EventType.RoomCreate, ''],
    [EventType.RoomName, ''],
    [EventType.RoomAvatar, ''],
    [EventType.RoomCanonicalAlias, ''],
    [EventType.RoomEncryption, ''],
    [EventType.RoomTombstone, ''],
    [EventType.RoomJoinRules, ''],
    [EventType.RoomHistoryVisibility, ''],
    [EventType.RoomPowerLevels, ''],
    [StateEvent.PoniesRoomEmotes, '*'],
    [StateEvent.RoomWidget, '*'],
    [StateEvent.GroupCallPrefix, '*'],
    [EventType.SpaceChild, '*'],
    [EventType.SpaceParent, '*'],
    [StateEvent.RoomCosmeticsColor, '*'],
    [StateEvent.RoomCosmeticsFont, '*'],
    [StateEvent.RoomCosmeticsPronouns, '*'],
  ],
});

const buildLists = (
  pageSize: number,
  timelineLimit: number,
  includeInviteList: boolean,
  requiredState: MSC3575RoomSubscription['required_state']
): Map<string, MSC3575List> => {
  const lists = new Map<string, MSC3575List>();
  lists.set(LIST_JOINED, {
    ranges: [[0, Math.max(0, pageSize - 1)]],
    timeline_limit: timelineLimit,
    required_state: requiredState,
    slow_get_all_rooms: true,
    filters: {
      is_invite: false,
    },
  });

  if (includeInviteList) {
    lists.set(LIST_INVITES, {
      ranges: [[0, Math.max(0, pageSize - 1)]],
      timeline_limit: timelineLimit,
      required_state: requiredState,
      slow_get_all_rooms: true,
      filters: {
        is_invite: true,
      },
    });
  }

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
    const includeInviteList = config.includeInviteList !== false;

    const subscription = buildDefaultSubscription(timelineLimit);
    const lists = buildLists(
      listPageSize,
      timelineLimit,
      includeInviteList,
      subscription.required_state
    );
    this.listKeys = Array.from(lists.keys());
    this.slidingSync = new SlidingSync(proxyBaseUrl, lists, subscription, mx, pollTimeoutMs);

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
   * The subscription set grows as rooms are visited — previously visited rooms
   * remain subscribed so their state stays fresh.
   */
  public setActiveRoom(roomId: string): void {
    if (this.disposed) return;

    const subs = this.slidingSync.getRoomSubscriptions();

    if (subs.has(roomId)) {
      // Room is already subscribed — no network round-trip needed.
      // Re-sending modifyRoomSubscriptions would cause the server to reply with
      // limited=true, which fires SDK TimelineRefresh and resets the virtual
      // paginator, making the room appear to jump to the top.
      return;
    }

    subs.add(roomId);
    this.slidingSync.modifyRoomSubscriptions(subs);
  }

  private applyTimelineLimit(timelineLimit: number): void {
    // Update the default subscription so the adaptive limit takes effect on resend.
    this.slidingSync.modifyRoomSubscriptionInfo(buildDefaultSubscription(timelineLimit));
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
