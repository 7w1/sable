import { useAtomValue, useSetAtom } from 'jotai';
import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventType, PushProcessor, RoomEvent, RoomEventHandlerMap } from '$types/matrix-sdk';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import LogoSVG from '$public/res/svg/cinny.svg';
import { NotificationBanner } from '$components/notification-banner';
import LogoUnreadSVG from '$public/res/svg/cinny-unread.svg';
import LogoHighlightSVG from '$public/res/svg/cinny-highlight.svg';
import NotificationSound from '$public/sound/notification.ogg';
import InviteSound from '$public/sound/invite.ogg';
import { notificationPermission, setFavicon } from '$utils/dom';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { nicknamesAtom } from '$state/nicknames';
import { allInvitesAtom } from '$state/room-list/inviteList';
import { usePreviousValue } from '$hooks/usePreviousValue';
import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  getMemberDisplayName,
  getNotificationType,
  getStateEvent,
  isNotificationEvent,
} from '$utils/room';
import { NotificationType, StateEvent } from '$types/matrix/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '$hooks/router/useInbox';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { registrationAtom } from '$state/serviceWorkerRegistration';
import { activeSessionIdAtom, pendingNotificationAtom, inAppBannerAtom } from '$state/sessions';
import {
  buildRoomMessageNotification,
  resolveNotificationPreviewText,
} from '$utils/notificationStyle';
import { mobileOrTablet } from '$utils/user-agent';
import { getInboxInvitesPath, getInboxNotificationsPath } from '../pathUtils';
import { BackgroundNotifications } from './BackgroundNotifications';

function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');

  if (twitterEmoji) {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji');
  } else {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji_DISABLED');
  }

  return null;
}

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }

  return null;
}

function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const registration = useAtomValue(registrationAtom);

  useEffect(() => {
    let notification = false;
    let highlight = false;
    let total = 0;
    roomToUnread.forEach((unread) => {
      if (unread.from === null) {
        total += unread.total;
      }
      if (unread.total > 0) {
        notification = true;
      }
      if (unread.highlight > 0) {
        highlight = true;
      }
    });

    if (notification) {
      setFavicon(highlight ? LogoHighlightSVG : LogoUnreadSVG);
    } else {
      setFavicon(LogoSVG);
    }
    try {
      navigator.setAppBadge(total);
      if (usePushNotifications) {
        if (total === 0) {
          // All rooms read — clear every notification and the badge.
          registration.getNotifications().then((notifs) => notifs.forEach((n) => n.close()));
          navigator.clearAppBadge();
        } else {
          // Dismiss notifications for individual rooms that are now fully read.
          registration.getNotifications().then((notifs) => {
            notifs.forEach((n) => {
              const notifRoomId = n.data?.room_id;
              if (!notifRoomId) return;
              const roomUnread = roomToUnread.get(notifRoomId);
              if (!roomUnread || (roomUnread.total === 0 && roomUnread.highlight === 0)) {
                n.close();
              }
            });
          });
        }
      }
    } catch {
      // Likely Firefox/Gecko-based and doesn't support badging API
    }
  }, [roomToUnread, usePushNotifications, registration]);

  return null;
}

function InviteNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const invites = useAtomValue(allInvitesAtom);
  const perviousInviteLen = usePreviousValue(invites.length, 0);
  const mx = useMatrixClient();

  const navigate = useNavigate();
  const [showNotifications] = useSetting(settingsAtom, 'useInAppNotifications');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');

  const notify = useCallback(
    (count: number) => {
      const noti = new window.Notification('Invitation', {
        icon: LogoSVG,
        badge: LogoSVG,
        body: `You have ${count} new invitation request.`,
        silent: true,
      });

      noti.onclick = () => {
        if (!window.closed) navigate(getInboxInvitesPath());
        noti.close();
      };
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play();
  }, []);

  useEffect(() => {
    if (invites.length <= perviousInviteLen || mx.getSyncState() !== 'SYNCING') return;

    // Page hidden: if push is enabled, SW handles the OS notification. If not, nothing to do.
    if (document.visibilityState !== 'visible') return;

    // Page is visible — show in-app experience.
    // On mobile with push: iOS-style — play sound only, no OS notification (SW is silent when
    // the app is visible on mobile, matching foreground behaviour of native chat apps).
    // On desktop with push: SW skipped (saw a visible client), so we show the OS notification.
    // Without push: always show OS notification when page is visible.
    const isVisibleMobileWithPush = usePushNotifications && mobileOrTablet();
    if (!isVisibleMobileWithPush && showNotifications && notificationPermission('granted')) {
      try {
        notify(invites.length - perviousInviteLen);
      } catch {
        // window.Notification may be unavailable in sandboxed environments (e.g. Flatpak).
      }
    }
    if (notificationSound) {
      playSound();
    }
  }, [
    mx,
    invites,
    perviousInviteLen,
    showNotifications,
    usePushNotifications,
    notificationSound,
    notify,
    playSound,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={InviteSound} type="audio/ogg" />
    </audio>
  );
}

