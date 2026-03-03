import { useCallback } from 'react';
import { Box, Text, IconButton, Icon, Icons, Scroll, Switch } from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useRoom } from '$hooks/useRoom';
import { usePowerLevels } from '$hooks/usePowerLevels';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { StateEvent } from '$types/matrix/room';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';
import { createLogger } from '$utils/debug';
import { SequenceCardStyle } from '$features/common-settings/styles.css';

type CosmeticsProps = {
  requestClose: () => void;
};

const log = createLogger('Cosmetics');

export function Cosmetics({ requestClose }: CosmeticsProps) {
  const mx = useMatrixClient();
  const room = useRoom();
  const creators = useRoomCreators(room);
  const powerLevels = usePowerLevels(room);
  const isSpace = room.isSpaceRoom();

  const permissions = useRoomPermissions(creators, powerLevels);
  const canEditPermissions = permissions.stateEvent(StateEvent.RoomPowerLevels, mx.getSafeUserId());

  const getLevel = (eventType: string) => (powerLevels as any).events?.[eventType] ?? 50;

  const handleToggle = useCallback(
    async (eventType: string, enabled: boolean) => {
      const newLevel = enabled ? 0 : 50;
      const newContent = {
        ...powerLevels,
        events: {
          ...((powerLevels as any).events || {}),
          [eventType]: newLevel,
        },
      };

      try {
        await mx.sendStateEvent(room.roomId, StateEvent.RoomPowerLevels as any, newContent, '');
      } catch (e) {
        log.error(`Failed to update permissions for ${eventType}:`, e);
      }
    },
    [mx, room.roomId, powerLevels]
  );

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Cosmetics
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Settings</Text>

                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={isSpace ? 'Space-Wide Colors' : 'Room Colors'}
                    description={
                      isSpace
                        ? 'Allow everyone to use /gcolor in this space.'
                        : 'Allow everyone to use /color in this room.'
                    }
                    after={
                      <Switch
                        variant="Primary"
                        value={getLevel(StateEvent.RoomCosmeticsColor) === 0}
                        onChange={(enabled) => handleToggle(StateEvent.RoomCosmeticsColor, enabled)}
                        disabled={!canEditPermissions}
                      />
                    }
                  />
                </SequenceCard>

                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={isSpace ? 'Space-Wide Fonts' : 'Room Fonts'}
                    description={
                      isSpace
                        ? 'Allow everyone to use /gfont in this space.'
                        : 'Allow everyone to use /font in this room.'
                    }
                    after={
                      <Switch
                        variant="Primary"
                        value={getLevel(StateEvent.RoomCosmeticsFont) === 0}
                        onChange={(enabled) => handleToggle(StateEvent.RoomCosmeticsFont, enabled)}
                        disabled={!canEditPermissions}
                      />
                    }
                  />
                </SequenceCard>

                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title={isSpace ? 'Space-Wide Pronouns' : 'Room Pronouns'}
                    description={
                      isSpace
                        ? 'Allow everyone to use /gpronoun in this space.'
                        : 'Allow everyone to use /pronoun in this room.'
                    }
                    after={
                      <Switch
                        variant="Primary"
                        value={getLevel(StateEvent.RoomCosmeticsPronouns) === 0}
                        onChange={(enabled) =>
                          handleToggle(StateEvent.RoomCosmeticsPronouns, enabled)
                        }
                        disabled={!canEditPermissions}
                      />
                    }
                  />
                </SequenceCard>
              </Box>

              {/* --- COMMAND REFERENCE SECTION --- */}
              <Box direction="Column" gap="100">
                <Text size="L400">Commands</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                  style={{ padding: '16px' }}
                >
                  <Box direction="Column" gap="200">
                    <Box direction="Column">
                      <Text size="T300">/color [hex]</Text>
                      <Text size="T200" priority="300">
                        Set room-specific name color. (e.g. /color #ff00ff)
                      </Text>
                    </Box>
                    <Box direction="Column">
                      <Text size="T300">/font [name]</Text>
                      <Text size="T200" priority="300">
                        Set room-specific name font. (e.g. /font monospace)
                      </Text>
                    </Box>
                    <Box direction="Column">
                      <Text size="T300">/pronoun [pronouns]</Text>
                      <Text size="T200" priority="300">
                        Set room-specific pronoun set. (e.g. /pronoun &quot;they\them, it\its&quot;)
                      </Text>
                    </Box>
                    <Box direction="Column">
                      <Text size="T300">/gcolor | /gfont | /gpronoun</Text>
                      <Text size="T200" priority="300">
                        Apply colors/fonts/pronouns to the entire space.
                      </Text>
                    </Box>
                  </Box>
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
