import {
  forwardRef,
  KeyboardEventHandler,
  MouseEvent,
  RefObject,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { isKeyHotkey } from 'is-hotkey';
import {
  EventType,
  IContent,
  MsgType,
  RelationType,
  Room,
  IEventRelation,
  StickerEventContent,
} from '$types/matrix-sdk';
import { ReactEditor } from 'slate-react';
import { Editor, Transforms } from 'slate';
import {
  Box,
  config,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Line,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  Scroll,
  Text,
  toRem,
} from 'folds';

import parse from 'html-react-parser';
import {
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  scaleSystemEmoji,
} from '$plugins/react-custom-html-parser';

import { useMatrixClient } from '$hooks/useMatrixClient';
import {
  AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  AutocompleteQuery,
  createEmoticonElement,
  CustomEditor,
  customHtmlEqualsPlainText,
  getAutocompleteQuery,
  getPrevWorldRange,
  resetEditor,
  RoomMentionAutocomplete,
  toMatrixCustomHTML,
  Toolbar,
  toPlainText,
  trimCustomHtml,
  UserMentionAutocomplete,
  EmoticonAutocomplete,
  moveCursor,
  resetEditorHistory,
  isEmptyEditor,
  getBeginCommand,
  trimCommand,
  getMentions,
} from '$components/editor';
import { EmojiBoard, EmojiBoardTab } from '$components/emoji-board';
import { UseStateProvider } from '$components/UseStateProvider';
import {
  TUploadContent,
  encryptFile,
  getImageInfo,
  getMxIdLocalPart,
  mxcUrlToHttp,
} from '$utils/matrix';
import { useTypingStatusUpdater } from '$hooks/useTypingStatusUpdater';
import { useFilePicker } from '$hooks/useFilePicker';
import { useFilePasteHandler } from '$hooks/useFilePasteHandler';
import { useFileDropZone } from '$hooks/useFileDrop';
import {
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
  TUploadItem,
  TUploadMetadata,
  IReplyDraft,
} from '$state/room/roomInputDrafts';
import { UploadCardRenderer } from '$components/upload-card';
import {
  UploadBoard,
  UploadBoardContent,
  UploadBoardHeader,
  UploadBoardImperativeHandlers,
} from '$components/upload-board';
import { Upload, UploadStatus, UploadSuccess, createUploadFamilyObserverAtom } from '$state/upload';
import { getImageUrlBlob, loadImageElement } from '$utils/dom';
import { safeFile } from '$utils/mimeTypes';
import { fulfilledPromiseSettledResult } from '$utils/common';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
  getMemberDisplayName,
  getMentionContent,
  trimReplyFromBody,
  trimReplyFromFormattedBody,
} from '$utils/room';
import { Command, SHRUG, TABLEFLIP, UNFLIP, useCommands } from '$hooks/useCommands';
import { mobileOrTablet } from '$utils/user-agent';
import { useElementSizeObserver } from '$hooks/useElementSizeObserver';
import { ReplyLayout, ThreadIndicator } from '$components/message';
import { roomToParentsAtom } from '$state/room/roomToParents';
import { nicknamesAtom } from '$state/nicknames';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useImagePackRooms } from '$hooks/useImagePackRooms';
import { useComposingCheck } from '$hooks/useComposingCheck';
import { useSableCosmetics } from '$hooks/useSableCosmetics';
import { createLogger } from '$utils/debug';
import { CommandAutocomplete } from './CommandAutocomplete';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
} from './msgContent';

const getReplyContent = (replyDraft: IReplyDraft | undefined): IEventRelation => {
  if (!replyDraft) return {};

  const relatesTo: IEventRelation = {};

  relatesTo['m.in_reply_to'] = {
    event_id: replyDraft.eventId,
  };

  if (replyDraft.relation?.rel_type === RelationType.Thread) {
    relatesTo.event_id = replyDraft.relation.event_id;
    relatesTo.rel_type = RelationType.Thread;
    relatesTo.is_falling_back = false;
  }
  return relatesTo;
};

