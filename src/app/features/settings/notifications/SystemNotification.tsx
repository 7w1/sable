/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, Switch, Button, color, Spinner } from 'folds';
import { IPusherRequest } from '$types/matrix-sdk';
import { useAtom } from 'jotai';
import { isTauri } from '@tauri-apps/api/core';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { getNotificationState, usePermissionState } from '$hooks/usePermission';
import { useEmailNotifications } from '$hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useClientConfig } from '$hooks/useClientConfig';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { pushSubscriptionAtom } from '$state/pushSubscription';
import { mobileOrTablet } from '$utils/user-agent';
import {
  requestBrowserNotificationPermission,
  enablePushNotifications,
  disablePushNotifications,
} from './PushNotifications';
import { DeregisterAllPushersSetting } from './DeregisterPushNotifications';
import {
  isUnifiedPushAvailable,
  isUnifiedPushActive,
  enableUnifiedPush,
  disableUnifiedPush,
  listDistributors,
  selectDistributor,
  getSelectedDistributor,
  watchEndpointChanges,
  enableFcmPush,
  disableFcmPush,
  isFcmPushActive,
} from './UnifiedPushNotifications';

function EmailNotification() {
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  const [setState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: 'en',
            data: {
              brand: 'Sable',
            },
            append: true,
          });
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null,
        } as unknown as IPusherRequest);
      },
      [mx]
    )
  );

  const handleChange = (value: boolean) => {
    if (result && result.email) {
      setEnable(result.email, value).then(() => {
        refreshResult();
      });
    }
  };

  return (
    <SettingTile
      title="Email Notification"
      description={
        <>
          {result && !result.email && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Your account does not have any email attached.
            </Text>
          )}
          {result && result.email && <>Send notification to your email. {`("${result.email}")`}</>}
          {result === null && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Unexpected Error!
            </Text>
          )}
          {result === undefined && 'Send notification to your email.'}
        </>
      }
      after={
        <>
          {setState.status !== AsyncStatus.Loading &&
            typeof result === 'object' &&
            result?.email && <Switch value={result.enabled} onChange={handleChange} />}
          {(setState.status === AsyncStatus.Loading || result === undefined) && (
            <Spinner variant="Secondary" />
          )}
        </>
      }
    />
  );
}

function UnifiedPushSetting() {
  const mx = useMatrixClient();
  const [isLoading, setIsLoading] = useState(true);
  const [upActive, setUpActive] = useState(false);
  const [fcmActive, setFcmActive] = useState(false);
  const [distributors, setDistributors] = useState<string[]>([]);
  const [selectedDist, setSelectedDist] = useState<string | null>(null);

  const hasDistributors = distributors.length > 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [isUpActive, isFcmActive2, dists, sel] = await Promise.all([
          isUnifiedPushActive(mx),
          isFcmPushActive(mx),
          listDistributors(),
          getSelectedDistributor(),
        ]);
        if (cancelled) return;
        setUpActive(isUpActive);
        setFcmActive(isFcmActive2);
        setDistributors(dists);
        setSelectedDist(sel);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mx]);

  useEffect(() => {
    if (!upActive) return undefined;
    let unlisten: (() => void) | undefined;
    watchEndpointChanges(mx).then((l) => {
      unlisten = () => l.unregister();
    });
    return () => unlisten?.();
  }, [mx, upActive]);

  const handleUpToggle = async (wantsPush: boolean) => {
    setIsLoading(true);
    try {
      if (wantsPush) {
        if (hasDistributors && !selectedDist) {
          await selectDistributor(distributors[0]);
          setSelectedDist(distributors[0]);
        }
        await enableUnifiedPush(mx);
        setUpActive(true);
      } else {
        await disableUnifiedPush(mx);
        setUpActive(false);
      }
    } catch {
      // toggle failed
    } finally {
      setIsLoading(false);
    }
  };

  const handleFcmToggle = async (wantsPush: boolean) => {
    setIsLoading(true);
    try {
      if (wantsPush) {
        await enableFcmPush(mx);
        setFcmActive(true);
      } else {
        await disableFcmPush(mx);
        setFcmActive(false);
      }
    } catch {
      // toggle failed
    } finally {
      setIsLoading(false);
    }
  };

  const handleDistributorChange = async (dist: string) => {
    setIsLoading(true);
    try {
      if (upActive) await disableUnifiedPush(mx);
      await selectDistributor(dist);
      setSelectedDist(dist);
      await enableUnifiedPush(mx);
      setUpActive(true);
    } catch {
      // distributor change failed
    } finally {
      setIsLoading(false);
    }
  };

  if (hasDistributors) {
    return (
      <>
        <SettingTile
          title="Background Push Notifications"
          description="Receive notifications via UnifiedPush when the app is closed."
          after={
            isLoading ? (
              <Spinner variant="Secondary" />
            ) : (
              <Switch value={upActive} onChange={handleUpToggle} />
            )
          }
        />
        {distributors.length > 1 && (
          <SettingTile
            title="Push Distributor"
            description={selectedDist ?? 'None selected'}
            after={
              isLoading ? (
                <Spinner variant="Secondary" />
              ) : (
                <select
                  value={selectedDist ?? ''}
                  onChange={(e) => handleDistributorChange(e.target.value)}
                  style={{
                    background: 'var(--mx-c-surface)',
                    color: 'var(--mx-c-on-surface)',
                    border: '1px solid var(--mx-c-outline)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '14px',
                  }}
                >
                  {distributors.map((d) => (
                    <option key={d} value={d}>
                      {d.split('.').pop() ?? d}
                    </option>
                  ))}
                </select>
              )
            }
          />
        )}
      </>
    );
  }

  // No UP distributor — fall back to FCM
  return (
    <SettingTile
      title="Background Push Notifications"
      description="Receive notifications via Google Cloud Messaging when the app is closed."
      after={
        isLoading ? (
          <Spinner variant="Secondary" />
        ) : (
          <Switch value={fcmActive} onChange={handleFcmToggle} />
        )
      }
    />
  );
}

