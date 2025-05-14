import React, { useMemo, useState, useEffect } from 'react';
import classNames from 'classnames';
import { EnrichedActivity } from 'getstream';
import { Thumbnail } from 'react-file-utils';

import { userOrDefault, PropsWithElementAttributes } from '../utils';
import { DefaultUT, DefaultAT } from '../context/StreamApp';

type ProcessedUrlMap = { [originalUrl: string]: string | null };

export type AttachedActivityProps<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
> = PropsWithElementAttributes<{
  activity: EnrichedActivity<UT, AT>;
}>;

const getApiUrl = (): string | null => {
  if (process.env.API_URL) {
    return `${process.env.API_URL}/images/process`;
  }

  // API_URL is not set
  const errorMessage =
    '[AttachedActivity] ERROR: process.env.API_URL is not defined. Image processing will be skipped.';

  if (process.env.NODE_ENV !== 'production') {
    console.error(errorMessage);
  } else {
    // Production environment, and API_URL is not set. This is a critical configuration error.
    console.error(`PRODUCTION: ${errorMessage}`);
  }
  return null; // Indicate that the URL is not available/configured
};

const IMAGE_PROCESS_API_URL: string | null = getApiUrl();

export function AttachedActivity<UT extends DefaultUT = DefaultUT, AT extends DefaultAT = DefaultAT>({
  activity: { object, verb, attachments, actor },
  className,
  style,
}: AttachedActivityProps<UT, AT>) {
  const originalImages = useMemo(() => attachments?.images?.slice(0, 5) ?? [], [attachments?.images]);
  const user = useMemo(() => userOrDefault<UT>(actor), [actor]);

  const [processedUrls, setProcessedUrls] = useState<ProcessedUrlMap>({});

  useEffect(() => {
    if (originalImages.length === 0 || !IMAGE_PROCESS_API_URL) {
      if (!IMAGE_PROCESS_API_URL && originalImages.length > 0 && process.env.NODE_ENV !== 'production') {
        console.warn(
          '[AttachedActivity] Skipping image processing because API_URL is not configured (see previous error).',
        );
      }
      return;
    }

    const fetchProcessedUrls = async () => {
      const promises = originalImages.map(async (imageUrl) => {
        try {
          const response = await fetch(IMAGE_PROCESS_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              imageUrl,
              w: 50,
              h: 50,
              resize: 'crop',
            }),
          });

          if (!response.ok) {
            console.error(`Failed to process image ${imageUrl}: ${response.statusText}`);
            return { originalUrl: imageUrl, processedUrl: null };
          }

          const data = await response.json();
          return { originalUrl: imageUrl, processedUrl: data.processedUrl };
        } catch (error) {
          console.error(`Error fetching processed URL for ${imageUrl}:`, error);
          return { originalUrl: imageUrl, processedUrl: null };
        }
      });

      const results = await Promise.all(promises);
      const finalUrls: ProcessedUrlMap = {};
      results.forEach((result) => {
        if (result) {
          finalUrls[result.originalUrl] = result.processedUrl;
        }
      });
      setProcessedUrls((prev) => ({ ...prev, ...finalUrls }));
    };

    fetchProcessedUrls();
  }, [JSON.stringify(originalImages), IMAGE_PROCESS_API_URL]);

  if (verb !== 'repost' && verb !== 'post' && verb !== 'comment') return null;

  return (
    <div className={classNames('raf-attached-activity', className)} style={style}>
      {originalImages.length > 0 ? (
        <div className="raf-attached-activity__images">
          {originalImages.map((image, i) => {
            const displayUrl = processedUrls[image] || image;
            return <Thumbnail image={displayUrl} size={50} key={`image-${i}`} />;
          })}
        </div>
      ) : (
        <React.Fragment>
          <p className="raf-attached-activity__author">
            <strong>{user.data.name}</strong>
          </p>
          <p className="raf-attached-activity__content">{object as string}</p>
        </React.Fragment>
      )}
    </div>
  );
}
