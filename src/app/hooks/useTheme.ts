import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onDarkFontWeight, onLightFontWeight } from '../../config.css';
import {
  butterTheme,
  cinnyDarkTheme,
  darkTheme,
  lightTheme,
  rosePineTheme,
  silverTheme,
} from '../../colors.css';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';
import { useAtomValue } from 'jotai';
import { customThemesAtom } from '../state/customThemes';
import { CustomThemeData, injectCustomThemeStyle } from '../utils/customTheme';

export enum ThemeKind {
  Light = 'light',
  Dark = 'dark',
}

export type Theme = {
  id: string;
  kind: ThemeKind;
  classNames: string[];
};

export const LightTheme: Theme = {
  id: 'light-theme',
  kind: ThemeKind.Light,
  classNames: ['light-theme', lightTheme, onLightFontWeight, 'prism-light'],
};

export const SilverTheme: Theme = {
  id: 'silver-theme',
  kind: ThemeKind.Light,
  classNames: ['silver-theme', silverTheme, onLightFontWeight, 'prism-light'],
};
export const DarkTheme: Theme = {
  id: 'dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['dark-theme', darkTheme, onDarkFontWeight, 'prism-dark'],
};
export const ButterTheme: Theme = {
  id: 'butter-theme',
  kind: ThemeKind.Dark,
  classNames: ['butter-theme', butterTheme, onDarkFontWeight, 'prism-dark'],
};
export const RosePineTheme: Theme = {
  id: 'rose-pine-theme',
  kind: ThemeKind.Dark,
  classNames: ['rose-pine-theme', rosePineTheme, onDarkFontWeight, 'prism-dark'],
};
export const CinnyDarkTheme: Theme = {
  id: 'cinny-dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['cinny-dark-theme', cinnyDarkTheme, onDarkFontWeight, 'prism-dark'],
};

const BUILTIN_THEMES: Theme[] = [LightTheme, SilverTheme, DarkTheme, ButterTheme, RosePineTheme];

const BUILTIN_THEME_NAMES: Record<string, string> = {
  [LightTheme.id]: 'Light',
  [SilverTheme.id]: 'Silver',
  [DarkTheme.id]: 'Dark',
  [ButterTheme.id]: 'Butter',
  [RosePineTheme.id]: 'Rose Pine',
};

function customThemeDataToTheme(data: CustomThemeData): Theme {
  const className = injectCustomThemeStyle(data);
  const fontWeight = data.kind === ThemeKind.Light ? onLightFontWeight : onDarkFontWeight;
  const prism = data.kind === ThemeKind.Light ? 'prism-light' : 'prism-dark';
  return {
    id: data.id,
    kind: data.kind,
    classNames: [className, fontWeight, prism],
  };
}

export const useThemes = (): Theme[] => {
  const customThemes = useAtomValue(customThemesAtom);
  return useMemo(
    () => [...BUILTIN_THEMES, ...customThemes.map(customThemeDataToTheme)],
    [customThemes]
  );
};

export const useThemeNames = (): Record<string, string> => {
  const customThemes = useAtomValue(customThemesAtom);
  return useMemo(() => {
    const names: Record<string, string> = { ...BUILTIN_THEME_NAMES };
    customThemes.forEach((t) => {
      names[t.id] = t.name;
    });
    return names;
  }, [customThemes]);
};

export const useSystemThemeKind = (): ThemeKind => {
  const darkModeQueryList = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [themeKind, setThemeKind] = useState<ThemeKind>(
    darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light
  );

  useEffect(() => {
    const handleMediaQueryChange = () => {
      setThemeKind(darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light);
    };

    darkModeQueryList.addEventListener('change', handleMediaQueryChange);
    return () => {
      darkModeQueryList.removeEventListener('change', handleMediaQueryChange);
    };
  }, [darkModeQueryList, setThemeKind]);

  return themeKind;
};

export const useActiveTheme = (): Theme => {
  const systemThemeKind = useSystemThemeKind();
  const themes = useThemes();
  const [systemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [themeId] = useSetting(settingsAtom, 'themeId');
  const [lightThemeId] = useSetting(settingsAtom, 'lightThemeId');
  const [darkThemeId] = useSetting(settingsAtom, 'darkThemeId');

  if (!systemTheme) {
    const selectedTheme = themes.find((theme) => theme.id === themeId) ?? LightTheme;

    return selectedTheme;
  }

  const selectedTheme =
    systemThemeKind === ThemeKind.Dark
      ? (themes.find((theme) => theme.id === darkThemeId) ?? DarkTheme)
      : (themes.find((theme) => theme.id === lightThemeId) ?? LightTheme);

  return selectedTheme;
};

const ThemeContext = createContext<Theme | null>(null);
export const ThemeContextProvider = ThemeContext.Provider;

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('No theme provided!');
  }

  return theme;
};
