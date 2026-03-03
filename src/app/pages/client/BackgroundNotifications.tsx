import { useEffect, useRef } from 'react';
import {
  ClientEvent,
  createClient,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomEvent,
  SyncState,
  PushProcessor,
} from '$types/matrix-sdk';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  sessionsAtom,
  activeSessionIdAtom,
  Session,
  pendingNotificationAtom,
} from '$state/sessions';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { getMemberDisplayName, getNotificationType, isNotificationEvent } from '$utils/room';
import { NotificationType } from '$types/matrix/room';
import { createLogger } from '$utils/debug';
import LogoSVG from '$public/res/svg/cinny.svg';
import { nicknamesAtom } from '$state/nicknames';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { buildRoomMessageNotification } from '$utils/notificationStyle';
import { mobileOrTablet } from '$utils/user-agent';
import { startClient, stopClient } from '$client/initMatrix';
import { useClientConfig } from '$hooks/useClientConfig';

const log = createLogger('BackgroundNotifications');

const startBackgroundClient = async (
  session: Session,
  slidingSyncConfig: ReturnType<typeof useClientConfig>['slidingSync']
): Promise<MatrixClient> => {
  const mx = createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    deviceId: session.deviceId,
    timelineSupport: false,
  });
  await startClient(mx, {
    baseUrl: session.baseUrl,
    slidingSync: slidingSyncConfig,
  });
  return mx;
};

/**
 * Wait for the background client to finish its initial sync so that
 * push rules and account data are available before processing events.
 */
const waitForSync = (mx: MatrixClient): Promise<void> =>
  new Promise((resolve) => {
    const state = mx.getSyncState();
    if (state === SyncState.Syncing) {
      resolve();
      return;
    }
    const onSync = (newState: SyncState) => {
      if (newState === SyncState.Syncing) {
        mx.removeListener(ClientEvent.Sync, onSync);
        resolve();
      }
    };
    mx.on(ClientEvent.Sync, onSync);
  });

export function BackgroundNotifications() {
  const clientConfig = useClientConfig();
  const sessions = useAtomValue(sessionsAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const [showNotifications] = useSetting(settingsAtom, 'useInAppNotifications');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const forcePushOnMobile = usePushNotifications && mobileOrTablet();
  const activeMx = useMatrixClient();
  const nicknames = useAtomValue(nicknamesAtom);
  const nicknamesRef = useRef(nicknames);
  nicknamesRef.current = nicknames;
  const clientsRef = useRef<Map<string, MatrixClient>>(new Map());
  const notifiedEventsRef = useRef<Set<string>>(new Set());
  const setPending = useSetAtom(pendingNotificationAtom);

  const inactiveSessions = sessions.filter(
    (s) => s.userId !== (activeSessionId ?? sessions[0]?.userId)
  );

  interface NotifyOptions {
    /** Title shown in the notification banner. */
    title: string;
    /** Body text. */
    body?: string;
    /** URL to an icon (browser) – ignored on native where the app icon is used. */
    icon?: string;
    /** Badge icon URL shown by supported platforms. */
    badge?: string;
    /** If `true` the notification plays no sound. */
    silent?: boolean;
    /** Callback when the user taps/clicks the notification. */
    onClick?: () => void;
  }

  useEffect(() => {
    if (forcePushOnMobile) return undefined;
    if (!showNotifications) return undefined;

    const { current } = clientsRef;
    const activeIds = new Set(inactiveSessions.map((s) => s.userId));

    async function sendNotification(opts: NotifyOptions): Promise<Notification | undefined> {
      if ('Notification' in window && window.Notification.permission === 'granted') {
        const noti = new window.Notification(opts.title, {
          icon: opts.icon,
          badge: opts.badge,
          body: opts.body,
          silent: opts.silent ?? false,
        });
        if (opts.onClick) {
          const cb = opts.onClick;
          noti.onclick = () => {
            cb();
            noti.close();
          };
        }
        return noti;
      }

      return undefined;
    }

    current.forEach((mx, userId) => {
      if (!activeIds.has(userId)) {
        log.log('stopping background client for', userId);
        stopClient(mx);
        current.delete(userId);
      }
    });

    inactiveSessions.forEach((session) => {
      if (current.has(session.userId)) return;

      log.log('starting background client for', session.userId);
      startBackgroundClient(session, clientConfig.slidingSync)
        .then(async (mx) => {
          current.set(session.userId, mx);

          await waitForSync(mx);
          log.log('background client synced for', session.userId);

          const pushProcessor = new PushProcessor(mx);

          const handleTimeline = (
            mEvent: MatrixEvent,
            room: Room | undefined,
            toStartOfTimeline: boolean | undefined,
            removed: boolean,
            data: { liveEvent: boolean }
          ) => {
            if (mx.getSyncState() !== 'SYNCING') return;
            if (!room || !data?.liveEvent || room.isSpaceRoom()) return;
            if (!isNotificationEvent(mEvent)) return;

            const notifType = getNotificationType(mx, room.roomId);
            if (notifType === NotificationType.Mute) return;

            const activeRoom = activeMx.getRoom(room.roomId);
            if (activeRoom?.getMyMembership() === 'join') return;

            const eventId = mEvent.getId();
            if (!eventId || notifiedEventsRef.current.has(eventId)) return;

            const sender = mEvent.getSender();
            if (!sender || sender === mx.getUserId()) return;

            const pushActions = pushProcessor.actionsForEvent(mEvent);
            if (!pushActions?.notify) return;

            const senderName =
              getMemberDisplayName(room, sender, nicknamesRef.current) ??
              getMxIdLocalPart(sender) ??
              sender;

            const avatarMxc =
              room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
            const roomAvatar = avatarMxc
              ? (mxcUrlToHttp(mx, avatarMxc, false, 96, 96, 'crop') ?? undefined)
              : LogoSVG;

            const isHighlight = pushActions.tweaks?.highlight === true;

            notifiedEventsRef.current.add(eventId);
            // Cap the set so it doesn't grow unbounded
            if (notifiedEventsRef.current.size > 200) {
              const first = notifiedEventsRef.current.values().next().value;
              if (first) notifiedEventsRef.current.delete(first);
            }

            const notificationPayload = buildRoomMessageNotification({
              roomName: room.name ?? 'Unknown',
              roomAvatar,
              username: senderName,
              previewText: 'new message',
              silent: !notificationSound || !isHighlight,
              eventId,
              data: {
                type: mEvent.getType(),
                room_id: room.roomId,
                event_id: eventId,
                user_id: session.userId,
              },
            });

            sendNotification({
              title: notificationPayload.title,
              icon: notificationPayload.options.icon,
              badge: notificationPayload.options.badge,
              body: notificationPayload.options.body,
              silent: notificationPayload.options.silent ?? undefined,
              onClick: () => {
                window.focus();
                setPending({ roomId: room.roomId, eventId, targetSessionId: session.userId });
                if (session.userId !== activeSessionId) setActiveSessionId(session.userId);
              },
            });
          };

          mx.on(RoomEvent.Timeline, handleTimeline as unknown as (...args: unknown[]) => void);
        })
        .catch((err) => {
          log.error('failed to start background client for', session.userId, err);
        });
    });

    return () => {
      current.forEach((mx) => stopClient(mx));
      current.clear();
    };
  }, [
    clientConfig.slidingSync,
    inactiveSessions,
    forcePushOnMobile,
    showNotifications,
    notificationSound,
    activeMx,
    activeSessionId,
    setActiveSessionId,
    setPending,
  ]);

  return null;
}
