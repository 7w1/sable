import { atom } from 'jotai';
import { isTauri } from '@tauri-apps/api/core';

export const registrationAtom = atom(async (): Promise<ServiceWorkerRegistration | undefined> => {
  if (isTauri() || !('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.ready;
});
