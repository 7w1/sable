import { useEffect, useState } from 'react';
import { ClientEvent, MatrixClient, MatrixEvent } from '$types/matrix-sdk';
import { AccountDataEvent } from '$types/matrix/accountData';
import { getRecentEmojis } from '$plugins/recent-emoji';
import { IEmoji } from '$plugins/emoji';

export const useRecentEmoji = (mx: MatrixClient, limit?: number): IEmoji[] => {
  const [recentEmoji, setRecentEmoji] = useState(() => getRecentEmojis(mx, limit));

  useEffect(() => {
    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.ElementRecentEmoji) return;
      setRecentEmoji(getRecentEmojis(mx, limit));
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx, limit]);

  return recentEmoji;
};
