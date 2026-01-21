import React, { SyntheticEvent, useMemo } from 'react';
import { IconButton } from 'react-file-utils';
import { OGAPIResponse } from 'getstream';

import { sanitizeURL, trimURL, PropsWithElementAttributes } from '../utils';
import { AvatarIcon, CloseIcon } from './Icons';

export type CardProps = PropsWithElementAttributes<
  {
    alt?: string;
    handleClose?: (e: SyntheticEvent) => void;
    image?: string | null;
    nolink?: boolean;
    onImageError?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
    score?: number;
  } & Pick<OGAPIResponse, 'description' | 'images' | 'url' | 'title'>,
  HTMLAnchorElement
>;

export const Card = ({
  alt,
  images = [],
  image: imageURL,
  handleClose,
  description,
  nolink,
  url,
  title,
  className,
  style,
  onImageError,
  score,
}: CardProps) => {
  const sanitizedURL = useMemo(() => sanitizeURL(url), [url]);
  const trimmedURL = useMemo(() => trimURL(sanitizedURL), [sanitizedURL]);

  const [{ image }] = !imageURL && images.length ? images : [{ image: imageURL }];

  return (
    <a
      href={nolink ? undefined : sanitizedURL}
      target="blank"
      rel="nofollow noreferrer noopener"
      className={className ?? `raf-card ${image !== undefined ? 'raf-card--with-image' : ''}`}
      style={style}
    >
      {handleClose && image ? (
        <IconButton onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      ) : null}
      {image !== undefined && (
        <div className="raf-card__image">
          {image === null ? (
            <AvatarIcon preserveAspectRatio="xMinYMin slice" />
          ) : (
            <img src={image} alt={alt || title || description || ''} onError={onImageError} />
          )}
        </div>
      )}
      <div className="raf-card__content">
        <div className="raf-card__content-left">
          <p className="raf-card__title">
            {title}
            {score !== undefined && score !== null && (
              <span style={{ marginLeft: '8px', fontSize: '0.9em', color: '#aaa', fontWeight: 'normal' }}>
                • {Math.floor(score)} pts
              </span>
            )}
          </p>
          <p className="raf-card__url">{trimmedURL}</p>
          <p className="raf-card__description">{description}</p>
        </div>
        {handleClose && image === undefined && (
          <div className="raf-card__content-right">
            <IconButton onClick={handleClose}>
              <CloseIcon />
            </IconButton>
          </div>
        )}
      </div>
    </a>
  );
};
