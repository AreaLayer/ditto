import { AppController } from '@/app.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { createEvent } from '@/utils/api.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

/**
 * React to a status.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#put-apiv1pleromastatusesidreactionsemoji
 */
const reactionController: AppController = async (c) => {
  const { relay, user } = c.var;
  const id = c.req.param('id');
  const emoji = c.req.param('emoji');

  if (!/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const [event] = await relay.query([{ kinds: [1, 20], ids: [id], limit: 1 }]);

  if (!event) {
    return c.json({ error: 'Status not found' }, 404);
  }

  await createEvent({
    kind: 7,
    content: emoji,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['e', id], ['p', event.pubkey]],
  }, c);

  await hydrateEvents({ ...c.var, events: [event] });

  const status = await renderStatus(relay, event, { viewerPubkey: await user!.signer.getPublicKey() });

  return c.json(status);
};

/**
 * Delete reactions to a status.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#delete-apiv1pleromastatusesidreactionsemoji
 */
const deleteReactionController: AppController = async (c) => {
  const { relay, user } = c.var;

  const id = c.req.param('id');
  const emoji = c.req.param('emoji');
  const pubkey = await user!.signer.getPublicKey();

  if (!/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const [event] = await relay.query([
    { kinds: [1, 20], ids: [id], limit: 1 },
  ]);

  if (!event) {
    return c.json({ error: 'Status not found' }, 404);
  }

  const events = await relay.query([
    { kinds: [7], authors: [pubkey], '#e': [id] },
  ]);

  const tags = events
    .filter((event) => event.content === emoji)
    .map((event) => ['e', event.id]);

  await createEvent({
    kind: 5,
    content: '',
    created_at: Math.floor(Date.now() / 1000),
    tags,
  }, c);

  const status = renderStatus(relay, event, { viewerPubkey: pubkey });

  return c.json(status);
};

/**
 * Get an object of emoji to account mappings with accounts that reacted to the post.
 * https://docs.pleroma.social/backend/development/API/pleroma_api/#get-apiv1pleromastatusesidreactions
 */
const reactionsController: AppController = async (c) => {
  const { relay, user } = c.var;

  const id = c.req.param('id');
  const pubkey = await user?.signer.getPublicKey();
  const emoji = c.req.param('emoji') as string | undefined;

  if (typeof emoji === 'string' && !/^\p{RGI_Emoji}$/v.test(emoji)) {
    return c.json({ error: 'Invalid emoji' }, 400);
  }

  const events = await relay.query([{ kinds: [7], '#e': [id], limit: 100 }])
    .then((events) => events.filter(({ content }) => /^\p{RGI_Emoji}$/v.test(content)))
    .then((events) => events.filter((event) => !emoji || event.content === emoji))
    .then((events) => hydrateEvents({ ...c.var, events }));

  /** Events grouped by emoji. */
  const byEmoji = events.reduce((acc, event) => {
    const emoji = event.content;
    acc[emoji] = acc[emoji] || [];
    acc[emoji].push(event);
    return acc;
  }, {} as Record<string, DittoEvent[]>);

  const results = await Promise.all(
    Object.entries(byEmoji).map(async ([name, events]) => {
      return {
        name,
        count: events.length,
        me: pubkey && events.some((event) => event.pubkey === pubkey),
        accounts: await Promise.all(
          events.map((event) => event.author ? renderAccount(event.author) : accountFromPubkey(event.pubkey)),
        ),
      };
    }),
  );

  return c.json(results);
};

export { deleteReactionController, reactionController, reactionsController };
