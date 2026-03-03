import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { SyncState } from '$types/matrix-sdk';

import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSyncState } from '../../hooks/useSyncState';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { mDirectAtom } from '../../state/mDirectList';

export function ToRoomEvent() {
  const mx = useMatrixClient();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const mDirects = useAtomValue(mDirectAtom);
  const { room_id: roomId, event_id: eventId } = useParams();
  const { navigateRoom } = useRoomNavigate();
  const [syncState, setSyncState] = useState<SyncState | null>(mx?.getSyncState() ?? null);

  useSyncState(
    mx,
    useCallback((s) => setSyncState(s), [])
  );

  useEffect(() => {
    if (!roomId || !mx) {
      return;
    }
    if (syncState !== SyncState.Syncing) {
      return;
    }
    if (!roomToParents.size || !mDirects.size) {
      return;
    }

    if (window.history.length <= 2) {
      window.history.pushState({}, '', '/');
    }
    navigateRoom(roomId, eventId);
  }, [mx, syncState, roomToParents, mDirects, roomId, eventId, navigateRoom]);

  return null;
}
