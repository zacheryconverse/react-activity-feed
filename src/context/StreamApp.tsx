import React, { ReactNode, PropsWithChildren, useContext, useEffect, useState } from 'react';
import StreamAnalytics from 'stream-analytics';
import { connect, UR, StreamClient, StreamUser, ClientOptions, OGAPIResponse, GetFeedOptions } from 'getstream';

import { FeedManager } from './FeedManager';
import { ErrorHandler, handleError } from '../utils/errors';
import { Streami18n } from '../i18n/Streami18n';
import { TranslationContextValue, TranslationProvider } from './TranslationContext';

export type SharedFeedManagers<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
  PT extends UR = UR,
> = Record<string, FeedManager<UT, AT, CT, RT, CRT, PT>>;

type Attachments = {
  files?: Array<{ mimeType: string; name: string; url: string }>;
  images?: string[];
  og?: OGAPIResponse;
};

export type DefaultUT = UR & { name: string; id?: string; profileImage?: string };

export type DefaultAT = UR & { attachments?: Attachments; text?: string };

export type SharedFeed = { feedGroup: string; notify: boolean; options: GetFeedOptions };

export type StreamAppProps<UT extends DefaultUT = DefaultUT> = {
  apiKey: string;
  appId: string;
  token: string;
  analyticsToken?: string;
  baseUrl?: string;
  children?: ReactNode;
  defaultUserData?: UT;
  errorHandler?: ErrorHandler;
  i18nInstance?: Streami18n;
  options?: ClientOptions;
  sharedFeeds?: Array<SharedFeed>;
};

export type StreamContextValue<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
  PT extends UR = UR,
> = {
  analyticsClient: null | StreamAnalytics<UT>;
  client: null | StreamClient<UT, AT, CT, RT, CRT, PT>;
  errorHandler: ErrorHandler;
  sharedFeedManagers: SharedFeedManagers<UT, AT, CT, RT, CRT, PT>;
  baseUrl?: string;
  user?: StreamUser<UT>;
  userData?: UT;
};

export const StreamContext = React.createContext<StreamContextValue>({
  analyticsClient: null,
  client: null,
  errorHandler: handleError,
  sharedFeedManagers: {},
});

export const StreamAppProvider = <
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
  PT extends UR = UR,
>({
  children,
  value,
}: PropsWithChildren<{
  value: StreamContextValue<UT, AT, CT, RT, CRT, PT>;
}>) => <StreamContext.Provider value={value as StreamContextValue}>{children}</StreamContext.Provider>;

export const useStreamContext = <
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
  PT extends UR = UR,
>() => useContext(StreamContext) as StreamContextValue<UT, AT, CT, RT, CRT, PT>;

/**
 * Manages the connection with Stream. Any components that should talk to
 * Stream should be a child of this component.
 */
export function StreamApp<
  UT extends DefaultUT = DefaultUT,
  AT extends DefaultAT = DefaultAT,
  CT extends UR = UR,
  RT extends UR = UR,
  CRT extends UR = UR,
  PT extends UR = UR,
>({
  apiKey,
  appId,
  errorHandler = handleError,
  i18nInstance,
  token,
  analyticsToken,
  children,
  defaultUserData,
  options,
  sharedFeeds = [{ feedGroup: 'notification', notify: true, options: { mark_seen: true } }],
  baseUrl,
}: StreamAppProps<UT>) {
  const [client, setClient] = useState<StreamClient<UT, AT, CT, RT, CRT, PT> | null>(null);
  const [user, setUser] = useState<StreamUser<UT, AT, CT, RT, CRT, PT>>();
  const [analyticsClient, setAnalyticsClient] = useState<StreamAnalytics<UT> | null>(null);
  const [userData, setUserDate] = useState<UT>();
  const [translator, setTranslator] = useState<TranslationContextValue>();
  const [sharedFeedManagers, setSharedFeedManagers] = useState<SharedFeedManagers<UT, AT, CT, RT, CRT, PT>>({});

  useEffect(() => {
    const streami18n =
      i18nInstance && i18nInstance instanceof Streami18n ? i18nInstance : new Streami18n({ language: 'en' });

    streami18n.getTranslators().then(setTranslator);
    streami18n.registerSetLanguageCallback((t) =>
      setTranslator((prevState) => ({ ...(prevState as TranslationContextValue), t })),
    );
  }, [i18nInstance]);

  const getUserInfo = async (user: StreamUser<UT>) => {
    try {
      const { data } = await user.getOrCreate((defaultUserData || { name: 'Unknown' }) as UT);
      setUserDate(data);
    } catch (e) {
      errorHandler(e, 'get-user-info', { userId: user.id });
    }
  };

  useEffect(() => {
    const client = connect<UT, AT, CT, RT, CRT, PT>(apiKey, token, appId, options || {});

    let analyticsClient: StreamAnalytics<UT> | null = null;
    if (analyticsToken) {
      analyticsClient = new StreamAnalytics<UT>({ apiKey, token: analyticsToken });
      analyticsClient.setUser(client.userId as string);
    }

    const feeds: Record<string, FeedManager<UT, AT, CT, RT, CRT, PT>> = {};
    for (const feedProps of sharedFeeds) {
      const manager = new FeedManager<UT, AT, CT, RT, CRT, PT>({
        ...feedProps,
        client,
        analyticsClient,
        errorHandler,
        user,
      });

      feeds[manager.feed().id] = manager;
    }

    setClient(client);
    setUser(client.currentUser as StreamUser<UT, AT, CT, RT, CRT, PT>);
    setAnalyticsClient(analyticsClient);
    setSharedFeedManagers(feeds);

    getUserInfo(client.currentUser as StreamUser<UT>);

    return () => client.fayeClient?.disconnect();
  }, [apiKey, token, appId, analyticsClient]);

  if (!translator?.t) return null;

  return (
    <StreamAppProvider value={{ client, analyticsClient, errorHandler, userData, user, sharedFeedManagers, baseUrl }}>
      <TranslationProvider value={translator}>
        <>{children || 'You are connected to Stream, Throw some components in here!'}</>
      </TranslationProvider>
    </StreamAppProvider>
  );
}
