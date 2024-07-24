import React, { ReactNode } from 'react';
import { Activity, NewActivity, UR } from 'getstream';
import {
  FilePreviewer,
  FileUpload,
  FileUploadButton,
  ImageDropzone,
  ImagePreviewer,
  ImageUpload,
  ImageUploadButton,
  LoadingIndicator,
} from 'react-file-utils';

import { DefaultAT, DefaultUT, useTranslationContext } from '../../context';
import { ElementOrComponentOrLiteralType, PropsWithElementAttributes, smartRender } from '../../utils';
import { useStatusUpdateForm } from './useStatusUpdateForm';
// import VideoPreviewer from './VideoPreviewer';
// import VideoUploadButton from './VideoUploadButton';
import { Panel, PanelContent, PanelFooter, PanelHeading } from '../Panel';
import { Textarea as DefaultTextarea, TextareaProps } from '../Textarea';
import { Avatar } from '../Avatar';
import { Card } from '../Card';
import { Audio } from '../Audio';
import { Video } from '../Video';
import { EmojiPicker, EmojiPickerProps } from '../EmojiPicker';
import { Button } from '../Button';
import { Title } from '../Title';
import { BookmarkIcon } from '../Icons';

export type StatusUpdateFormProps<AT extends DefaultAT = DefaultAT> = PropsWithElementAttributes<{
  /** The verb that should be used to post the activity, default to "post" */
  activityVerb?: string;
  /** Override Post request */
  doRequest?: (activity: NewActivity<AT>) => Promise<Activity<AT>>;
  /** Override the default emoji dataset, library has a light set of emojis
   * to show more emojis use your own or [emoji-mart sets](https://github.com/missive/emoji-mart#datasets)
   */
  emojiData?: EmojiPickerProps['emojiData'];
  /** Override the default i18n dictionary providing your own translations where necessary */
  emojiI18n?: EmojiPickerProps['i18n'];
  /** The feed group part of the feed that the activity should be posted to, default to "user" */
  feedGroup?: string;
  /** Add extra footer item */
  FooterItem?: ReactNode;
  /** The header to display */
  Header?: ReactNode;
  /** If you want to change something about the activity data that this form
   * sends to stream you can do that with this function. This function gets the
   * activity data that the form would send normally and should return the
   * modified activity data that should be posted instead.
   *
   * For instance, this would add a target field to the activity:
   *
   * ```javascript
   * &lt;StatusUpdateForm
   *   modifyActivityData={(data) => ({...data, target: 'Group:1'})}
   * />
   * ```
   * add igc data
   * */
  modifyActivityData?: (activity: NewActivity<AT>) => NewActivity<AT>;
  /** A callback to run after the activity is posted successfully */
  onSuccess?: (activity: Activity<AT>) => void;
  /** Custom Textarea component implementation */
  Textarea?: ElementOrComponentOrLiteralType<Omit<TextareaProps, 'maxLength' | 'rows'>>;
  /** An extra trigger for ReactTextareaAutocomplete, this can be used to show
   * a menu when typing @xxx or #xxx, in addition to the emoji menu when typing
   * :xxx  */
  trigger?: TextareaProps['trigger'];
  /** The user_id part of the feed that the activity should be posted to  */
  userId?: string;
}>;

export function StatusUpdateForm<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
  PT extends UR = UR,
