import React, { useMemo } from 'react';
import classNames from 'classnames';
import { EnrichedActivity } from 'getstream';
import { Thumbnail } from 'react-file-utils';

import { userOrDefault, PropsWithElementAttributes } from '../utils';
import { DefaultUT, DefaultAT } from '../context/StreamApp';

export type AttachedActivityProps<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
> = PropsWithElementAttributes<{
  activity: EnrichedActivity<UT, AT>;
}>;

export function AttachedActivity<UT extends DefaultUT = DefaultUT, AT extends DefaultAT = DefaultAT>({
  activity: { object, verb, attachments, actor },
  className,
  style,
}: AttachedActivityProps<UT, AT>) {
  const images = attachments?.images ?? [];
  const user = useMemo(() => userOrDefault<UT>(actor), [actor]);

  if (verb !== 'repost' && verb !== 'post' && verb !== 'comment') return null;

  return (
    <div className={classNames('raf-attached-activity', className)} style={style}>
      {images.length ? (
        <div className="raf-attached-activity__images">
          {images.slice(0, 5).map((image, i) => (
            <Thumbnail image={image} size={50} key={`image-${i}`} />
          ))}
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
