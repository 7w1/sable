import { ChangeEventHandler, useCallback, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { customThemesAtom } from '../state/customThemes';
import {
  CustomThemeData,
  parseCustomThemeYaml,
  removeCustomThemeStyle,
} from '../utils/customTheme';

export function useCustomThemes() {
  const [customThemes, setCustomThemes] = useAtom(customThemesAtom);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (evt) => {
      setError(undefined);
      const file = evt.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const themeData = parseCustomThemeYaml(reader.result as string);
          setCustomThemes([...customThemes, themeData]);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to parse theme file');
        }
      };
      reader.readAsText(file);
      evt.target.value = '';
    },
    [customThemes, setCustomThemes]
  );

  const deleteTheme = useCallback(
    (id: string) => {
      const theme = customThemes.find((t: CustomThemeData) => t.id === id);
      if (theme) removeCustomThemeStyle(theme);
      setCustomThemes(customThemes.filter((t: CustomThemeData) => t.id !== id));
    },
    [customThemes, setCustomThemes]
  );

  return {
    customThemes,
    error,
    fileInputRef,
    triggerUpload,
    handleFileChange,
    deleteTheme,
  };
}