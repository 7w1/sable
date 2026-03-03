import { useParams } from 'react-router-dom';
import { getCanonicalAliasRoomId, isRoomAlias } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';

export const useSelectedRoom = (): string | undefined => {
  const mx = useMatrixClient();

  const { roomIdOrAlias: encodedRoomIdOrAlias } = useParams();
  const roomIdOrAlias = encodedRoomIdOrAlias && decodeURIComponent(encodedRoomIdOrAlias);
  const roomId =
    roomIdOrAlias && isRoomAlias(roomIdOrAlias)
      ? getCanonicalAliasRoomId(mx, roomIdOrAlias)
      : roomIdOrAlias;

  return roomId;
};
