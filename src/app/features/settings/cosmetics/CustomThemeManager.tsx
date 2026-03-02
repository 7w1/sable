import React from 'react';
import { Box, Button, Icon, IconButton, Icons, Text, color } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';
import { useCustomThemes } from '../../../hooks/useCustomThemes';

export function CustomThemeManager() {
  const { customThemes, error, fileInputRef, triggerUpload, handleFileChange, deleteTheme } =
    useCustomThemes();

  return (
    <Box direction="Column" gap="100">
      <Box alignItems="Center" gap="200">
        <Text size="L400">Custom Themes</Text>
        <IconButton size="300" variant="Surface" radii="300" onClick={triggerUpload}>
          <Icon size="200" src={Icons.Plus} />
        </IconButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yml,.yaml"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </Box>
      {error && (
        <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        </SequenceCard>
      )}
      {customThemes.map((theme) => (
        <SequenceCard
          key={theme.id}
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
        >
          <SettingTile
            title={theme.name}
            description={theme.kind === 'light' ? 'Light theme' : 'Dark theme'}
            after={
              <Button
                size="300"
                variant="Critical"
                fill="Soft"
                radii="300"
                onClick={() => deleteTheme(theme.id)}
              >
                <Text size="B300">Delete</Text>
              </Button>
            }
          />
        </SequenceCard>
      ))}
    </Box>
  );
}