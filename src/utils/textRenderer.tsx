import React, { useState } from 'react';
import _truncate from 'lodash/truncate';
import * as linkify from 'linkifyjs';
import linkifyMention from 'linkifyjs/plugins/mention';

// 'linkifyjs/plugins/hashtag';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function linkifyHashtag(linkify: any) {
  const TT = linkify.scanner.TOKENS; // Text tokens
  const MultiToken = linkify.parser.TOKENS.Base; // Base Multi token class
  const S_START = linkify.parser.start;
  function HASHTAG(value: unknown) {
    this.v = value;
  }
  linkify.inherits(MultiToken, HASHTAG, { type: 'hashtag', isLink: true });
  const S_HASH = S_START.jump(TT.POUND);
  const S_HASHTAG = new linkify.parser.State(HASHTAG);

  S_HASH.on(TT.DOMAIN, S_HASHTAG);
  S_HASH.on(TT.UNDERSCORE, S_HASHTAG);
  S_HASH.on(TT.TLD, S_HASHTAG);

  // following lines are the diff from original implemention
  // add support for _ in hashtags
  S_HASH.on(TT.LOCALHOST, S_HASHTAG);
  S_HASHTAG.on(TT.UNDERSCORE, S_HASH);
}

linkifyMention(linkify);
linkifyHashtag(linkify);

type ClickCallback = (word: string) => void;
type Word = string | JSX.Element;
type WordArray = Array<Word | Word[] | WordArray>;
type WordArrayArray = Array<WordArray | Word | WordArrayArray>;

type CustomAnchorProps = {
  type: 'mention' | 'hashtag';
  value: string;
  word: string;
  clickCallback?: ClickCallback;
  parentClass?: string;
};

const CustomAnchor = ({ type, word, parentClass, value, clickCallback = () => {} }: CustomAnchorProps) => (
  <React.Fragment>
    {!word.startsWith(value) && word.slice(0, word.indexOf(value))}
    <a onClick={() => clickCallback(value.substring(1))} className={`${parentClass}__${type}`}>
      {value}
    </a>
    {!word.endsWith(value) && word.slice(word.indexOf(value) + value.length)}
  </React.Fragment>
);

const renderWord = (
  word: string,
  key: string,
  parentClass?: string,
  onClickMention?: ClickCallback,
  onClickHashtag?: ClickCallback,
): Word => {
  const [link] = linkify.find(word);
  if (!link) return word;

  const { type, value, href } = link;

  if (onClickMention && type === 'mention') {
    return (
      <CustomAnchor
        key={key}
        type={type}
        value={value}
        word={word}
        clickCallback={onClickMention}
        parentClass={parentClass}
      />
    );
  }

  if (onClickHashtag && type === 'hashtag') {
    return (
      <CustomAnchor
        key={key}
        type={type}
        value={value}
        word={word}
        clickCallback={onClickHashtag}
        parentClass={parentClass}
      />
    );
  }

  if (type === 'email' || type === 'url') {
    return (
      <a
        href={encodeURI(href)}
        className={`${parentClass}__link`}
        target="blank"
        data-testid="renderWord-hyperlink"
        rel="nofollow noreferrer noopener"
        key={key}
      >
        {type === 'email' ? value : _truncate(value.replace(/(http(s?):\/\/)?(www\.)?/, ''), { length: 33 })}
      </a>
    );
  }

  return word;
};

const Expand = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="feather feather-chevron-down"
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const Collapse = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="feather feather-chevron-up"
  >
    <polyline points="18 15 12 9 6 15"></polyline>
  </svg>
);

export const textRenderer = (
  text?: string,
  parentClass?: string,
  onClickMention?: ClickCallback,
  onClickHashtag?: ClickCallback,
) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!text) return <></>;

  const shouldTruncate = text.length > 350;
  const displayedText = shouldTruncate && !isExpanded ? `${text.slice(0, 350)}...` : text;

  const renderedText = displayedText
    .split(/\r\n|\r|\n/) // first break on line
    .map((line, i) =>
      line
        .split(' ') // break for each word
        .map((word, j) => renderWord(word, `item-${i}-${j}`, parentClass, onClickMention, onClickHashtag))
        .reduce<WordArray>((acc, elem) => (acc.length ? [acc, ' ', elem] : [elem]), []),
    )
    .reduce<WordArrayArray>((acc, elem) => (acc.length ? [acc, '\n', elem] : [elem]), []);

  return (
    <>
      {renderedText}
      {shouldTruncate && (
        <span onClick={() => setIsExpanded(!isExpanded)} className="expand-text">
          {isExpanded ? <Collapse /> : <Expand />}
        </span>
      )}
    </>
  );
};
