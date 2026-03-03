import {
  MatrixClient,
  MatrixRTCSession,
  MatrixRTCSessionEvent,
  CallMembership,
} from '$types/matrix-sdk';
import { useEffect, useState } from 'react';

export const useCallMembers = (mx: MatrixClient, roomId: string): CallMembership[] => {
  const [memberships, setMemberships] = useState<CallMembership[]>([]);
  const room = mx.getRoom(roomId);
  useEffect(() => {
    if (!room) {
      setMemberships([]);
      return undefined;
    }

    const mxr = mx.matrixRTC.getRoomSession(room);

    const updateMemberships = () => {
      if (!room.isCallRoom()) return;
      setMemberships(MatrixRTCSession.callMembershipsForRoom(room));
    };

    updateMemberships();

    mxr.on(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    return () => {
      mxr.removeListener(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    };
  }, [mx, room, roomId]);

  return memberships;
};
