export const DEFAULT_NOTIFICATION_ICON = '/public/res/apple/apple-touch-icon-180x180.png';
export const DEFAULT_NOTIFICATION_BADGE = '/public/res/apple/apple-touch-icon-72x72.png';

type RoomMessageNotificationInput = {
  roomName?: string;
  username?: string;
  roomAvatar?: string;
  previewText?: string;
  silent?: boolean;
  eventId?: string;
  data?: unknown;
};

type NotificationPayload = {
  title: string;
  options: NotificationOptions;
};

const getString = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
};

export const buildRoomMessageNotification = ({
  roomName,
  username,
  roomAvatar,
  previewText,
  silent,
  eventId,
  data,
}: RoomMessageNotificationInput): NotificationPayload => {
  const sender = getString(username, 'Someone');
  const room = getString(roomName, 'Unknown');
  const message = getString(previewText, 'new message');
  const avatar = getString(roomAvatar, DEFAULT_NOTIFICATION_ICON);

  return {
    title: `${sender} in ${room}`,
    options: {
      icon: avatar,
      badge: avatar || DEFAULT_NOTIFICATION_BADGE,
      body: `${sender}: ${message}`,
      silent,
      tag: eventId ?? `${room}-${sender}`,
      data,
    },
  };
};