function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifiedEventsRef = useRef<Set<string>>(new Set());
  // Record mount time so we can distinguish live events from historical backfill
  // on sliding sync proxies that don't set num_live (which causes liveEvent=false
  // for all events, including actually-new messages).
  const clientStartTimeRef = useRef(Date.now());
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [showNotifications] = useSetting(settingsAtom, 'useInAppNotifications');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const nicknames = useAtomValue(nicknamesAtom);
  const nicknamesRef = useRef(nicknames);
  nicknamesRef.current = nicknames;

  const setPending = useSetAtom(pendingNotificationAtom);
  const setInAppBanner = useSetAtom(inAppBannerAtom);
  const selectedRoomId = useSelectedRoom();
  const notificationSelected = useInboxNotificationsSelected();

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play();
  }, []);

  useEffect(() => {
    const pushProcessor = new PushProcessor(mx);
    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (mx.getSyncState() !== 'SYNCING') return;
      if (document.hasFocus() && (selectedRoomId === room?.roomId || notificationSelected)) return;

      // Older sliding sync proxies (e.g. matrix-sliding-sync used by Flatpak packages)
      // omit num_live, which causes every event to arrive with fromCache=true and
      // liveEvent=false — silently blocking all notifications. Fall back to an age
      // check: treat the event as potentially live when it was sent within 60 s of
      // this component mounting. Also skip if the user already has a read receipt
      // covering it (message was read on another device before this session).
      const isHistoricalEvent =
        !data.liveEvent &&
        (mEvent.getTs() < clientStartTimeRef.current - 60 * 1000 ||
          (!!room && room.hasUserReadEvent(mx.getSafeUserId(), mEvent.getId()!)));

      if (
        !room ||
        isHistoricalEvent ||
        room.isSpaceRoom() ||
        !isNotificationEvent(mEvent) ||
        getNotificationType(mx, room.roomId) === NotificationType.Mute
      ) {
        return;
      }

      const sender = mEvent.getSender();
      const eventId = mEvent.getId();
      if (!sender || !eventId || mEvent.getSender() === mx.getUserId()) return;

      // Deduplicate: don't show a second banner if this event fires twice
      // (e.g., decrypted events re-emitted by the SDK).
      if (notifiedEventsRef.current.has(eventId)) return;

      const pushActions = pushProcessor.actionsForEvent(mEvent);
      if (!pushActions?.notify) return;
      const loudByRule = Boolean(pushActions.tweaks?.sound);
      const isHighlightByRule = Boolean(pushActions.tweaks?.highlight);

      // If neither a loud nor a highlight rule matches, nothing to show.
      if (!isHighlightByRule && !loudByRule) return;

      // Page hidden: SW (push) handles the OS notification. Nothing to do in-app.
      if (document.visibilityState !== 'visible') return;

      // Record as notified to prevent duplicate banners (e.g. re-emitted decrypted events).
      notifiedEventsRef.current.add(eventId);
      if (notifiedEventsRef.current.size > 200) {
        const first = notifiedEventsRef.current.values().next().value;
        if (first) notifiedEventsRef.current.delete(first);
      }

      // Page is visible — show the themed in-app notification banner for any
      // highlighted message (mention / keyword) or loud push rule.
      if ((isHighlightByRule || loudByRule) && showNotifications) {
        const isEncryptedRoom = !!getStateEvent(room, StateEvent.RoomEncryption);
        const avatarMxc =
          room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
        const roomAvatar = avatarMxc
          ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
          : undefined;
        const resolvedSenderName =
          getMemberDisplayName(room, sender, nicknamesRef.current) ??
          getMxIdLocalPart(sender) ??
          sender;
        const previewText = resolveNotificationPreviewText({
          content: mEvent.getContent(),
          eventType: mEvent.getType(),
          isEncryptedRoom,
          showMessageContent,
          showEncryptedMessageContent,
        });
        const payload = buildRoomMessageNotification({
          roomName: room.name ?? 'Unknown',
          roomAvatar,
          username: resolvedSenderName,
          previewText,
          silent: !notificationSound,
          eventId,
        });
        const { roomId } = room;
        const capturedEventId = eventId;
        const capturedUserId = mx.getUserId() ?? undefined;
        const canonicalAlias = room.getCanonicalAlias();
        const serverName = canonicalAlias?.split(':')[1] ?? room.roomId.split(':')[1] ?? undefined;
        setInAppBanner({
          id: eventId,
          title: payload.title,
          roomName: room.name ?? undefined,
          serverName,
          senderName: resolvedSenderName,
          body: previewText,
          icon: roomAvatar,
          onClick: () => {
            window.focus();
            setPending({ roomId, eventId: capturedEventId, targetSessionId: capturedUserId });
          },
        });
      }

      // On desktop without push: also fire an OS notification as a secondary fallback
      // so the user is alerted even if the browser window is minimised.
      const isVisibleMobileWithPush = usePushNotifications && mobileOrTablet();
      if (!isVisibleMobileWithPush && showNotifications && notificationPermission('granted')) {
        const isEncryptedRoom = !!getStateEvent(room, StateEvent.RoomEncryption);
        const avatarMxc =
          room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
        const osPayload = buildRoomMessageNotification({
          roomName: room.name ?? 'Unknown',
          roomAvatar: avatarMxc
            ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
            : undefined,
          username:
            getMemberDisplayName(room, sender, nicknamesRef.current) ??
            getMxIdLocalPart(sender) ??
            sender,
          previewText: resolveNotificationPreviewText({
            content: mEvent.getContent(),
            eventType: mEvent.getType(),
            isEncryptedRoom,
            showMessageContent,
            showEncryptedMessageContent,
          }),
          // Play sound only if the push rule requests it and the user has sounds enabled.
          silent: !notificationSound || !loudByRule,
          eventId,
        });
        const noti = new window.Notification(osPayload.title, osPayload.options);
        const { roomId } = room;
        noti.onclick = () => {
          window.focus();
          setPending({ roomId, eventId, targetSessionId: mx.getUserId() ?? undefined });
          noti.close();
        };
      }

      if (notificationSound && loudByRule) {
        playSound();
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [
    mx,
    notificationSound,
    notificationSelected,
    showNotifications,
    showMessageContent,
    showEncryptedMessageContent,
    usePushNotifications,
    playSound,
    setInAppBanner,
    setPending,
    selectedRoomId,
    useAuthentication,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }}>
      <source src={NotificationSound} type="audio/ogg" />
    </audio>
  );
}

