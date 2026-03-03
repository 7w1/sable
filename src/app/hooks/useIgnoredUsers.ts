import { useMemo } from 'react';
import { AccountDataEvent } from '$types/matrix/accountData';
import { useAccountData } from './useAccountData';

export type IgnoredUserListContent = {
  ignored_users?: Record<string, object>;
};

export const useIgnoredUsers = (): string[] => {
  const ignoredUserListEvt = useAccountData(AccountDataEvent.IgnoredUserList);
  const ignoredUsers = useMemo(() => {
    const ignoredUsersRecord =
      ignoredUserListEvt?.getContent<IgnoredUserListContent>().ignored_users ?? {};
    return Object.keys(ignoredUsersRecord);
  }, [ignoredUserListEvt]);

  return ignoredUsers;
};
