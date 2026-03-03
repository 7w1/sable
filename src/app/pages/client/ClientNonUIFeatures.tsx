import { useAtomValue, useSetAtom } from 'jotai';
import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventType, RoomEvent, RoomEventHandlerMap } from '$types/matrix-sdk';
import { roomToUnreadAtom, unreadEqual, unreadInfoToUnread } from '$state/room/roomToUnread';
import LogoSVG from '$public/res/svg/cinny.svg';
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
  getUnreadInfo,
  isNotificationEvent,
} from '$utils/room';
import { NotificationType, UnreadInfo } from '$types/matrix/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useSelectedRoom } from '$hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '$hooks/router/useInbox';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { registrationAtom } from '$state/serviceWorkerRegistration';
import { activeSessionIdAtom, pendingNotificationAtom } from '$state/sessions';
import { buildRoomMessageNotification } from '$utils/notificationStyle';
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
      if (usePushNotifications && total === 0) {
        registration
          .getNotifications()
          .then((pushNotifications) =>
            pushNotifications.forEach((pushNotification) => pushNotification.close())
          );
        navigator.clearAppBadge();
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
  const forcePushOnMobile = usePushNotifications && mobileOrTablet();

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
    if (forcePushOnMobile) return;
    if (usePushNotifications && document.visibilityState !== 'visible') return;
    if (invites.length > perviousInviteLen && mx.getSyncState() === 'SYNCING') {
      if (showNotifications && notificationPermission('granted')) {
        notify(invites.length - perviousInviteLen);
      }

      if (notificationSound) {
        playSound();
      }
    }
  }, [
    mx,
    invites,
    perviousInviteLen,
    showNotifications,
    usePushNotifications,
    forcePushOnMobile,
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
  const notifRef = useRef<Notification>();
  const unreadCacheRef = useRef<Map<string, UnreadInfo>>(new Map());
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [showNotifications] = useSetting(settingsAtom, 'useInAppNotifications');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const forcePushOnMobile = usePushNotifications && mobileOrTablet();
  const nicknames = useAtomValue(nicknamesAtom);
  const nicknamesRef = useRef(nicknames);
  nicknamesRef.current = nicknames;

  const setPending = useSetAtom(pendingNotificationAtom);
  const selectedRoomId = useSelectedRoom();
  const notificationSelected = useInboxNotificationsSelected();

  const notify = useCallback(
    ({
      roomName,
      roomAvatar,
      username,
      roomId,
      eventId,
    }: {
      roomName: string;
      roomAvatar?: string;
      username: string;
      roomId: string;
      eventId: string;
    }) => {
      const payload = buildRoomMessageNotification({
        roomName,
        roomAvatar,
        username,
        previewText: 'new message',
        silent: true,
        eventId,
      });
      const noti = new window.Notification(payload.title, payload.options);

      noti.onclick = () => {
        window.focus();
        setPending({ roomId, eventId, targetSessionId: mx.getUserId() ?? undefined });

        noti.close();
        notifRef.current = undefined;
      };

      notifRef.current?.close();
      notifRef.current = noti;
    },
    [mx, setPending]
  );

  const playSound = useCallback(() => {
    const audioElement = audioRef.current;
    audioElement?.play();
  }, []);

  useEffect(() => {
    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (forcePushOnMobile) return;
      if (mx.getSyncState() !== 'SYNCING') return;
      if (usePushNotifications && document.visibilityState !== 'visible') return;
      if (document.hasFocus() && (selectedRoomId === room?.roomId || notificationSelected)) return;

      if (
        !room ||
        !data.liveEvent ||
        room.isSpaceRoom() ||
        !isNotificationEvent(mEvent) ||
        getNotificationType(mx, room.roomId) === NotificationType.Mute
      ) {
        return;
      }

      const sender = mEvent.getSender();
      const eventId = mEvent.getId();
      if (!sender || !eventId || mEvent.getSender() === mx.getUserId()) return;
      const unreadInfo = getUnreadInfo(room);
      const cachedUnreadInfo = unreadCacheRef.current.get(room.roomId);
      unreadCacheRef.current.set(room.roomId, unreadInfo);

      if (unreadInfo.total === 0) return;
      if (
        cachedUnreadInfo &&
        unreadEqual(unreadInfoToUnread(cachedUnreadInfo), unreadInfoToUnread(unreadInfo))
      ) {
        return;
      }

      if (showNotifications && notificationPermission('granted')) {
        const avatarMxc =
          room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
        notify({
          roomName: room.name ?? 'Unknown',
          roomAvatar: avatarMxc
            ? (mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined)
            : undefined,
          username:
            getMemberDisplayName(room, sender, nicknamesRef.current) ??
            getMxIdLocalPart(sender) ??
            sender,
          roomId: room.roomId,
          eventId,
        });
      }

      if (notificationSound) {
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
    usePushNotifications,
    forcePushOnMobile,
    playSound,
    notify,
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

function HandleNotificationClick() {
  const navigate = useNavigate();
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const setActiveSessionId = useSetAtom(activeSessionIdAtom);
  const setPending = useSetAtom(pendingNotificationAtom);

  useEffect(() => {
    const handleNotificationClickEvent = (event: any) => {
      if (!event.data || !event.source) return;
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
          if (targetSessionId && targetSessionId !== activeSessionId) {
            setActiveSessionId(targetSessionId);
          }
          setPending({
            roomId: messageData!.room_id,
            eventId: messageData!.event_id,
            targetSessionId,
          });
          return;
        case EventType.RoomMember:
          if (!(messageData?.content?.membership === 'invite')) return;
          if (targetSessionId && targetSessionId !== activeSessionId) {
            setActiveSessionId(targetSessionId);
          }
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
  }, [activeSessionId, navigate, setActiveSessionId, setPending]);

  return null;
}

function SyncNotificationSettingsWithServiceWorker() {
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [usePushNotifications] = useSetting(settingsAtom, 'usePushNotifications');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const preferPushOnMobile = usePushNotifications && mobileOrTablet();
    const payload = {
      type: 'setNotificationSettings' as const,
      notificationSoundEnabled: notificationSound,
      preferPushOnMobile,
    };

    navigator.serviceWorker.controller?.postMessage(payload);
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage(payload);
    });
  }, [notificationSound, usePushNotifications]);

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
      <HandleNotificationClick />
      <SyncNotificationSettingsWithServiceWorker />
      {children}
    </>
  );
}
