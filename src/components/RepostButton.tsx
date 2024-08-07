import React from 'react';
import { Activity, EnrichedActivity, UR } from 'getstream';

import { ReactionToggleIcon } from './ReactionToggleIcon';
import { useFeedContext, DefaultAT, DefaultUT, useStreamContext } from '../context';
import { RepostIcon, Color } from './Icons';
import { PropsWithElementAttributes } from '../utils';

export type RepostButtonProps<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
> = PropsWithElementAttributes<{
  /** The activity received for stream for which to show the repost button. This is
   * used to initialize the toggle state and the counter. */
  activity: EnrichedActivity<UT, AT, CT, RT, CRT>;
  /** The feed group part of the feed that the activity should be reposted to,
   * e.g. `user` when posting to your own profile */
  feedGroup?: string;
  /** Repost reaction custom data  */
  repostData?: RT;
  /** onAddReaction supports targetFeeds that you can use to send a notification to the post owner like ["notification:USER_ID"] */
  targetFeeds?: string[];
  /** The user_id part of the feed that the activity should be reposted to, default to current user id */
  userId?: string;
}>;

/**
 * A repost button ready to be embedded as Activity footer
 */
export const RepostButton = <
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
  PT extends UR = UR,
>({
  activity,
  feedGroup = 'user',
  userId,
  repostData,
  targetFeeds = [],
  className,
  style,
}: RepostButtonProps<UT, AT, CT, RT, CRT>) => {
  const feed = useFeedContext<UT, AT, CT, RT, CRT, PT>();
  const app = useStreamContext<UT, AT, CT, RT, CRT, PT>();

  // this to prevent reposting another repost, you can only repost an original activity to avoid nesting
  const originalActivity =
    activity.verb === 'repost' && typeof activity.object === 'object'
      ? (activity.object as EnrichedActivity<UT, AT, CT, RT, CRT>)
      : activity;

  return (
    <ReactionToggleIcon<UT, RT, CRT>
      counts={originalActivity.reaction_counts}
      own_reactions={originalActivity.own_reactions}
      kind="repost"
      onPress={() =>
        feed.onToggleReaction('repost', originalActivity as Activity<AT>, repostData, {
          targetFeeds: [`${feedGroup}:${userId || app.user?.id}`, ...targetFeeds],
        })
      }
      activeIcon={<RepostIcon style={{ color: Color.Active }} />}
      inactiveIcon={<RepostIcon style={{ color: Color.Inactive }} />}
      className={className}
      style={style}
    />
  );
};
