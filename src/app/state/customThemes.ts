import { atom } from 'jotai';
import { CustomThemeData } from '../utils/customTheme';

const STORAGE_KEY = 'custom-themes';

export const getCustomThemes = (): CustomThemeData[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomThemeData[];
  } catch {
    return [];
  }
};

const setCustomThemes = (themes: CustomThemeData[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
};

const baseCustomThemes = atom<CustomThemeData[]>(getCustomThemes());

export const customThemesAtom = atom<CustomThemeData[], [CustomThemeData[]], undefined>(
  (get) => get(baseCustomThemes),
  (_get, set, update) => {
    set(baseCustomThemes, update);
    setCustomThemes(update);
  }
);