import { MatrixEvent, MatrixEventEvent, MatrixEventHandlerMap } from '$types/matrix-sdk';
import { ReactNode, useEffect, useState } from 'react';
import { MessageEvent } from '$types/matrix/room';
import { useMatrixClient } from '$hooks/useMatrixClient';

type EncryptedContentProps = {
  mEvent: MatrixEvent;
  children: () => ReactNode;
};

export function EncryptedContent({ mEvent, children }: EncryptedContentProps) {
  const mx = useMatrixClient();
  const [, toggleEncrypted] = useState(mEvent.getType() === MessageEvent.RoomMessageEncrypted);

  useEffect(() => {
    if (mEvent.getType() !== MessageEvent.RoomMessageEncrypted) return;
    mx.decryptEventIfNeeded(mEvent).catch(() => undefined);
  }, [mx, mEvent]);

  useEffect(() => {
    toggleEncrypted(mEvent.getType() === MessageEvent.RoomMessageEncrypted);
    const handleDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = (event) => {
      toggleEncrypted(event.getType() === MessageEvent.RoomMessageEncrypted);
    };
    mEvent.on(MatrixEventEvent.Decrypted, handleDecrypted);
    return () => {
      mEvent.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
    };
  }, [mEvent]);

  return <>{children()}</>;
}
