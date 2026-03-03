import { ReactNode } from 'react';
import { CryptoApi } from '$types/matrix-sdk';
import {
  useDeviceVerificationStatus,
  VerificationStatus,
} from '$hooks/useDeviceVerificationStatus';

type DeviceVerificationStatusProps = {
  crypto?: CryptoApi;
  userId: string;
  deviceId: string;
  children: (verificationStatus: VerificationStatus) => ReactNode;
};

export function DeviceVerificationStatus({
  crypto,
  userId,
  deviceId,
  children,
}: DeviceVerificationStatusProps) {
  const status = useDeviceVerificationStatus(crypto, userId, deviceId);

  return children(status);
}
