import React, { useMemo } from 'react';
import classNames from 'classnames';
import ReactTextareaAutocomplete, { TriggerType } from '@webscopeio/react-textarea-autocomplete';
import { LoadingIndicator } from 'react-file-utils';
import { BaseEmoji } from 'emoji-mart';
import { Data as EmojiDataSet } from 'emoji-mart';
import EmojiIndex from 'emoji-mart/dist/utils/emoji-index/nimble-emoji-index';
import defaultEmojiData from '../utils/emojiData';
import { PropsWithElementAttributes } from '../utils';

export type TextareaProps = PropsWithElementAttributes<{
  /** Override the default emoji dataset, library has a light set of emojis
   * to show more emojis use your own or emoji-mart sets
   * https://github.com/missive/emoji-mart#datasets
   */
  emojiData?: EmojiDataSet;
  /** A ref that is bound to the textarea element */
  innerRef?: React.MutableRefObject<HTMLTextAreaElement | undefined> | ((el: HTMLTextAreaElement) => void);
  maxLength?: number;
  onChange?: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  /** An extra trigger for ReactTextareaAutocomplete, this can be used to show
   * a menu when typing @xxx or #xxx, in addition to the emoji menu when typing :xxx
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trigger?: any;
  value?: string;
}>;

const emojiTrigger: (emojiData: EmojiDataSet) => TriggerType<BaseEmoji> = (emojiData) => {
  const emojiIndex = new EmojiIndex(emojiData);

  return {
    ':': {
      output: (item) => ({ key: item.id, text: item.native, caretPosition: 'next' }),
      dataProvider: (token: string) => {
        // condition extracted from emoji-mart to circumvent the bug in the emoji-mart package
        if (['-', '-1'].includes(token)) {
          return [emojiIndex.emojis['-1']];
        }
        return (emojiIndex.search(token) || []).slice(0, 10) as BaseEmoji[];
      },
      component: function AutocompleteItem({ entity: { id, native } }) {
        return (
          <div>
            {native} {id}
          </div>
        );
      },
    },
  };
};

export const Textarea = ({
  emojiData = defaultEmojiData,
  innerRef,
  maxLength,
  onChange,
  onPaste,
  placeholder = 'Share your opinion',
  rows = 3,
  trigger = {},
  value,
  className,
  style,
}: TextareaProps) => {
  const emoji = useMemo(() => emojiTrigger(emojiData), []);

  return (
    <ReactTextareaAutocomplete
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loadingComponent={LoadingIndicator as any}
      trigger={{ ...emoji, ...trigger }}
      innerRef={
        innerRef &&
        ((el: HTMLTextAreaElement) => {
          if (typeof innerRef === 'function') {
            innerRef(el);
          } else if (innerRef !== null) {
            innerRef.current = el;
          }
        })
      }
      rows={rows}
      maxLength={maxLength}
      className={classNames('raf-textarea__textarea', className)}
      style={style}
      containerClassName="raf-textarea"
      dropdownClassName="raf-emojisearch"
      listClassName="raf-emojisearch__list"
      itemClassName="raf-emojisearch__item"
      placeholder={placeholder}
      onChange={onChange}
      onSelect={onChange}
      onPaste={onPaste}
      value={value}
    />
  );
};
