import React, { useState } from 'react';
import {
  Avatar,
  Box,
  Icon,
  Icons,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  Tooltip,
} from 'folds';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import * as css from './styles.css';
import { UserAvatar } from '../user-avatar';
import colorMXID from '$util/colorMXID';
import { getMxIdLocalPart } from '$appUtils/matrix';
import { BreakWord, LineClamp3 } from '$styles/Text.css';
import { Presence, UserPresence } from '$hooks/useUserPresence';
import { AvatarPresence, PresenceBadge } from '../presence';
import { ImageViewer } from '../image-viewer';
import { stopPropagation } from '$appUtils/keyboard';
import { useRoom } from '$hooks/useRoom';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { useNickname } from '$hooks/useNickname';
import { useBlobCache } from '$hooks/useBlobCache';

type UserHeroProps = {
  userId: string;
  avatarUrl?: string;
  bannerUrl?: string;
  presence?: UserPresence;
};
export function UserHero({ userId, avatarUrl, bannerUrl, presence }: UserHeroProps) {
  const [viewAvatar, setViewAvatar] = useState<string>();

  const cachedBannerUrl = useBlobCache(bannerUrl);
  const cachedAvatarUrl = useBlobCache(avatarUrl);

  const coverUrl = cachedBannerUrl || cachedAvatarUrl;
  const isFallbackCover = !cachedBannerUrl && !!cachedAvatarUrl;

  return (
    <Box direction="Column" className={css.UserHero}>
      <div
        className={css.UserHeroCoverContainer}
        style={{
          backgroundColor: colorMXID(userId),
        }}
      >
        {coverUrl && (
          <img
            className={classNames(css.UserHeroCover, isFallbackCover && css.UserHeroCoverFallback)}
            src={coverUrl}
            alt={`${userId} cover`}
            draggable="false"
          />
        )}
      </div>
      <Box direction="Row" className={css.UserHeroAvatarStatusContainer}>
        <div className={css.UserHeroAvatarContainer}>
          <AvatarPresence
            className={css.UserAvatarContainer}
            badge={
              presence && <PresenceBadge presence={presence.presence} status={presence.status} />
            }
          >
            <Avatar
              as={avatarUrl ? 'button' : 'div'}
              onClick={avatarUrl ? () => setViewAvatar(avatarUrl) : undefined}
              className={css.UserHeroAvatar}
              size="500"
            >
              <UserAvatar
                className={css.UserHeroAvatarImg}
                userId={userId}
                src={avatarUrl}
                alt={userId}
                renderFallback={() => <Icon size="500" src={Icons.User} filled />}
              />
            </Avatar>
          </AvatarPresence>
          {viewAvatar && (
            <Overlay open backdrop={<OverlayBackdrop />}>
              <OverlayCenter>
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    onDeactivate: () => setViewAvatar(undefined),
                    clickOutsideDeactivates: true,
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <Modal size="500" onContextMenu={(evt: any) => evt.stopPropagation()}>
                    <ImageViewer
                      src={viewAvatar}
                      alt={userId}
                      requestClose={() => setViewAvatar(undefined)}
                    />
                  </Modal>
                </FocusTrap>
              </OverlayCenter>
            </Overlay>
          )}
        </div>
        {presence?.status?.length && (
          <div className={css.UserHeroStatusContainer}>
            <Tooltip style={{ maxWidth: '90%', justifySelf: 'center' }}>
              <Text size="T200"> {presence.status} </Text>
            </Tooltip>
          </div>
        )}
      </Box>
    </Box>
  );
}

type UserHeroNameProps = {
  displayName?: string;
  userId: string;
};
export function UserHeroName({ displayName, userId }: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);
  const nick = useNickname(userId);

  // Sable username color and fonts
  const { color, font } = useSableCosmetics(userId, useRoom());

  const shownName = nick ?? displayName ?? username ?? userId;

  return (
    <Box grow="Yes" direction="Column" gap="0">
      <Box alignItems="Baseline" gap="200" wrap="Wrap">
        <Text
          size="H4"
          className={classNames(BreakWord, LineClamp3)}
          title={shownName}
          style={{ color, fontFamily: font }}
        >
          {shownName}
        </Text>
        {nick && (
          <Text size="T200" priority="300" title={`Nickname (real: ${username})`}>
            (nick)
          </Text>
        )}
      </Box>
      <Box alignItems="Center" gap="100" wrap="Wrap">
        <Text size="T200" className={classNames(BreakWord, LineClamp3)} title={username}>
          @{username}
        </Text>
      </Box>
    </Box>
  );
}