function WebPushNotificationSetting() {
  const mx = useMatrixClient();
  const clientConfig = useClientConfig();
  const isTauriApp = isTauri();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [usePushNotifications, setPushNotifications] = useSetting(
    settingsAtom,
    'usePushNotifications'
  );
  const pushSubAtom = useAtom(pushSubscriptionAtom);

  const browserPermission = usePermissionState('notifications', getNotificationState());
  useEffect(() => {
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isTauriApp && usePushNotifications) {
      setPushNotifications(false);
    }
  }, [isTauriApp, usePushNotifications, setPushNotifications]);

  const handleRequestPermissionAndEnable = async () => {
    if (isTauriApp) return;

    setIsLoading(true);
    try {
      const permissionResult = await requestBrowserNotificationPermission();
      if (permissionResult === 'granted') {
        await enablePushNotifications(mx, clientConfig, pushSubAtom);
        setPushNotifications(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePushSwitchChange = async (wantsPush: boolean) => {
    if (isTauriApp && wantsPush) return;

    setIsLoading(true);

    try {
      if (wantsPush) {
        await enablePushNotifications(mx, clientConfig, pushSubAtom);
      } else {
        await disablePushNotifications(mx, clientConfig, pushSubAtom);
      }
      setPushNotifications(wantsPush);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SettingTile
      title="Background Push Notifications"
      description={
        isTauriApp ? (
          <Text as="span" style={{ color: color.Warning.Main }} size="T200">
            Unavailable in Tauri runtime.
          </Text>
        ) : browserPermission === 'denied' ? (
          <Text as="span" style={{ color: color.Critical.Main }} size="T200">
            Permission blocked. Please allow notifications in your browser settings.
          </Text>
        ) : (
          'Receive notifications when the app is closed or in the background.'
        )
      }
      after={
        isLoading ? (
          <Spinner variant="Secondary" />
        ) : browserPermission === 'prompt' ? (
          <Button
            size="300"
            radii="300"
            onClick={handleRequestPermissionAndEnable}
            disabled={isTauriApp}
          >
            <Text size="B300">Enable</Text>
          </Button>
        ) : browserPermission === 'granted' ? (
          <Switch
            value={usePushNotifications}
            onChange={handlePushSwitchChange}
            disabled={isTauriApp && !usePushNotifications}
          />
        ) : null
      }
    />
  );
}

export function SystemNotification() {
  const [showInAppNotifs, setShowInAppNotifs] = useSetting(settingsAtom, 'useInAppNotifications');
  const [showSystemNotifs, setShowSystemNotifs] = useSetting(
    settingsAtom,
    'useSystemNotifications'
  );
  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );
  const [showMessageContent, setShowMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInNotifications'
  );
  const [showEncryptedMessageContent, setShowEncryptedMessageContent] = useSetting(
    settingsAtom,
    'showMessageContentInEncryptedNotifications'
  );
  const [clearNotificationsOnRead, setClearNotificationsOnRead] = useSetting(
    settingsAtom,
    'clearNotificationsOnRead'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">System & Notifications</Text>
      {mobileOrTablet() && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="Mobile In-App Notifications"
            description="Show a notification banner inside the app when a message arrives."
            after={<Switch value={showInAppNotifs} onChange={setShowInAppNotifs} />}
          />
        </SequenceCard>
      )}
      {mobileOrTablet() && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          {isUnifiedPushAvailable() ? <UnifiedPushSetting /> : <WebPushNotificationSetting />}
        </SequenceCard>
      )}
      {!mobileOrTablet() && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="System Notifications"
            description="Show an OS-level notification banner when a message arrives while the app is open. On mobile, the in-app banner is used instead."
            after={<Switch value={showSystemNotifs} onChange={setShowSystemNotifs} />}
          />
        </SequenceCard>
      )}
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Show Message Content"
          description="Include message text in notification bodies."
          after={<Switch value={showMessageContent} onChange={setShowMessageContent} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Show Encrypted Message Content"
          description="Allow message text from encrypted rooms in notification bodies. May not work on some platforms due to technical limitations."
          after={
            <Switch
              value={showEncryptedMessageContent}
              onChange={setShowEncryptedMessageContent}
              disabled={!showMessageContent}
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Clear Notifications When Read Elsewhere"
          description="Automatically dismiss notifications on this device when you read messages on another device."
          after={<Switch value={clearNotificationsOnRead} onChange={setClearNotificationsOnRead} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Notification Sound"
          description="Play sound when new message arrives and app is open."
          after={<Switch value={isNotificationSounds} onChange={setIsNotificationSounds} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <EmailNotification />
      </SequenceCard>

      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <DeregisterAllPushersSetting />
      </SequenceCard>
    </Box>
  );
}
