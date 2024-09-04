import { NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppContext, AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoPagination } from '@/interfaces/DittoPagination.ts';
import { getAmount } from '@/utils/bolt11.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated } from '@/utils/api.ts';
import { renderNotification, RenderNotificationOpts } from '@/views/mastodon/notifications.ts';

/** Set of known notification types across backends. */
const notificationTypes = new Set([
  'mention',
  'status',
  'reblog',
  'follow',
  'follow_request',
  'favourite',
  'poll',
  'update',
  'admin.sign_up',
  'admin.report',
  'severed_relationships',
  'pleroma:emoji_reaction',
  'ditto:name_grant',
  'ditto:zap',
]);

const notificationsSchema = z.object({
  account_id: n.id().optional(),
});

const notificationsController: AppController = async (c) => {
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const params = c.get('pagination');

  const types = notificationTypes
    .intersection(new Set(c.req.queries('types[]') ?? notificationTypes))
    .difference(new Set(c.req.queries('exclude_types[]')));

  const { account_id } = notificationsSchema.parse(c.req.query());

  const kinds = new Set<number>();

  if (types.has('mention')) {
    kinds.add(1);
  }
  if (types.has('reblog')) {
    kinds.add(6);
  }
  if (types.has('favourite') || types.has('pleroma:emoji_reaction')) {
    kinds.add(7);
  }

  const filter: NostrFilter = {
    kinds: [...kinds],
    '#p': [pubkey],
    ...params,
  };

  const filters: NostrFilter[] = [filter];

  if (account_id) {
    filter.authors = [account_id];
  }

  if (types.has('ditto:name_grant') && !account_id) {
    filters.push({ kinds: [30360], authors: [Conf.pubkey], '#p': [pubkey], ...params });
  }

  if (types.has('ditto:zap')) {
    filters.push({ kinds: [9735], '#p': [pubkey], ...params });
  }

  return renderNotifications(filters, types, params, c);
};

async function renderNotifications(
  filters: NostrFilter[],
  types: Set<string>,
  params: DittoPagination,
  c: AppContext,
) {
  const store = c.get('store');
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const { signal } = c.req.raw;
  const opts = { signal, limit: params.limit, timeout: Conf.db.timeouts.timelines };

  const zapsRelatedFilter: NostrFilter[] = [];

  const events = await store
    .query(filters, opts)
    .then((events) =>
      events.filter((event) => {
        if (event.kind === 9735) {
          const zappedEventId = event.tags.find(([name]) => name === 'e')?.[1];
          if (zappedEventId) zapsRelatedFilter.push({ kinds: [1], ids: [zappedEventId] });
          const zapSender = event.tags.find(([name]) => name === 'P')?.[1];
          if (zapSender) zapsRelatedFilter.push({ kinds: [0], authors: [zapSender] });
        }

        return event.pubkey !== pubkey;
      })
    )
    .then((events) => hydrateEvents({ events, store, signal }));

  if (!events.length) {
    return c.json([]);
  }

  const zapSendersAndPosts = await store
    .query(zapsRelatedFilter, opts)
    .then((events) => hydrateEvents({ events, store, signal }));

  const notifications = (await Promise.all(events.map((event) => {
    const opts: RenderNotificationOpts = { viewerPubkey: pubkey };
    if (event.kind === 9735) {
      const zapRequestString = event?.tags?.find(([name]) => name === 'description')?.[1];
      const zapRequest = n.json().pipe(n.event()).optional().catch(undefined).parse(zapRequestString);
      // By getting the pubkey from the zap request we guarantee who is the sender
      // some clients don't put the P tag in the zap receipt...
      const zapSender = zapRequest?.pubkey;
      const zappedPost = event.tags.find(([name]) => name === 'e')?.[1];

      const amountSchema = z.coerce.number().int().nonnegative().catch(0);
      // amount in millisats
      const amount = amountSchema.parse(getAmount(event?.tags.find(([name]) => name === 'bolt11')?.[1]));

      opts['zap'] = {
        zapSender: zapSendersAndPosts.find(({ pubkey, kind }) => kind === 0 && pubkey === zapSender) ?? zapSender,
        zappedPost: zapSendersAndPosts.find(({ id }) => id === zappedPost),
        amount,
        message: zapRequest?.content,
      };
    }
    return renderNotification(event, opts);
  })))
    .filter((notification) => notification && types.has(notification.type));

  if (!notifications.length) {
    return c.json([]);
  }

  return paginated(c, events, notifications);
}

export { notificationsController };