const log = createLogger('RoomInput');
interface ReplyEventContent {
  'm.relates_to'?: IEventRelation;
}

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement>;
  roomId: string;
  room: Room;
}
export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  ({ editor, fileDropContainerRef, roomId, room }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [isMarkdown] = useSetting(settingsAtom, 'isMarkdown');
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const commands = useCommands(mx, room);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const nicknames = useAtomValue(nicknamesAtom);

    const [msgDraft, setMsgDraft] = useAtom(roomIdToMsgDraftAtomFamily(roomId));
    const [replyDraft, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(roomId));
    const replyUserID = replyDraft?.userId;

    const { color: replyUsernameColor, font: replyUsernameFont } = useSableCosmetics(
      replyUserID ?? '',
      room
    );

    const [uploadBoard, setUploadBoard] = useState(true);
    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(roomId));
    const uploadFamilyObserverAtom = createUploadFamilyObserverAtom(
      roomUploadAtomFamily,
      selectedFiles.map((f) => f.file)
    );
    const uploadBoardHandlers = useRef<UploadBoardImperativeHandlers>();

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);

    const [toolbar, setToolbar] = useSetting(settingsAtom, 'editorToolbar');
    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();

    const sendTypingStatus = useTypingStatusUpdater(mx, roomId);

    const [inputKey, setInputKey] = useState(0);

    const handleFiles = useCallback(
      async (files: File[]) => {
        setUploadBoard(true);
        const safeFiles = files.map(safeFile);
        const fileItems: TUploadItem[] = [];

        if (room.hasEncryptionStateEvent()) {
          const encryptFiles = fulfilledPromiseSettledResult(
            await Promise.allSettled(safeFiles.map((f) => encryptFile(f)))
          );
          encryptFiles.forEach((ef) =>
            fileItems.push({
              ...ef,
              metadata: {
                markedAsSpoiler: false,
              },
            })
          );
        } else {
          safeFiles.forEach((f) =>
            fileItems.push({
              file: f,
              originalFile: f,
              encInfo: undefined,
              metadata: {
                markedAsSpoiler: false,
              },
            })
          );
        }
        setSelectedFiles({
          type: 'PUT',
          item: fileItems,
        });
      },
      [setSelectedFiles, room]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const handlePaste = useFilePasteHandler(handleFiles);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);
    const [hideStickerBtn, setHideStickerBtn] = useState(document.body.clientWidth < 500);

    const isComposing = useComposingCheck();

    useElementSizeObserver(
      useCallback(() => document.body, []),
      useCallback((width) => setHideStickerBtn(width < 500), [])
    );

    const replyEvent = replyDraft ? room.findEventById(replyDraft.eventId) : undefined;
    const {
      body: replyBody,
      formatted_body: replyFormattedBody,
      format: replyFormat,
    } = replyEvent?.getContent() ?? {};

    let replyBodyJSX: ReactNode = replyDraft ? trimReplyFromBody(replyDraft.body) : null;

    if (replyFormat === 'org.matrix.custom.html' && replyFormattedBody) {
      const strippedHtml = trimReplyFromFormattedBody(replyFormattedBody)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
        .replace(/<\/?p[^>]*>/gi, '')
        .replace(/(?:\r\n|\r|\n)/g, ' ');
      const parserOpts = getReactCustomHtmlParser(mx, roomId, {
        linkifyOpts: LINKIFY_OPTS,
        nicknames,
      });
      replyBodyJSX = parse(strippedHtml, parserOpts);
    } else if (replyBody) {
      const strippedBody = trimReplyFromBody(replyBody).replace(/(?:\r\n|\r|\n)/g, ' ');
      replyBodyJSX = scaleSystemEmoji(trimReplyFromBody(strippedBody));
    } else if (replyDraft) {
      const strippedBody = trimReplyFromBody(replyDraft.body).replace(/(?:\r\n|\r|\n)/g, ' ');
      replyBodyJSX = scaleSystemEmoji(trimReplyFromBody(strippedBody));
    }

    useEffect(() => {
      Transforms.insertFragment(editor, msgDraft);
    }, [editor, msgDraft]);

    useEffect(
      () => () => {
        if (!isEmptyEditor(editor)) {
          const parsedDraft = JSON.parse(JSON.stringify(editor.children));
          setMsgDraft(parsedDraft);
        } else {
          setMsgDraft([]);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
      },
      [roomId, editor, setMsgDraft]
    );

    const handleFileMetadata = useCallback(
      (fileItem: TUploadItem, metadata: TUploadMetadata) => {
        setSelectedFiles({
          type: 'REPLACE',
          item: fileItem,
          replacement: { ...fileItem, metadata },
        });
      },
      [setSelectedFiles]
    );

    const handleRemoveUpload = useCallback(
      (upload: TUploadContent | TUploadContent[]) => {
        const uploads = Array.isArray(upload) ? upload : [upload];
        setSelectedFiles({
          type: 'DELETE',
          item: selectedFiles.filter((f) => uploads.find((u) => u === f.file)),
        });
        uploads.forEach((u) => roomUploadAtomFamily.remove(u));
      },
      [setSelectedFiles, selectedFiles]
    );

    const handleCancelUpload = (uploads: Upload[]) => {
      uploads.forEach((upload) => {
        if (upload.status === UploadStatus.Loading) {
          mx.cancelUpload(upload.promise);
        }
      });
      handleRemoveUpload(uploads.map((upload) => upload.file));
    };

    const handleSendUpload = async (uploads: UploadSuccess[]) => {
      const plaintext = toPlainText(editor.children, isMarkdown).trim();
      const contentsPromises = uploads.map(async (upload) => {
        const fileItem = selectedFiles.find((f) => f.file === upload.file);
        if (!fileItem) throw new Error('Broken upload');

        if (fileItem.file.type.startsWith('image')) {
          return getImageMsgContent(mx, fileItem, upload.mxc);
        }
        if (fileItem.file.type.startsWith('video')) {
          return getVideoMsgContent(mx, fileItem, upload.mxc);
        }
        if (fileItem.file.type.startsWith('audio')) {
          return getAudioMsgContent(fileItem, upload.mxc);
        }
        return getFileMsgContent(fileItem, upload.mxc);
      });
      handleCancelUpload(uploads);
      const contents = fulfilledPromiseSettledResult(await Promise.allSettled(contentsPromises));

      if (contents.length > 0) {
        const replyContent = plaintext.length === 0 ? getReplyContent(replyDraft) : undefined;
        if (replyContent) contents[0]['m.relates_to'] = replyContent;
        setReplyDraft(undefined);
      }

      await Promise.all(
        contents.map((content) =>
          mx.sendMessage(roomId, content as any).catch((error: unknown) => {
            log.error('failed to send uploaded message', { roomId }, error);
            throw error;
          })
        )
      );
    };

    const submit = useCallback(async () => {
      uploadBoardHandlers.current?.handleSend();

      const commandName = getBeginCommand(editor);
      let plainText = toPlainText(editor.children, isMarkdown).trim();
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(editor.children, {
          allowTextFormatting: true,
          allowBlockMarkdown: isMarkdown,
          allowInlineMarkdown: isMarkdown,
        })
      );
      let msgType = MsgType.Text;

      if (commandName) {
        plainText = trimCommand(commandName, plainText);
        customHtml = trimCommand(commandName, customHtml);
      }
      if (commandName === Command.Me) {
        msgType = MsgType.Emote;
      } else if (commandName === Command.Notice) {
        msgType = MsgType.Notice;
      } else if (commandName === Command.Shrug) {
        plainText = `${SHRUG} ${plainText}`;
        customHtml = `${SHRUG} ${customHtml}`;
      } else if (commandName === Command.TableFlip) {
        plainText = `${TABLEFLIP} ${plainText}`;
        customHtml = `${TABLEFLIP} ${customHtml}`;
      } else if (commandName === Command.UnFlip) {
        plainText = `${UNFLIP} ${plainText}`;
        customHtml = `${UNFLIP} ${customHtml}`;
      } else if (commandName) {
        const commandContent = commands[commandName as Command];
        if (commandContent) {
          commandContent.exe(plainText, customHtml);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);

        return;
      }

      if (plainText === '') return;

      const body = plainText;
      const formattedBody = customHtml;
      const mentionData = getMentions(mx, roomId, editor);

      const content: IContent = {
        msgtype: msgType,
        body,
      };

      if (replyDraft && replyDraft.userId !== mx.getUserId()) {
        mentionData.users.add(replyDraft.userId);
      }

      content['m.mentions'] = getMentionContent(Array.from(mentionData.users), mentionData.room);

      if (replyDraft || !customHtmlEqualsPlainText(formattedBody, body)) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = formattedBody;
      }
      if (replyDraft) {
        content['m.relates_to'] = getReplyContent(replyDraft);
      }
      if (replyDraft) {
        setReplyDraft(undefined);
      }

      resetEditor(editor);
      resetEditorHistory(editor);
      setInputKey((prev) => prev + 1);
      sendTypingStatus(false);

      try {
        await mx.sendMessage(roomId, content as any);
      } catch (error) {
        log.error('failed to send message', { roomId }, error);
      }
    }, [mx, roomId, editor, replyDraft, sendTypingStatus, setReplyDraft, isMarkdown, commands]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          submit().catch((error) => {
            log.error('submit failed', { roomId }, error);
          });
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (autocompleteQuery) {
            setAutocompleteQuery(undefined);
            return;
          }
          setReplyDraft(undefined);
        }
      },
      [submit, roomId, setReplyDraft, enterForNewline, autocompleteQuery, isComposing]
    );

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        if (!hideActivity) {
          sendTypingStatus(!isEmptyEditor(editor));
        }

        const prevWordRange = getPrevWorldRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery<AutocompletePrefix>(editor, prevWordRange, AUTOCOMPLETE_PREFIXES)
          : undefined;
        setAutocompleteQuery(query);
      },
      [editor, sendTypingStatus, hideActivity]
    );

    const handleCloseAutocomplete = useCallback(() => {
      setAutocompleteQuery(undefined);
      ReactEditor.focus(editor);
    }, [editor]);

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor);
    };

    const handleStickerSelect = async (mxc: string, shortcode: string, label: string) => {
      const stickerUrl = mxcUrlToHttp(mx, mxc, useAuthentication);
      if (!stickerUrl) return;

      const info = await getImageInfo(
        await loadImageElement(stickerUrl),
        await getImageUrlBlob(stickerUrl)
      );

      const content: StickerEventContent & ReplyEventContent = {
        body: label,
        url: mxc,
        info,
      };
      if (replyDraft) {
        content['m.relates_to'] = getReplyContent(replyDraft);
        setReplyDraft(undefined);
      }
      mx.sendEvent(roomId, EventType.Sticker, content);
    };

    return (
      <div ref={ref}>
        {selectedFiles.length > 0 && (
          <UploadBoard
            header={
              <UploadBoardHeader
                open={uploadBoard}
                onToggle={() => setUploadBoard(!uploadBoard)}
                uploadFamilyObserverAtom={uploadFamilyObserverAtom}
                onSend={handleSendUpload}
                imperativeHandlerRef={uploadBoardHandlers}
                onCancel={handleCancelUpload}
              />
            }
          >
            {uploadBoard && (
              <Scroll size="300" hideTrack visibility="Hover">
                <UploadBoardContent>
                  {Array.from(selectedFiles)
                    .reverse()
                    .map((fileItem, index) => (
                      <UploadCardRenderer
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        isEncrypted={!!fileItem.encInfo}
                        fileItem={fileItem}
                        setMetadata={handleFileMetadata}
                        onRemove={handleRemoveUpload}
                      />
                    ))}
                </UploadBoardContent>
              </Scroll>
            )}
          </UploadBoard>
        )}
        <Overlay
          open={dropZoneVisible}
          backdrop={<OverlayBackdrop />}
          style={{ pointerEvents: 'none' }}
        >
          <OverlayCenter>
            <Dialog variant="Primary">
              <Box
                direction="Column"
                justifyContent="Center"
                alignItems="Center"
                gap="500"
                style={{ padding: toRem(60) }}
              >
                <Icon size="600" src={Icons.File} />
                <Text size="H4" align="Center">
                  {`Drop Files in "${room?.name || 'Room'}"`}
                </Text>
                <Text align="Center">Drag and drop files here or click for selection dialog</Text>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
        {autocompleteQuery?.prefix === AutocompletePrefix.RoomMention && (
          <RoomMentionAutocomplete
            roomId={roomId}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.UserMention && (
          <UserMentionAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Command && (
          <CommandAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <CustomEditor
          editableName="RoomInput"
          editor={editor}
          key={inputKey}
          placeholder="Send a message..."
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
          top={
            replyDraft && (
              <div>
                <Box
                  alignItems="Center"
                  gap="300"
                  style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                >
                  <IconButton
                    onClick={() => setReplyDraft(undefined)}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                  >
                    <Icon src={Icons.Cross} size="50" />
                  </IconButton>
                  <Box direction="Row" gap="200" alignItems="Center">
                    {replyDraft.relation?.rel_type === RelationType.Thread && <ThreadIndicator />}
                    <ReplyLayout
                      userColor={replyUsernameColor}
                      username={
                        <Text size="T300" truncate style={{ fontFamily: replyUsernameFont }}>
                          <b>
                            {getMemberDisplayName(room, replyDraft.userId, nicknames) ??
                              getMxIdLocalPart(replyDraft.userId) ??
                              replyDraft.userId}
                          </b>
                        </Text>
                      }
                    >
                      <Text size="T300" truncate>
                        {replyBodyJSX}
                      </Text>
                    </ReplyLayout>
                  </Box>
                </Box>
              </div>
            )
          }
          before={
            <IconButton
              onClick={() => pickFile('*')}
              variant="SurfaceVariant"
              size="300"
              radii="300"
            >
              <Icon src={Icons.PlusCircle} />
            </IconButton>
          }
          after={
            <>
              <IconButton
                variant="SurfaceVariant"
                size="300"
                radii="300"
                onClick={() => setToolbar(!toolbar)}
              >
                <Icon src={toolbar ? Icons.AlphabetUnderline : Icons.Alphabet} />
              </IconButton>
              <UseStateProvider initial={undefined}>
                {(emojiBoardTab: EmojiBoardTab | undefined, setEmojiBoardTab) => (
                  <PopOut
                    offset={16}
                    alignOffset={-44}
                    position="Top"
                    align="End"
                    anchor={
                      emojiBoardTab === undefined
                        ? undefined
                        : (emojiBtnRef.current?.getBoundingClientRect() ?? undefined)
                    }
                    content={
                      <EmojiBoard
                        tab={emojiBoardTab}
                        onTabChange={setEmojiBoardTab}
                        imagePackRooms={imagePackRooms}
                        returnFocusOnDeactivate={false}
                        onEmojiSelect={handleEmoticonSelect}
                        onCustomEmojiSelect={handleEmoticonSelect}
                        onStickerSelect={handleStickerSelect}
                        requestClose={() => {
                          setEmojiBoardTab((t) => {
                            if (t) {
                              if (!mobileOrTablet()) ReactEditor.focus(editor);
                              return undefined;
                            }
                            return t;
                          });
                        }}
                      />
                    }
                  >
                    {!hideStickerBtn && (
                      <IconButton
                        aria-pressed={emojiBoardTab === EmojiBoardTab.Sticker}
                        onClick={() => setEmojiBoardTab(EmojiBoardTab.Sticker)}
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                      >
                        <Icon
                          src={Icons.Sticker}
                          filled={emojiBoardTab === EmojiBoardTab.Sticker}
                        />
                      </IconButton>
                    )}
                    <IconButton
                      ref={emojiBtnRef}
                      aria-pressed={
                        hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                      }
                      onClick={() => setEmojiBoardTab(EmojiBoardTab.Emoji)}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                    >
                      <Icon
                        src={Icons.Smile}
                        filled={
                          hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                        }
                      />
                    </IconButton>
                  </PopOut>
                )}
              </UseStateProvider>
              <IconButton
                onClick={submit}
                onMouseDown={(e: MouseEvent) => e.preventDefault()}
                variant="SurfaceVariant"
                size="300"
                radii="300"
              >
                <Icon src={Icons.Send} />
              </IconButton>
            </>
          }
          bottom={
            toolbar && (
              <div>
                <Line variant="SurfaceVariant" size="300" />
                <Toolbar />
              </div>
            )
          }
        />
      </div>
    );
  }
);
