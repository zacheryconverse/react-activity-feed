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
console.log('[AttachedActivity] Configured IMAGE_PROCESS_API_URL:', IMAGE_PROCESS_API_URL);

export function AttachedActivity<UT extends DefaultUT = DefaultUT, AT extends DefaultAT = DefaultAT>({
  activity: { object, verb, attachments, actor },
  className,
  style,
}: AttachedActivityProps<UT, AT>) {
  const originalImages = useMemo(() => attachments?.images?.slice(0, 5) ?? [], [attachments?.images]);
  const user = useMemo(() => userOrDefault<UT>(actor), [actor]);

  const [processedUrls, setProcessedUrls] = useState<ProcessedUrlMap>({});

  console.log('[AttachedActivity] Rendering. Original images count:', originalImages.length);

  useEffect(() => {
    console.log(
      '[AttachedActivity] useEffect triggered. Original images stringified:',
      JSON.stringify(originalImages),
      'API URL:',
      IMAGE_PROCESS_API_URL,
    );
    if (originalImages.length === 0 || !IMAGE_PROCESS_API_URL) {
      if (!IMAGE_PROCESS_API_URL && originalImages.length > 0 && process.env.NODE_ENV !== 'production') {
        console.warn('[AttachedActivity] Skipping image processing: API_URL is not configured.');
      }
      if (originalImages.length === 0) {
        console.log('[AttachedActivity] Skipping image processing: No original images.');
      }
      return;
    }

    console.log('[AttachedActivity] Proceeding to fetch processed URLs.');
    const fetchProcessedUrls = async () => {
      console.time('[AttachedActivity] fetchProcessedUrls Execution Time');
      const promises = originalImages.map(async (imageUrl) => {
        console.log(`[AttachedActivity] Preparing to process image: ${imageUrl}`);
        console.time(`[AttachedActivity] Processing Time for ${imageUrl}`);
        const requestBody = {
          imageUrl,
          w: 50,
          h: 50,
          resize: 'crop',
        };
        try {
          console.log(`[AttachedActivity] Fetching from ${IMAGE_PROCESS_API_URL} with body:`, requestBody);
          const response = await fetch(IMAGE_PROCESS_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // TODO: Add Authorization header if your endpoint is protected
              // 'Authorization': `Bearer ${your_auth_token_logic}`
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `[AttachedActivity] Failed to process image ${imageUrl}. Status: ${response.status}, Response: ${errorText}`,
            );
            return { originalUrl: imageUrl, processedUrl: null };
          }

          const data = await response.json();
          console.log(`[AttachedActivity] Successfully processed ${imageUrl}. Response data:`, data);
          return { originalUrl: imageUrl, processedUrl: data.processedUrl };
        } catch (error) {
          console.error(`[AttachedActivity] Network error or JSON parsing error for ${imageUrl}:`, error);
          return { originalUrl: imageUrl, processedUrl: null };
        } finally {
          console.timeEnd(`[AttachedActivity] Processing Time for ${imageUrl}`);
        }
      });

      const results = await Promise.all(promises);
      const finalUrls: ProcessedUrlMap = {};
      results.forEach((result) => {
        if (result) {
          finalUrls[result.originalUrl] = result.processedUrl;
        }
      });
      console.log('[AttachedActivity] Setting processed URLs:', finalUrls);
      setProcessedUrls((prev) => ({ ...prev, ...finalUrls }));
      console.timeEnd('[AttachedActivity] fetchProcessedUrls Execution Time');
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
            // console.log(`[AttachedActivity] Rendering thumbnail for ${image}, displayUrl: ${displayUrl}`)
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