>({
  feedGroup = 'user',
  activityVerb = 'post',
  modifyActivityData,
  emojiData,
  emojiI18n,
  Header,
  FooterItem,
  Textarea = DefaultTextarea,
  trigger,
  doRequest,
  userId,
  onSuccess,
  style,
  className,
}: StatusUpdateFormProps<AT>) {
  const { t } = useTranslationContext();
  const state = useStatusUpdateForm<UT, AT, CT, RT, CRT, PT>({
    feedGroup,
    activityVerb,
    modifyActivityData,
    doRequest,
    userId,
    onSuccess,
  });

  return (
    <Panel style={style} className={className}>
      <form onSubmit={state.onSubmitForm}>
        <ImageDropzone handleFiles={state.uploadNewFiles}>
          <PanelHeading>{Header ?? <Title>{t('New Post')}</Title>}</PanelHeading>

          <PanelContent>
            <div style={{ display: 'flex' }}>
              {state.userData.profileImage && (
                <div style={{ marginRight: '16px' }}>
                  <Avatar image={state.userData.profileImage} size={50} circle />
                </div>
              )}

              {smartRender(Textarea, {
                emojiData,
                innerRef: state.textInputRef,
                onChange: state.onChange,
                onPaste: state.onPaste,
                placeholder: t('Type your post...'),
                trigger,
                value: state.text,
              })}
            </div>

            {state.isOgScraping && (
              <div className="raf-status-update-form__og-loading">
                <LoadingIndicator /> {t('Getting website data...')}
              </div>
            )}

            {state.activeOg && (
              <div style={{ margin: '8px 0' }}>
                {!state.activeOg.videos && !state.activeOg.audios ? (
                  <Card nolink handleClose={state.dismissOg} {...state.activeOg} />
                ) : (
                  <>
                    {!!state.activeOg.videos && <Video og={state.activeOg} handleClose={state.dismissOg} />}
                    {!!state.activeOg.audios && <Audio og={state.activeOg} handleClose={state.dismissOg} />}
                  </>
                )}
              </div>
            )}

            {state.availableOg && state.availableOg.length > 1 && (
              <ol className="raf-status-update-form__url-list">
                {state.availableOg.map(({ url, title }) => (
                  <li
                    onClick={() => state.setActiveOg(url as string)}
                    key={url}
                    className={`raf-status-update-form__url-list-item${
                      url === state.ogActiveUrl ? ' raf-status-update-form__url-list-item--active' : ''
                    }`}
                  >
                    <BookmarkIcon
                      style={{
                        width: '0.75em',
                        verticalAlign: '-0.125em',
                      }}
                    />{' '}
                    {title !== undefined ? title : url}
                  </li>
                ))}
              </ol>
            )}

            {state.images.order.length > 0 && (
              <ImagePreviewer
                imageUploads={state.images.order.map((id) => state.images.data[id]) as ImageUpload[]}
                handleRemove={state.removeImage}
                handleRetry={(id) => state.uploadImage(id, state.images.data[id])}
                handleFiles={state.uploadNewFiles}
              />
            )}

            {state.files.order.length > 0 && (
              <FilePreviewer
                uploads={state.files.order.map((id) => state.files.data[id]) as FileUpload[]}
                handleRemove={state.removeFile}
                handleRetry={(id) => state.uploadFile(id, state.files.data[id])}
                handleFiles={state.uploadNewFiles}
              />
            )}

            {state.igcs.order.length > 0 && (
              <FilePreviewer
                uploads={state.igcs.order.map((id) => state.igcs.data[id]) as FileUpload[]}
                handleRemove={state.removeIgc}
                handleRetry={(id) => state.uploadIgc(id, state.igcs.data[id])}
                handleFiles={state.uploadNewFiles}
              />
            )}

            {/* {state.videos.order.length > 0 && (
              <VideoPreviewer
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                videoUploads={state.videos.order.map((id) => state.videos.data[id]) as any}
                handleRemove={state.removeVideo}
                handleRetry={(id) => state.uploadVideo(id, state.videos.data[id])}
                handleFiles={state.uploadNewFiles}
              />
            )} */}
          </PanelContent>

          <PanelFooter>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ marginRight: '32px', display: 'inline-block' }}>
                  <ImageUploadButton resetOnChange handleFiles={state.uploadNewFiles} multiple />
                </div>
                <div style={{ marginRight: '32px', display: 'inline-block' }}>
                  <FileUploadButton handleFiles={state.uploadNewFiles} multiple>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" height="30px">
                      <path d="M12 2.5C6.86 2.5 2.5 6.86 2.5 12S6.86 21.5 12 21.5 21.5 17.14 21.5 12 17.14 2.5 12 2.5zm-4 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm7.62 3.8c-.63-.13-1.2-.41-1.7-.82-.11-.1-.23-.19-.35-.29s-.24-.18-.35-.27c-.5-.41-1.07-.69-1.7-.82l-.12.04c-.28.09-.54.21-.78.36-.23.15-.43.34-.6.57-.17.23-.3.49-.4.77-.1.28-.16.6-.2.94l-.03.18c-.04.2-.05.41-.03.62.02.21.07.41.15.6l.08.18c.09.2.21.39.36.57.14.18.31.34.5.47.19.13.41.23.64.3l.23.07c.66.2 1.3.54 1.9 1l.04-.1c.21-.06.41-.15.6-.28.19-.13.36-.29.5-.47.14-.18.26-.38.35-.6l.09-.22c.08-.2.13-.42.14-.64.01-.22-.02-.44-.09-.64-.07-.2-.17-.39-.3-.56-.13-.17-.29-.32-.48-.44-.19-.12-.4-.2-.63-.25-.23-.05-.45-.08-.67-.08l-.1.02c-.8.01-1.58.16-2.34.45-.76.29-1.48.73-2.14 1.31l-.06.06c-.2.19-.37.42-.5.68-.13.26-.22.55-.27.85-.05.3-.07.62-.04.95.03.33.11.65.23.94.12.3.28.57.48.81.2.24.43.45.7.63.27.18.57.32.9.42.33.1.68.15 1.05.16.37.01.74-.04 1.1-.16.36-.12.7-.3 1.02-.53.32-.23.6-.53.85-.87.25-.34.46-.74.62-1.17.16-.43.27-.91.32-1.41.05-.5-.05-1-.2-1.52l-.15-.05zm-1.41 3.18l.09.15.09.15c.09.16.2.31.32.46.12.15.26.28.41.4.15.12.32.21.5.28.18.07.37.11.56.12l.05 0h.01c.64 0 1.27-.14 1.87-.43.6-.29 1.16-.72 1.65-1.27.5-.55.88-1.22 1.14-2l.03-.09c.06-.18.09-.36.09-.55 0-.45-.18-.88-.54-1.27-.36-.39-.85-.71-1.46-1l-.06-.03c-.19-.08-.38-.14-.58-.17-.2-.03-.4-.03-.6-.01l-.01.01-.01.01c-.59.02-1.16.19-1.7.51-.54.32-.98.78-1.31 1.37l-.04.06c-.13.19-.23.41-.29.66l-.01.06zm6-8.5c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1 1 .45 1 1z" />
                    </svg>
                  </FileUploadButton>
                </div>
                {/* <div style={{ marginRight: '32px', display: 'inline-block' }}>
                  <VideoUploadButton handleFiles={state.uploadNewFiles} multiple />
                </div> */}
                <EmojiPicker onSelect={state.onSelectEmoji} emojiData={emojiData} i18n={emojiI18n} />
                {FooterItem}
              </div>

              <Button type="submit" buttonStyle="primary" loading={state.submitting} disabled={!state.canSubmit()}>
                {t('Post')}
              </Button>
            </div>
          </PanelFooter>
        </ImageDropzone>
      </form>
    </Panel>
  );
}
