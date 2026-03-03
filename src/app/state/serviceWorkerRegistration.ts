import { atom } from 'jotai';

export const registrationAtom = atom(async () => navigator.serviceWorker.ready);
