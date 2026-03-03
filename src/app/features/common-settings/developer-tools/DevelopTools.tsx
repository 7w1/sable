import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  Box,
  Text,
  IconButton,
  Icon,
  Icons,
  Scroll,
  Switch,
  Button,
  MenuItem,
  config,
  color,
} from 'folds';
import { EventType, NotificationCountType } from '$types/matrix-sdk';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { copyToClipboard } from '$utils/dom';
import { useRoom } from '$hooks/useRoom';
import { useRoomState } from '$hooks/useRoomState';
import { useRoomAccountData } from '$hooks/useRoomAccountData';
import { roomToUnreadAtom } from '$state/room/roomToUnread';
import { isNotificationEvent } from '$utils/room';
import { CutoutCard } from '$components/cutout-card';
import { AccountDataEditor, AccountDataSubmitCallback } from '$components/AccountDataEditor';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { SequenceCardStyle } from '$features/common-settings/styles.css';
import { SendRoomEvent } from './SendRoomEvent';
import { StateEventEditor, StateEventInfo } from './StateEventEditor';

type DeveloperToolsProps = {
  requestClose: () => void;
};
export function DeveloperTools({ requestClose }: DeveloperToolsProps) {
  const [developerTools, setDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const mx = useMatrixClient();
  const room = useRoom();

  const roomState = useRoomState(room);
  const accountData = useRoomAccountData(room);

  const [expandState, setExpandState] = useState(false);
  const [expandStateType, setExpandStateType] = useState<string>();
  const [openStateEvent, setOpenStateEvent] = useState<StateEventInfo>();
  const [composeEvent, setComposeEvent] = useState<{ type?: string; stateKey?: string }>();

  const [expandAccountData, setExpandAccountData] = useState(false);
  const [accountDataType, setAccountDataType] = useState<string | null>();
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [, setTick] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const unreadDiagnostics = useMemo(() => {
    const userId = mx.getUserId();
    const liveEvents = room.getLiveTimeline().getEvents();
    const latestLiveEvent = liveEvents[liveEvents.length - 1];
    const latestLiveEventId = latestLiveEvent?.getId() ?? null;
    const latestNotificationEvent = [...liveEvents]
      .reverse()
      .find((event) => isNotificationEvent(event));
    const latestNotificationEventId = latestNotificationEvent?.getId() ?? null;
    const fullyReadEventId =
      room.getAccountData(EventType.FullyRead)?.getContent<{ event_id?: string }>()?.event_id ??
      null;
    const readUpToEventId = userId ? (room.getEventReadUpTo(userId) ?? null) : null;
    const sdkUnreadTotal = room.getUnreadNotificationCount(NotificationCountType.Total);
    const sdkUnreadHighlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);
    const atomUnread = roomToUnread.get(room.roomId);

    return {
      roomId: room.roomId,
      userId: userId ?? null,
      timelineSize: liveEvents.length,
      latestLiveEventId,
      latestNotificationEventId,
      fullyReadEventId,
      readUpToEventId,
      hasReadLatestLive: !!(
        userId &&
        latestLiveEventId &&
        room.hasUserReadEvent(userId, latestLiveEventId)
      ),
      hasReadLatestNotification: !!(
        userId &&
        latestNotificationEventId &&
        room.hasUserReadEvent(userId, latestNotificationEventId)
      ),
      sdkUnread: {
        total: sdkUnreadTotal,
        highlight: sdkUnreadHighlight,
      },
      atomUnread: atomUnread
        ? {
            total: atomUnread.total,
            highlight: atomUnread.highlight,
          }
        : null,
    };
  }, [mx, room, roomToUnread]);

  const handleClose = useCallback(() => {
    setOpenStateEvent(undefined);
    setComposeEvent(undefined);
    setAccountDataType(undefined);
  }, []);

  const submitAccountData: AccountDataSubmitCallback = useCallback(
    async (type, content) => {
      await mx.setRoomAccountData(room.roomId, type, content);
    },
    [mx, room.roomId]
  );

  if (accountDataType !== undefined) {
    return (
      <AccountDataEditor
        type={accountDataType ?? undefined}
        content={accountDataType ? accountData.get(accountDataType) : undefined}
        submitChange={submitAccountData}
        requestClose={handleClose}
      />
    );
  }

  if (composeEvent) {
    return <SendRoomEvent {...composeEvent} requestClose={handleClose} />;
  }

  if (openStateEvent) {
    return <StateEventEditor {...openStateEvent} requestClose={handleClose} />;
  }

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Developer Tools
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Options</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Enable Developer Tools"
                    after={
                      <Switch
                        variant="Primary"
                        value={developerTools}
                        onChange={setDeveloperTools}
                      />
                    }
                  />
                </SequenceCard>
                {developerTools && (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title="Room ID"
                      description={`Copy room ID to clipboard. ("${room.roomId}")`}
                      after={
                        <Button
                          onClick={() => copyToClipboard(room.roomId ?? '<NO_ROOM_ID_FOUND>')}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                        >
                          <Text size="B300">Copy</Text>
                        </Button>
                      }
                    />
                  </SequenceCard>
                )}
              </Box>

              {developerTools && (
                <Box direction="Column" gap="100">
                  <Text size="L400">Data</Text>

                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title="New Message Event"
                      description="Create and send a new message event within the room."
                      after={
                        <Button
                          onClick={() => setComposeEvent({})}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                        >
                          <Text size="B300">Compose</Text>
                        </Button>
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
                      title="Room State"
                      description="State events of the room."
                      after={
                        <Button
                          onClick={() => setExpandState(!expandState)}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                          before={
                            <Icon
                              src={expandState ? Icons.ChevronTop : Icons.ChevronBottom}
                              size="100"
                              filled
                            />
                          }
                        >
                          <Text size="B300">{expandState ? 'Collapse' : 'Expand'}</Text>
                        </Button>
                      }
                    />
                    {expandState && (
                      <Box direction="Column" gap="100">
                        <Box
                          direction="Column"
                          gap="100"
                          style={{
                            paddingInline: config.space.S400,
                            paddingBottom: config.space.S300,
                          }}
                        >
                          <Box justifyContent="SpaceBetween" alignItems="Center">
                            <Text size="L400">Unread Diagnostics</Text>
                            <Button
                              onClick={() =>
                                copyToClipboard(JSON.stringify(unreadDiagnostics, null, 2))
                              }
                              variant="Secondary"
                              fill="Soft"
                              size="300"
                              radii="300"
                              outlined
                            >
                              <Text size="B300">Copy JSON</Text>
                            </Button>
                          </Box>
                          <Text size="T200">
                            `readUpTo`: {unreadDiagnostics.readUpToEventId ?? 'null'}
                          </Text>
                          <Text size="T200">
                            `m.fully_read`: {unreadDiagnostics.fullyReadEventId ?? 'null'}
                          </Text>
                          <Text size="T200">
                            Latest live: {unreadDiagnostics.latestLiveEventId ?? 'null'} | read?{' '}
                            {unreadDiagnostics.hasReadLatestLive ? 'yes' : 'no'}
                          </Text>
                          <Text size="T200">
                            Latest notification:{' '}
                            {unreadDiagnostics.latestNotificationEventId ?? 'null'} | read?{' '}
                            {unreadDiagnostics.hasReadLatestNotification ? 'yes' : 'no'}
                          </Text>
                          <Text size="T200">
                            SDK unread: {unreadDiagnostics.sdkUnread.total} total /{' '}
                            {unreadDiagnostics.sdkUnread.highlight} highlight
                          </Text>
                          <Text size="T200">
                            Atom unread:{' '}
                            {unreadDiagnostics.atomUnread
                              ? `${unreadDiagnostics.atomUnread.total} total / ${unreadDiagnostics.atomUnread.highlight} highlight`
                              : 'none'}
                          </Text>
                        </Box>
                        <Box justifyContent="SpaceBetween">
                          <Text size="L400">Events</Text>
                          <Text size="L400">Total: {roomState.size}</Text>
                        </Box>
                        <CutoutCard>
                          <MenuItem
                            onClick={() => setComposeEvent({ stateKey: '' })}
                            variant="Surface"
                            fill="None"
                            size="300"
                            radii="0"
                            before={<Icon size="50" src={Icons.Plus} />}
                          >
                            <Box grow="Yes">
                              <Text size="T200" truncate>
                                Add New
                              </Text>
                            </Box>
                          </MenuItem>
                          {Array.from(roomState.keys())
                            .sort()
                            .map((eventType) => {
                              const expanded = eventType === expandStateType;
                              const stateKeyToEvents = roomState.get(eventType);
                              if (!stateKeyToEvents) return null;

                              return (
                                <Box id={eventType} key={eventType} direction="Column" gap="100">
                                  <MenuItem
                                    onClick={() =>
                                      setExpandStateType(expanded ? undefined : eventType)
                                    }
                                    variant="Surface"
                                    fill="None"
                                    size="300"
                                    radii="0"
                                    before={
                                      <Icon
                                        size="50"
                                        src={expanded ? Icons.ChevronBottom : Icons.ChevronRight}
                                      />
                                    }
                                    after={<Text size="L400">{stateKeyToEvents.size}</Text>}
                                  >
                                    <Box grow="Yes">
                                      <Text size="T200" truncate>
                                        {eventType}
                                      </Text>
                                    </Box>
                                  </MenuItem>
                                  {expanded && (
                                    <div
                                      style={{
                                        marginLeft: config.space.S400,
                                        borderLeft: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
                                      }}
                                    >
                                      <MenuItem
                                        onClick={() =>
                                          setComposeEvent({ type: eventType, stateKey: '' })
                                        }
                                        variant="Surface"
                                        fill="None"
                                        size="300"
                                        radii="0"
                                        before={<Icon size="50" src={Icons.Plus} />}
                                      >
                                        <Box grow="Yes">
                                          <Text size="T200" truncate>
                                            Add New
                                          </Text>
                                        </Box>
                                      </MenuItem>
                                      {Array.from(stateKeyToEvents.keys())
                                        .sort()
                                        .map((stateKey) => (
                                          <MenuItem
                                            onClick={() => {
                                              setOpenStateEvent({
                                                type: eventType,
                                                stateKey,
                                              });
                                            }}
                                            key={stateKey}
                                            variant="Surface"
                                            fill="None"
                                            size="300"
                                            radii="0"
                                            after={<Icon size="50" src={Icons.ChevronRight} />}
                                          >
                                            <Box grow="Yes">
                                              <Text size="T200" truncate>
                                                {stateKey ? `"${stateKey}"` : 'Default'}
                                              </Text>
                                            </Box>
                                          </MenuItem>
                                        ))}
                                    </div>
                                  )}
                                </Box>
                              );
                            })}
                        </CutoutCard>
                      </Box>
                    )}
                  </SequenceCard>
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <SettingTile
                      title="Account Data"
                      description="Private personalization data stored within room."
                      after={
                        <Button
                          onClick={() => setExpandAccountData(!expandAccountData)}
                          variant="Secondary"
                          fill="Soft"
                          size="300"
                          radii="300"
                          outlined
                          before={
                            <Icon
                              src={expandAccountData ? Icons.ChevronTop : Icons.ChevronBottom}
                              size="100"
                              filled
                            />
                          }
                        >
                          <Text size="B300">{expandAccountData ? 'Collapse' : 'Expand'}</Text>
                        </Button>
                      }
                    />
                    {expandAccountData && (
                      <Box direction="Column" gap="100">
                        <Box justifyContent="SpaceBetween">
                          <Text size="L400">Events</Text>
                          <Text size="L400">Total: {accountData.size}</Text>
                        </Box>
                        <CutoutCard>
                          <MenuItem
                            variant="Surface"
                            fill="None"
                            size="300"
                            radii="0"
                            before={<Icon size="50" src={Icons.Plus} />}
                            onClick={() => setAccountDataType(null)}
                          >
                            <Box grow="Yes">
                              <Text size="T200" truncate>
                                Add New
                              </Text>
                            </Box>
                          </MenuItem>
                          {Array.from(accountData.keys())
                            .sort()
                            .map((type) => (
                              <MenuItem
                                key={type}
                                variant="Surface"
                                fill="None"
                                size="300"
                                radii="0"
                                after={<Icon size="50" src={Icons.ChevronRight} />}
                                onClick={() => setAccountDataType(type)}
                              >
                                <Box grow="Yes">
                                  <Text size="T200" truncate>
                                    {type}
                                  </Text>
                                </Box>
                              </MenuItem>
                            ))}
                        </CutoutCard>
                      </Box>
                    )}
                  </SequenceCard>
                </Box>
              )}
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
