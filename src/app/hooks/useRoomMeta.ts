import { useEffect, useMemo, useState } from 'react';
import { RoomJoinRulesEventContent, Room, RoomEvent, RoomStateEvent } from '$types/matrix-sdk';
import { StateEvent } from '$types/matrix/room';
import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { nicknamesAtom } from '$state/nicknames';
import { useStateEvent } from './useStateEvent';

export const useRoomAvatar = (room: Room, dm?: boolean): string | undefined => {
  const avatarEvent = useStateEvent(room, StateEvent.RoomAvatar);

  if (dm) {
    return room.getAvatarFallbackMember()?.getMxcAvatarUrl();
  }
  const content = avatarEvent?.getContent();
  const avatarMxc = content && typeof content.url === 'string' ? content.url : undefined;

  return avatarMxc;
};

export const useRoomName = (room: Room): string => {
  const dmUserId = room.guessDMUserId();
  // Use a scoped selectAtom subscription so that only a nickname change for
  // *this specific DM user* causes a re-render. The previous useNickname call
  // subscribed to the whole nicknamesAtom object, causing all components using
  // useRoomName to re-render whenever *any* contact's nickname changed.
  const dmNickname = useAtomValue(
    useMemo(
      () => selectAtom(nicknamesAtom, (n) => (dmUserId ? n[dmUserId] : undefined)),
      [dmUserId]
    )
  );
  const [name, setName] = useState(room.name);

  useEffect(() => {
    const updateName = () => {
      if (room.name === 'Empty room') {
        room.recalculate();
      }

      // small room = dm i promise trust
      const memberCount = room.getJoinedMemberCount();
      const isSmallRoom = memberCount <= 2;

      const nextName = isSmallRoom && dmNickname ? dmNickname : room.name;
      setName((prev) => (prev !== nextName ? nextName : prev));
    };

    updateName();

    room.on(RoomEvent.Name, updateName);
    // Only subscribe to member events for DM rooms. For group rooms the name
    // doesn't depend on member state, and with sliding sync lazy member loading
    // RoomStateEvent.Members fires for every member as they arrive, causing
    // needless re-renders across all mounted room nav items.
    if (dmUserId) {
      room.on(RoomStateEvent.Members, updateName);
    }

    return () => {
      room.removeListener(RoomEvent.Name, updateName);
      if (dmUserId) {
        room.removeListener(RoomStateEvent.Members, updateName);
      }
    };
  }, [room, dmNickname, dmUserId]);

  return name;
};

export const useRoomTopic = (room: Room): string | undefined => {
  const topicEvent = useStateEvent(room, StateEvent.RoomTopic);

  const content = topicEvent?.getContent();
  const topic = content && typeof content.topic === 'string' ? content.topic : undefined;

  return topic;
};

export const useRoomJoinRule = (room: Room): RoomJoinRulesEventContent | undefined => {
  const mEvent = useStateEvent(room, StateEvent.RoomJoinRules);
  const joinRuleContent = mEvent?.getContent<RoomJoinRulesEventContent>();
  return joinRuleContent;
};
