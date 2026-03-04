import { EventType } from 'matrix-js-sdk/lib/@types/event';
import {
  buildRoomMessageNotification,
  DEFAULT_NOTIFICATION_ICON,
  DEFAULT_NOTIFICATION_BADGE,
  resolveNotificationPreviewText,
} from '../app/utils/notificationStyle';

type NotificationSettings = {
  notificationSoundEnabled: boolean;
  showMessageContent: boolean;
  showEncryptedMessageContent: boolean;
};

export const createPushNotifications = (
  self: ServiceWorkerGlobalScope,
  getNotificationSettings: () => NotificationSettings
) => {
  const resolveSilent = (silent: unknown): boolean => {
    if (typeof silent === 'boolean') return silent;
    return !getNotificationSettings().notificationSoundEnabled;
  };

  const showNotificationWithData = async (
    title: string,
    body: string | undefined,
    data: any,
    silent?: boolean,
    icon?: string,
    badge?: string
  ) => {
    await self.registration.showNotification(title, {
      body,
      icon: icon ?? DEFAULT_NOTIFICATION_ICON,
      badge: badge ?? DEFAULT_NOTIFICATION_BADGE,
      tag: data?.event_id ?? 'Cinny',
      silent,
      data,
    });
  };

  const handleRoomMessageNotification = async (pushData: any) => {
    const data = {
      type: pushData?.type,
      room_id: pushData?.room_id,
      event_id: pushData?.event_id,
      user_id: pushData?.user_id,
      timestamp: Date.now(),
      ...pushData.data,
    };
    const notificationPayload = buildRoomMessageNotification({
      roomName: pushData?.room_name,
      username: pushData?.sender_display_name,
      roomAvatar: pushData?.room_avatar_url,
      previewText: resolveNotificationPreviewText({
        content: pushData?.content,
        eventType: pushData?.type,
        isEncryptedRoom: false,
        showMessageContent: getNotificationSettings().showMessageContent,
        showEncryptedMessageContent: getNotificationSettings().showEncryptedMessageContent,
      }),
      silent: resolveSilent(pushData?.silent),
      eventId: pushData?.event_id,
      data,
    });
    await showNotificationWithData(
      notificationPayload.title,
      notificationPayload.options.body,
      data,
      notificationPayload.options.silent ?? undefined,
      notificationPayload.options.icon,
      notificationPayload.options.badge
    );
  };

  const handleEncryptedMessageNotification = async (pushData: any) => {
    const data = {
      type: pushData?.type,
      room_id: pushData?.room_id,
      event_id: pushData?.event_id,
      user_id: pushData?.user_id,
      timestamp: Date.now(),
      ...pushData.data,
    };
    const notificationPayload = buildRoomMessageNotification({
      roomName: pushData?.room_name,
      username: pushData?.sender_display_name,
      roomAvatar: pushData?.room_avatar_url,
      previewText: resolveNotificationPreviewText({
        content: pushData?.content,
        eventType: pushData?.type,
        isEncryptedRoom: true,
        showMessageContent: getNotificationSettings().showMessageContent,
        showEncryptedMessageContent: getNotificationSettings().showEncryptedMessageContent,
      }),
      silent: resolveSilent(pushData?.silent),
      eventId: pushData?.event_id,
      data,
    });
    await showNotificationWithData(
      notificationPayload.title,
      notificationPayload.options.body,
      data,
      notificationPayload.options.silent ?? undefined,
      notificationPayload.options.icon,
      notificationPayload.options.badge
    );
  };

  const handleInvitationNotification = async (pushData: any) => {
    const senderDisplayName = pushData?.sender_display_name;
    const roomName = pushData?.room_name;

    let body = '';
    if (senderDisplayName && roomName) body = `${senderDisplayName} invites you to ${roomName}`;
    if (senderDisplayName && !roomName) body = `from ${senderDisplayName}`;
    if (!senderDisplayName && roomName) body = `to ${roomName}`;
    if (!senderDisplayName && !roomName) body = '';

    const data = {
      type: pushData?.type,
      content: pushData?.content,
      user_id: pushData?.user_id,
      timestamp: Date.now(),
      ...pushData.data,
    };

    await showNotificationWithData('New Invitation', body, data, resolveSilent(pushData?.silent));
  };

  const handlePushNotificationPushData = async (pushData: any) => {
    const eventType = pushData?.type as EventType | undefined;
    if (!eventType) return;

    switch (eventType) {
      case EventType.RoomMessage:
      case EventType.Sticker:
        await handleRoomMessageNotification(pushData);
        break;
      case EventType.RoomMessageEncrypted:
        await handleEncryptedMessageNotification(pushData);
        break;
      case EventType.RoomMember:
        if (pushData?.content?.membership === 'invite') {
          await handleInvitationNotification(pushData);
        }
        break;

      default:
        // Ignore non-message/non-invite notifications.
        break;
    }
  };

  return { handlePushNotificationPushData };
};
