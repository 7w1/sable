import { useCallback, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { SyncState, ClientEvent } from '$types/matrix-sdk';
import { activeSessionIdAtom, pendingNotificationAtom } from '../state/sessions';
import { useSyncState } from './useSyncState';
import { useMatrixClient } from './useMatrixClient';
import { useRoomNavigate } from './useRoomNavigate';
import { createLogger } from '../utils/debug';

export function NotificationJumper() {
  const [pending, setPending] = useAtom(pendingNotificationAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const mx = useMatrixClient();
  const { navigateRoom } = useRoomNavigate();
  const log = createLogger('NotificationJumper');

  const performJump = useCallback(() => {
    if (!pending) return;
    if (pending.targetSessionId && pending.targetSessionId !== activeSessionId) {
      log.log('waiting for target session atom...', {
        targetSessionId: pending.targetSessionId,
        activeSessionId,
      });
      return;
    }

    // Guard: the mx client context may lag one render behind the atom — wait until it catches up
    if (pending.targetSessionId && mx.getUserId() !== pending.targetSessionId) {
      log.log('waiting for mx client to switch to target session...', {
        targetSessionId: pending.targetSessionId,
        currentUserId: mx.getUserId(),
      });
      return;
    }

    const isSyncing = mx.getSyncState() === SyncState.Syncing;

    const room = mx.getRoom(pending.roomId);
    const isJoined = room?.getMyMembership() === 'join';

    if (isSyncing && isJoined) {
      log.log('jumping to:', pending.roomId);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          navigateRoom(pending.roomId, pending.eventId);
          setPending(null);
        });
      });
    } else {
      log.log('still waiting for room data...', {
        isSyncing,
        hasRoom: !!room,
        membership: room?.getMyMembership(),
      });
    }
  }, [pending, activeSessionId, mx, navigateRoom, setPending, log]);

  useSyncState(
    mx,
    useCallback(
      (current) => {
        if (current === SyncState.Syncing) performJump();
      },
      [performJump]
    )
  );

  useEffect(() => {
    if (!pending) return undefined;

    const onRoom = () => performJump();
    mx.on(ClientEvent.Room, onRoom);
    performJump();

    return () => {
      mx.removeListener(ClientEvent.Room, onRoom);
    };
  }, [pending, mx, performJump]);

  return null;
}
