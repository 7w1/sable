import { Box, Icon, Icons, Text, as, color, toRem } from 'folds';
import { EventTimelineSet, Room } from '$types/matrix-sdk';
import { MouseEventHandler, ReactNode, useCallback, useMemo } from 'react';
import classNames from 'classnames';
import parse from 'html-react-parser';
import { useAtomValue } from 'jotai';
import { getMemberDisplayName, trimReplyFromBody, trimReplyFromFormattedBody } from '$utils/room';
import { getMxIdLocalPart } from '$utils/matrix';
import { randomNumberBetween } from '$utils/common';
import {
  getReactCustomHtmlParser,
  scaleSystemEmoji,
  LINKIFY_OPTS,
} from '$plugins/react-custom-html-parser';
import { useRoomEvent } from '$hooks/useRoomEvent';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { nicknamesAtom } from '$state/nicknames';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { MessageBadEncryptedContent, MessageDeletedContent, MessageFailedContent } from './content';
import * as css from './Reply.css';
import { LinePlaceholder } from './placeholder';

type ReplyLayoutProps = {
  userColor?: string;
  username?: ReactNode;
};
export const ReplyLayout = as<'div', ReplyLayoutProps>(
  ({ username, userColor, className, children, ...props }, ref) => (
    <Box
      className={classNames(css.Reply, className)}
      alignItems="Center"
      gap="100"
      {...props}
      ref={ref}
    >
      <Box style={{ color: userColor, maxWidth: toRem(200) }} alignItems="Center" shrink="No">
        <Icon size="100" src={Icons.ReplyArrow} />
        {username}
      </Box>
      <Box grow="Yes" className={css.ReplyContent}>
        {children}
      </Box>
    </Box>
  )
);

export const ThreadIndicator = as<'div'>(({ ...props }, ref) => (
  <Box
    shrink="No"
    className={css.ThreadIndicator}
    alignItems="Center"
    gap="100"
    {...props}
    ref={ref}
  >
    <Icon size="50" src={Icons.Thread} />
    <Text size="L400">Thread</Text>
  </Box>
));

type ReplyProps = {
  room: Room;
  timelineSet?: EventTimelineSet | undefined;
  replyEventId: string;
  threadRootId?: string | undefined;
  onClick?: MouseEventHandler | undefined;
};

export const Reply = as<'div', ReplyProps>(
  ({ room, timelineSet, replyEventId, threadRootId, onClick, ...props }, ref) => {
    const placeholderWidth = useMemo(() => randomNumberBetween(40, 400), []);
    const getFromLocalTimeline = useCallback(
      () => timelineSet?.findEventById(replyEventId),
      [timelineSet, replyEventId]
    );
    const replyEvent = useRoomEvent(room, replyEventId, getFromLocalTimeline);

    const mx = useMatrixClient();

    const { body, formatted_body: formattedBody, format } = replyEvent?.getContent() ?? {};
    const sender = replyEvent?.getSender();

    const { color: usernameColor, font: usernameFont } = useSableCosmetics(sender ?? '', room);
    const nicknames = useAtomValue(nicknamesAtom);

    const fallbackBody = replyEvent?.isRedacted() ? (
      <MessageDeletedContent />
    ) : (
      <MessageFailedContent />
    );

    const badEncryption = replyEvent?.getContent().msgtype === 'm.bad.encrypted';
    let bodyJSX: ReactNode = fallbackBody;

    if (format === 'org.matrix.custom.html' && formattedBody) {
      const strippedHtml = trimReplyFromFormattedBody(formattedBody)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
        .replace(/<\/?p[^>]*>/gi, '')
        .replace(/(?:\r\n|\r|\n)/g, ' ');
      const parserOpts = getReactCustomHtmlParser(mx, room.roomId, {
        linkifyOpts: LINKIFY_OPTS,
        nicknames,
      });
      bodyJSX = parse(strippedHtml, parserOpts) as JSX.Element;
    } else if (body) {
      const strippedBody = trimReplyFromBody(body).replace(/(?:\r\n|\r|\n)/g, ' ');
      bodyJSX = scaleSystemEmoji(strippedBody);
    }

    return (
      <Box direction="Row" gap="200" alignItems="Center" {...props} ref={ref}>
        {threadRootId && (
          <ThreadIndicator as="button" data-event-id={threadRootId} onClick={onClick} />
        )}
        <ReplyLayout
          as="button"
          userColor={usernameColor}
          username={
            sender && (
              <Text size="T300" truncate style={{ fontFamily: usernameFont }}>
                <b>{getMemberDisplayName(room, sender, nicknames) ?? getMxIdLocalPart(sender)}</b>
              </Text>
            )
          }
          data-event-id={replyEventId}
          onClick={onClick}
        >
          {replyEvent !== undefined ? (
            <Text size="T300" truncate>
              {badEncryption ? <MessageBadEncryptedContent /> : bodyJSX}
            </Text>
          ) : (
            <LinePlaceholder
              style={{
                backgroundColor: color.SurfaceVariant.ContainerActive,
                width: toRem(placeholderWidth),
                maxWidth: '100%',
              }}
            />
          )}
        </ReplyLayout>
      </Box>
    );
  }
);
