import { useMemo } from 'react';
import { getCanonicalAliasRoomId, isRoomAlias } from '$utils/matrix';
import { useMatrixClient } from './useMatrixClient';

export const useJoinedRoomId = (allRooms: string[], roomIdOrAlias: string): string | undefined => {
  const mx = useMatrixClient();

  const joinedRoomId = useMemo(() => {
    const roomId = isRoomAlias(roomIdOrAlias)
      ? getCanonicalAliasRoomId(mx, roomIdOrAlias)
      : roomIdOrAlias;

    if (roomId && allRooms.includes(roomId)) return roomId;
    return undefined;
  }, [mx, allRooms, roomIdOrAlias]);

  return joinedRoomId;
};
