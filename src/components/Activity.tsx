import React from 'react';
import classNames from 'classnames';
import { EnrichedActivity, UR } from 'getstream';

import { ActivityContent as DefaultActivityContent, ActivityContentProps } from './ActivityContent';
import { ActivityHeader as DefaultActivityHeader, ActivityHeaderProps } from './ActivityHeader';
import { Card as DefaultCard, CardProps } from './Card';
import { ActivityFooterProps } from './ActivityFooter';

import {
  smartRender,
  ElementOrComponentOrLiteralType,
  UserOrDefaultReturnType,
  PropsWithElementAttributes,
} from '../utils';
import { DefaultAT, DefaultUT } from '../context/StreamApp';

type WordClickHandler = (word: string) => void;

export type ActivityProps<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
> = PropsWithElementAttributes<{
  /** The activity received for stream for which to show the like button. This is
   * used to initialize the toggle state and the counter. */
  activity: EnrichedActivity<UT, AT, CT, RT, CRT>;
  /** Card component to display.
   * #Card (Component)#
   */
  Card?: ElementOrComponentOrLiteralType<CardProps>;
  /** Content component to display.
   * #ActivityContent (Component)#
   */
  Content?: ElementOrComponentOrLiteralType<ActivityContentProps<UT, AT, CT, RT, CRT>>;
  /** The feed group part of the feed that the activity should be reposted to
   * when pressing the RepostButton, e.g. `user` when posting to your own profile
   * defaults to 'user' feed */
  feedGroup?: string;
  Footer?: ElementOrComponentOrLiteralType<ActivityFooterProps<UT, AT, CT, RT, CRT>>;
  /** Header component to display.
   * #ActivityHeader (Component)#
   */
  Header?: ElementOrComponentOrLiteralType<ActivityHeaderProps<UT, AT>>;
  HeaderRight?: ElementOrComponentOrLiteralType;
  icon?: string;
  /** Handler for any routing you may do on clicks on Hashtags */
  onClickHashtag?: WordClickHandler;
  /** Handler for any routing you may do on clicks on Mentions */
  onClickMention?: WordClickHandler;
  onClickUser?: (user: UserOrDefaultReturnType<UT>) => void;
  /** Handler for image loading errors */
  onImageError?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  /** UI component to render original activity within a repost
   * #Repost (Component)#
   */
  Repost?: ElementOrComponentOrLiteralType<ActivityProps<UT, AT, CT, RT, CRT>>;
  /** The user_id part of the feed that the activity should be reposted to when
   * pressing the RepostButton */
  userId?: string;
}>;

const DefaultRepost = <
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
>({
  Header = DefaultActivityHeader,
  HeaderRight,
  Content = DefaultActivityContent,
  activity,
  icon,
  onClickHashtag,
  onClickMention,
  onClickUser,
}: ActivityProps<UT, AT, CT, RT, CRT>) => (
  <div className="raf-card raf-activity raf-activity-repost">
    {smartRender<ActivityHeaderProps<UT, AT>>(Header, { HeaderRight, icon, activity, onClickUser })}
    {smartRender<ActivityContentProps<UT, AT, CT, RT, CRT>>(Content, { onClickMention, onClickHashtag, activity })}
  </div>
);

export const Activity = <
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
>({
  Header = DefaultActivityHeader,
  HeaderRight,
  Content = DefaultActivityContent,
  Footer,
  Card = DefaultCard,
  activity,
  icon,
  onClickHashtag,
  onClickMention,
  onClickUser,
  onImageError,
  Repost = DefaultRepost,
  userId,
  feedGroup,
  className,
  style,
}: ActivityProps<UT, AT, CT, RT, CRT>) => (
  <div className={classNames('raf-activity', className)} style={style}>
    {smartRender<ActivityHeaderProps<UT, AT>>(Header, { HeaderRight, icon, activity, onClickUser })}
    {smartRender<ActivityContentProps<UT, AT, CT, RT, CRT>>(Content, {
      activity,
      Content,
      Card,
      feedGroup,
      Footer,
      Header,
      HeaderRight,
      icon,
      onClickHashtag,
      onClickMention,
      onClickUser,
      onImageError,
      Repost,
      userId,
    })}
    {smartRender<ActivityFooterProps<UT, AT, CT, RT, CRT>>(Footer, { activity, feedGroup, userId })}
  </div>
);
