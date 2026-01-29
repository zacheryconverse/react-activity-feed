import React, { SyntheticEvent, useMemo, useEffect, useState, useCallback } from 'react';
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
}: CardProps) => {
  const sanitizedURL = useMemo(() => sanitizeURL(url), [url]);
  const trimmedURL = useMemo(() => trimURL(sanitizedURL), [sanitizedURL]);

  const [{ image }] = !imageURL && images.length ? images : [{ image: imageURL }];
  const [isImageLoaded, setIsImageLoaded] = useState(image === null);

  useEffect(() => {
    setIsImageLoaded(image === null);
  }, [image]);

  const handleImageLoad = useCallback(() => {
    setIsImageLoaded(true);
  }, []);

  const handleImageError = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      onImageError?.(event);
    },
    [onImageError],
  );

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
        <div className={`raf-card__image ${isImageLoaded ? 'raf-card__image--loaded' : 'raf-card__image--loading'}`}>
          {image === null ? (
            <AvatarIcon preserveAspectRatio="xMinYMin slice" />
          ) : (
            <img
              src={image}
              alt={alt || title || description || ''}
              onLoad={handleImageLoad}
              onError={handleImageError}
              decoding="async"
            />
          )}
        </div>
      )}
      <div className="raf-card__content">
        <div className="raf-card__content-left">
          <p className="raf-card__title">{title}</p>
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
