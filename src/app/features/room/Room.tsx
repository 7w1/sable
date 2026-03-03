import { useCallback } from 'react';
import { Box, Line } from 'folds';
import { useParams } from 'react-router-dom';
import { isKeyHotkey } from 'is-hotkey';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { PowerLevelsContextProvider, usePowerLevels } from '$hooks/usePowerLevels';
import { useRoom } from '$hooks/useRoom';
import { useKeyDown } from '$hooks/useKeyDown';
import { markAsRead } from '$utils/notifications';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useRoomMembers } from '$hooks/useRoomMembers';
import { CallView } from '$features/call/CallView';
import { useCallState } from '$pages/client/call/CallProvider';
import { WidgetsDrawer } from '$features/widgets/WidgetsDrawer';
import { RoomViewHeader } from './RoomViewHeader';
import { MembersDrawer } from './MembersDrawer';
import { RoomView } from './RoomView';

export function Room() {
  const { eventId } = useParams();
  const room = useRoom();
  const mx = useMatrixClient();

  const [isDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const [isWidgetDrawerOpen] = useSetting(settingsAtom, 'isWidgetDrawer');
  const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
  const screenSize = useScreenSizeContext();
  const powerLevels = usePowerLevels(room);
  const members = useRoomMembers(mx, room.roomId);
  const { isChatOpen } = useCallState();

  useKeyDown(
    window,
    useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          markAsRead(mx, room.roomId, hideActivity);
        }
      },
      [mx, room.roomId, hideActivity]
    )
  );

  return (
    <PowerLevelsContextProvider value={powerLevels}>
      <Box grow="Yes">
        <Box grow="Yes" direction="Column">
          <RoomViewHeader />
          <Box grow="Yes">
            <CallView room={room} />
            {room.isCallRoom() && screenSize === ScreenSize.Desktop && isChatOpen && (
              <Line variant="Background" direction="Vertical" size="300" />
            )}
            {(!room.isCallRoom() || isChatOpen) && <RoomView room={room} eventId={eventId} />}
          </Box>
        </Box>
        {screenSize === ScreenSize.Desktop && isDrawer && (
          <>
            <Line variant="Background" direction="Vertical" size="300" />
            <MembersDrawer key={room.roomId} room={room} members={members} />
          </>
        )}
        {screenSize === ScreenSize.Desktop && isWidgetDrawerOpen && (
          <>
            <Line variant="Background" direction="Vertical" size="300" />
            <WidgetsDrawer key={`widgets-${room.roomId}`} room={room} />
          </>
        )}
      </Box>
    </PowerLevelsContextProvider>
  );
}
