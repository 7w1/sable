import { memo, useMemo, useCallback } from 'react';
import { MsgType } from '$types/matrix-sdk';
import { testMatrixTo } from '$plugins/matrix-to';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Opts } from 'linkifyjs';
import { config } from 'folds';
import {
  AudioContent,
  DownloadFile,
  FileContent,
  ImageContent,
  MAudio,
  MBadEncrypted,
  MEmote,
  MFile,
  MImage,
  MLocation,
  MNotice,
  MText,
  MVideo,
  ReadPdfFile,
  ReadTextFile,
  RenderBody,
  ThumbnailContent,
  UnsupportedContent,
  VideoContent,
} from './message';
import { UrlPreviewCard, UrlPreviewHolder } from './url-preview';
import { Image, MediaControl, Video } from './media';
import { ImageViewer } from './image-viewer';
import { PdfViewer } from './Pdf-viewer';
import { TextViewer } from './text-viewer';

type RenderMessageContentProps = {
  displayName: string;
  msgType: string;
  ts: number;
  edited?: boolean;
  getContent: <T>() => T;
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
  outlineAttachment?: boolean;
};

const getMediaType = (url: string) => {
  const cleanUrl = url.toLowerCase();
  if (cleanUrl.match(/\.(mp4|webm|ogg)$/i)) return 'video';
  if (cleanUrl.match(/\.(png|jpg|jpeg|gif|webp)$/i) || cleanUrl.match(/@(jpeg|webp|png|jpg)$/i))
    return 'image';
  return null;
};

const CAPTION_STYLE = { marginTop: config.space.S200 };

function RenderMessageContentInternal({
  displayName,
  msgType,
  ts,
  edited,
  getContent,
  mediaAutoLoad,
  urlPreview,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
  outlineAttachment,
}: RenderMessageContentProps) {
  const content = useMemo(() => getContent<any>(), [getContent]);

  const renderBody = useCallback(
    (props: any) => (
      <RenderBody
        {...props}
        highlightRegex={highlightRegex}
        htmlReactParserOptions={htmlReactParserOptions}
        linkifyOpts={linkifyOpts}
      />
    ),
    [highlightRegex, htmlReactParserOptions, linkifyOpts]
  );

  const renderUrlsPreview = useCallback(
    (urls: string[]) => {
      const filteredUrls = urls.filter((url) => !testMatrixTo(url));
      if (filteredUrls.length === 0) return undefined;

      const analyzed = filteredUrls.map((url) => ({
        url,
        type: getMediaType(url),
      }));

      const mediaLinks = analyzed.filter((item) => item.type !== null);
      const toRender = mediaLinks.length > 0 ? mediaLinks : [analyzed[0]];

      return (
        <UrlPreviewHolder>
          {toRender.map(({ url, type }) => (
            <UrlPreviewCard key={url} url={url} ts={ts} mediaType={type} />
          ))}
        </UrlPreviewHolder>
      );
    },
    [ts]
  );

  const renderCaption = () => {
    if (content.filename && content.filename !== content.body) {
      return (
        <MText
          style={CAPTION_STYLE}
          edited={edited}
          content={content}
          renderBody={renderBody}
          renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
        />
      );
    }
    return null;
  };

  const renderFile = () => (
    <>
      <MFile
        content={content}
        renderFileContent={({ body, mimeType, info, encInfo, url }) => (
          <FileContent
            body={body}
            mimeType={mimeType}
            renderAsPdfFile={() => (
              <ReadPdfFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <PdfViewer {...p} />}
              />
            )}
            renderAsTextFile={() => (
              <ReadTextFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <TextViewer {...p} />}
              />
            )}
          >
            <DownloadFile body={body} mimeType={mimeType} url={url} encInfo={encInfo} info={info} />
          </FileContent>
        )}
        outlined={outlineAttachment}
      />
      {renderCaption()}
    </>
  );

  if (msgType === MsgType.Text) {
    return (
      <MText
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Emote) {
    return (
      <MEmote
        displayName={displayName}
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Notice) {
    return (
      <MNotice
        edited={edited}
        content={content}
        renderBody={renderBody}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Image) {
    return (
      <>
        <MImage
          content={content}
          renderImageContent={(imageProps) => (
            <ImageContent
              {...imageProps}
              autoPlay={mediaAutoLoad}
              renderImage={(p) => <Image {...p} loading="lazy" />}
              renderViewer={(p) => <ImageViewer {...p} />}
            />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.Video) {
    return (
      <>
        <MVideo
          content={content}
          renderAsFile={renderFile}
          renderVideoContent={({ body, info, ...videoProps }) => (
            <VideoContent
              body={body}
              info={info}
              {...videoProps}
              renderThumbnail={
                mediaAutoLoad
                  ? () => (
                      <ThumbnailContent
                        info={info}
                        renderImage={(src) => (
                          <Image alt={body} title={body} src={src} loading="lazy" />
                        )}
                      />
                    )
                  : undefined
              }
              renderVideo={(p) => <Video {...p} />}
            />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.Audio) {
    return (
      <>
        <MAudio
          content={content}
          renderAsFile={renderFile}
          renderAudioContent={(audioProps) => (
            <AudioContent {...audioProps} renderMediaControl={(p) => <MediaControl {...p} />} />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.File) return renderFile();
  if (msgType === MsgType.Location) return <MLocation content={content} />;
  if (msgType === 'm.bad.encrypted') return <MBadEncrypted />;

  return <UnsupportedContent />;
}

export const RenderMessageContent = memo(RenderMessageContentInternal);