function PrivacyBlurFeature() {
  const [blurMedia] = useSetting(settingsAtom, 'privacyBlur');
  const [blurAvatars] = useSetting(settingsAtom, 'privacyBlurAvatars');
  const [blurEmotes] = useSetting(settingsAtom, 'privacyBlurEmotes');

  useEffect(() => {
    document.body.classList.toggle('sable-blur-media', blurMedia);
    document.body.classList.toggle('sable-blur-avatars', blurAvatars);
    document.body.classList.toggle('sable-blur-emotes', blurEmotes);
  }, [blurMedia, blurAvatars, blurEmotes]);

  return null;
}

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function HandleNotificationClick() {
  const navigate = useNavigate();
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const setPending = useSetAtom(pendingNotificationAtom);

  useEffect(() => {
    const handleNotificationClickEvent = (event: any) => {
      if (!event.data) return;
      // Note: do NOT guard on event.source — iOS Safari sets it to null for
      // SW-to-client postMessages (Webkit divergence from spec). The type check
      // below is the correct way to filter unrelated messages.
      const eventData = event.data;
      if (!(eventData?.type === 'notificationToRoomEvent')) return;
      const messageData = eventData?.message;
      if (!messageData) {
        navigate(getInboxNotificationsPath());
        return;
      }
      const targetSessionId =
        typeof messageData?.user_id === 'string' ? messageData.user_id : undefined;

      const eventType = messageData!.type as EventType;
      switch (eventType) {
        case EventType.RoomMessage:
        case EventType.RoomMessageEncrypted:
          // Always set the target session — jotai ignores no-ops if already active.
          // This ensures we never accidentally navigate under the wrong account.
          if (targetSessionId) setActiveSessionId(targetSessionId);
          setPending({
            roomId: messageData!.room_id,
            eventId: messageData!.event_id,
            targetSessionId,
          });
          return;
        case EventType.RoomMember:
          if (!(messageData?.content?.membership === 'invite')) return;
          if (targetSessionId) setActiveSessionId(targetSessionId);
          navigate(getInboxInvitesPath());
          break;
        default:
          break;
      }
    };

    navigator.serviceWorker.addEventListener('message', handleNotificationClickEvent);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleNotificationClickEvent);
    };
  }, [navigate, setActiveSessionId, setPending]);

  return null;
}

function SyncNotificationSettingsWithServiceWorker() {
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [showMessageContent] = useSetting(settingsAtom, 'showMessageContentInNotifications');
  const [showEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // preferPushOnMobile=false: SW skips push when page is visible on all devices.
    // The in-app path handles the visible case (sound on mobile, OS notification on desktop).
    const preferPushOnMobile = false;
    const payload = {
      type: 'setNotificationSettings' as const,
      notificationSoundEnabled: notificationSound,
      preferPushOnMobile,
      showMessageContent,
      showEncryptedMessageContent,
    };

    navigator.serviceWorker.controller?.postMessage(payload);
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage(payload);
    });
  }, [notificationSound, usePushNotifications, showMessageContent, showEncryptedMessageContent]);

  return null;
}

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  return (
    <>
      <SystemEmojiFeature />
      <PageZoomFeature />
      <PrivacyBlurFeature />
      <FaviconUpdater />
      <InviteNotifications />
      <MessageNotifications />
      <BackgroundNotifications />
      <SyncNotificationSettingsWithServiceWorker />
      <NotificationBanner />
      {children}
    </>
  );
}
