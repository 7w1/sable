import { produce } from 'immer';
import { atom, useSetAtom } from 'jotai';
import {
  ClientEvent,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomEvent,
  RoomStateEvent,
  SyncState,
} from '$types/matrix-sdk';
import { useCallback, useEffect, useRef } from 'react';
import { Membership, RoomToParents, StateEvent } from '$types/matrix/room';
import { getRoomToParents, isSpace, mapParentWithChildren } from '$utils/room';
import { useSyncState } from '$hooks/useSyncState';

export type RoomToParentsAction =
  | {
      type: 'INITIALIZE';
      roomToParents: RoomToParents;
    }
  | {
      type: 'PUT';
      parent: string;
      children: string[];
    }
  | {
      type: 'REMOVE_CHILD';
      parent: string;
      child: string;
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

const baseRoomToParents = atom<RoomToParents>(new Map());
export const roomToParentsAtom = atom<RoomToParents, [RoomToParentsAction], undefined>(
  (get) => get(baseRoomToParents),
  (get, set, action) => {
    if (action.type === 'INITIALIZE') {
      set(baseRoomToParents, action.roomToParents);
      return;
    }
    if (action.type === 'PUT') {
      set(
        baseRoomToParents,
        produce(get(baseRoomToParents), (draftRoomToParents) => {
          mapParentWithChildren(draftRoomToParents, action.parent, action.children);
        })
      );
      return;
    }
    if (action.type === 'REMOVE_CHILD') {
      set(
        baseRoomToParents,
        produce(get(baseRoomToParents), (draftRoomToParents) => {
          const parents = draftRoomToParents.get(action.child);
          if (!parents) return;
          parents.delete(action.parent);
          if (parents.size === 0) {
            draftRoomToParents.delete(action.child);
          } else {
            draftRoomToParents.set(action.child, parents);
          }
        })
      );
      return;
    }
    if (action.type === 'DELETE') {
      set(
        baseRoomToParents,
        produce(get(baseRoomToParents), (draftRoomToParents) => {
          const noParentRooms: string[] = [];
          draftRoomToParents.delete(action.roomId);
          draftRoomToParents.forEach((parents, child) => {
            parents.delete(action.roomId);
            if (parents.size === 0) noParentRooms.push(child);
          });
          noParentRooms.forEach((room) => draftRoomToParents.delete(room));
        })
      );
    }
  }
);

export const useBindRoomToParentsAtom = (
  mx: MatrixClient,
  roomToParents: typeof roomToParentsAtom
) => {
  const setRoomToParents = useSetAtom(roomToParents);
  const resetRoomToParents = useCallback(
    () => setRoomToParents({ type: 'INITIALIZE', roomToParents: getRoomToParents(mx) }),
    [mx, setRoomToParents]
  );
  // Tracks whether a batched microtask flush is already queued. Using a ref
  // (not state) so scheduling never causes a re-render of the binding component.
  const pendingBatchRef = useRef(false);

  useSyncState(
    mx,
    useCallback(
      (state, prevState) => {
        if (
          (state === SyncState.Prepared && prevState === null) ||
          (state === SyncState.Syncing && prevState !== SyncState.Syncing)
        ) {
          resetRoomToParents();
        }
      },
      [resetRoomToParents]
    )
  );

  useEffect(() => {
    resetRoomToParents();

    // Batch rapid space topology changes into a single atom update. During initial
    // sliding sync load, m.space.child events arrive in bursts (one per child per space).
    // Each individual dispatch creates a new immer Map and triggers all roomToParents
    // consumers to re-run their selectors. Coalescing into one INITIALIZE per microtask
    // batch collapses N atom updates into 1 without any perceptible delay.
    const scheduleBatchedReset = () => {
      if (!pendingBatchRef.current) {
        pendingBatchRef.current = true;
        queueMicrotask(() => {
          pendingBatchRef.current = false;
          resetRoomToParents();
        });
      }
    };

    const handleAddRoom = (room: Room) => {
      if (isSpace(room) && room.getMyMembership() === Membership.Join) {
        scheduleBatchedReset();
      }
    };

    const handleMembershipChange = (room: Room) => {
      if (isSpace(room)) scheduleBatchedReset();
    };

    const handleStateChange = (mEvent: MatrixEvent) => {
      if (mEvent.getType() === StateEvent.SpaceChild) {
        scheduleBatchedReset();
      }
    };

    const handleDeleteRoom = () => {
      scheduleBatchedReset();
    };

    mx.on(ClientEvent.Room, handleAddRoom);
    mx.on(RoomEvent.MyMembership, handleMembershipChange);
    mx.on(RoomStateEvent.Events, handleStateChange);
    mx.on(ClientEvent.DeleteRoom, handleDeleteRoom);
    return () => {
      mx.removeListener(ClientEvent.Room, handleAddRoom);
      mx.removeListener(RoomEvent.MyMembership, handleMembershipChange);
      mx.removeListener(RoomStateEvent.Events, handleStateChange);
      mx.removeListener(ClientEvent.DeleteRoom, handleDeleteRoom);
    };
  }, [mx, setRoomToParents, resetRoomToParents]);
};
