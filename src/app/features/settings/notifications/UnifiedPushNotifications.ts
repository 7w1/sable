import { isTauri } from '@tauri-apps/api/core';
import type { PluginListener } from '@tauri-apps/api/core';
import {
  registerForUnifiedPush,
  unregisterFromUnifiedPush,
  getUnifiedPushDistributors,
  saveUnifiedPushDistributor,
  getUnifiedPushDistributor,
  onUnifiedPushEndpoint,
  requestPermission,
  registerForPushNotifications,
  unregisterForPushNotifications,
} from '@choochmeque/tauri-plugin-notifications-api';
import { MatrixClient } from '$types/matrix-sdk';

const UP_APP_ID = 'moe.sable.android.up';
const FCM_APP_ID = 'moe.sable.android.fcm';
const UP_GATEWAY_URL = 'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify';
const FCM_GATEWAY_URL = 'https://matrix.gateway.unifiedpush.org/_matrix/push/v1/notify';

export const isUnifiedPushAvailable = (): boolean => isTauri();

export async function listDistributors(): Promise<string[]> {
  const { distributors } = await getUnifiedPushDistributors();
  return distributors;
}

export async function getSelectedDistributor(): Promise<string | null> {
  const { distributor } = await getUnifiedPushDistributor();
  return distributor || null;
}

export async function selectDistributor(distributor: string): Promise<void> {
  await saveUnifiedPushDistributor(distributor);
}

async function getDeviceName(mx: MatrixClient): Promise<string> {
  try {
    const device = await mx.getDevice(mx.getDeviceId() ?? '');
    return device.display_name ?? 'Android';
  } catch {
    return 'Android';
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number, msg: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(msg)), ms);
    }),
  ]);

// ── UnifiedPush ──

export async function enableUnifiedPush(mx: MatrixClient): Promise<string> {
  await withTimeout(requestPermission(), 15_000, 'Permission request timed out');

  const { endpoint } = await withTimeout(
    registerForUnifiedPush(),
    15_000,
    'UnifiedPush registration timed out — is a distributor installed?'
  );
  const deviceName = await getDeviceName(mx);

  await mx.setPusher({
    kind: 'http',
    app_id: UP_APP_ID,
    pushkey: endpoint,
    app_display_name: 'Sable',
    device_display_name: deviceName,
    lang: navigator.language || 'en',
    data: {
      url: UP_GATEWAY_URL,
    },
  } as any);

  return endpoint;
}

export async function disableUnifiedPush(mx: MatrixClient): Promise<void> {
  const response = await mx.getPushers();
  const upPusher = response.pushers?.find((p) => p.app_id === UP_APP_ID);
  if (upPusher) {
    await mx.setPusher({
      kind: null,
      app_id: UP_APP_ID,
      pushkey: upPusher.pushkey,
    } as any);
  }

  await unregisterFromUnifiedPush();
}

export async function isUnifiedPushActive(mx: MatrixClient): Promise<boolean> {
  try {
    const response = await mx.getPushers();
    return response.pushers?.some((p) => p.app_id === UP_APP_ID) ?? false;
  } catch {
    return false;
  }
}

export async function watchEndpointChanges(mx: MatrixClient): Promise<PluginListener> {
  return onUnifiedPushEndpoint(async ({ endpoint }) => {
    try {
      const deviceName = await getDeviceName(mx);
      await mx.setPusher({
        kind: 'http',
        app_id: UP_APP_ID,
        pushkey: endpoint,
        app_display_name: 'Sable',
        device_display_name: deviceName,
        lang: navigator.language || 'en',
        data: {
          url: UP_GATEWAY_URL,
        },
      } as any);
    } catch {
      // Next endpoint event will retry
    }
  });
}

// ── FCM fallback ──

export async function enableFcmPush(mx: MatrixClient): Promise<string> {
  await withTimeout(requestPermission(), 15_000, 'Permission request timed out');

  const token = await withTimeout(
    registerForPushNotifications(),
    15_000,
    'FCM registration timed out'
  );
  const deviceName = await getDeviceName(mx);

  await mx.setPusher({
    kind: 'http',
    app_id: FCM_APP_ID,
    pushkey: token,
    app_display_name: 'Sable',
    device_display_name: deviceName,
    lang: navigator.language || 'en',
    data: {
      url: FCM_GATEWAY_URL,
    },
  } as any);

  return token;
}

export async function disableFcmPush(mx: MatrixClient): Promise<void> {
  const response = await mx.getPushers();
  const fcmPusher = response.pushers?.find((p) => p.app_id === FCM_APP_ID);
  if (fcmPusher) {
    await mx.setPusher({
      kind: null,
      app_id: FCM_APP_ID,
      pushkey: fcmPusher.pushkey,
    } as any);
  }

  try {
    await unregisterForPushNotifications();
  } catch {
    // ignore
  }
}

export async function isFcmPushActive(mx: MatrixClient): Promise<boolean> {
  try {
    const response = await mx.getPushers();
    return response.pushers?.some((p) => p.app_id === FCM_APP_ID) ?? false;
  } catch {
    return false;
  }
}
