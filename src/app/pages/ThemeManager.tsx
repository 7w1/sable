import { ReactNode, useEffect } from 'react';
import { configClass, varsClass } from 'folds';
import {
  DarkTheme,
  LightTheme,
  ThemeContextProvider,
  ThemeKind,
  useActiveTheme,
  useSystemThemeKind,
} from '$hooks/useTheme';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';

export function UnAuthRouteThemeManager() {
  const systemThemeKind = useSystemThemeKind();
  const [useCinnyFont] = useSetting(settingsAtom, 'useCinnyFont');

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    if (systemThemeKind === ThemeKind.Dark) {
      document.body.classList.add(...DarkTheme.classNames);
    }
    if (systemThemeKind === ThemeKind.Light) {
      document.body.classList.add(...LightTheme.classNames);
    }
    if (useCinnyFont) {
      document.body.classList.add('cinny-font');
    }
  }, [systemThemeKind, useCinnyFont]);

  return null;
}

export function AuthRouteThemeManager({ children }: { children: ReactNode }) {
  const activeTheme = useActiveTheme();
  const [monochromeMode] = useSetting(settingsAtom, 'monochromeMode');
  const [useCinnyFont] = useSetting(settingsAtom, 'useCinnyFont');

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);

    document.body.classList.add(...activeTheme.classNames);

    if (useCinnyFont) {
      document.body.classList.add('cinny-font');
    }

    if (monochromeMode) {
      document.body.style.filter = 'grayscale(1)';
    } else {
      document.body.style.filter = '';
    }
  }, [activeTheme, monochromeMode, useCinnyFont]);

  return <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>;
}
