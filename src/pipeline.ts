import { insertEvent, isLocallyFollowed } from '@/db/events.ts';
import { addRelays } from '@/db/relays.ts';
import { findUser } from '@/db/users.ts';
import { type Event } from '@/deps.ts';
import { trends } from '@/trends.ts';
import { isRelay, nostrDate } from '@/utils.ts';

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: Event): Promise<void> {
  console.info(`firehose: Event<${event.kind}> ${event.id}`);

  trackHashtags(event);
  trackRelays(event);

  if (await findUser({ pubkey: event.pubkey }) || await isLocallyFollowed(event.pubkey)) {
    insertEvent(event).catch(console.warn);
  }
}

/** Track whenever a hashtag is used, for processing trending tags. */
function trackHashtags(event: Event): void {
  const date = nostrDate(event.created_at);

  const tags = event.tags
    .filter((tag) => tag[0] === 't')
    .map((tag) => tag[1])
    .slice(0, 5);

  if (!tags.length) return;

  try {
    console.info('tracking tags:', tags);
    trends.addTagUsages(event.pubkey, tags, date);
  } catch (_e) {
    // do nothing
  }
}

/** Tracks known relays in the database. */
function trackRelays(event: Event) {
  const relays = new Set<`wss://${string}`>();

  event.tags.forEach((tag) => {
    if (['p', 'e', 'a'].includes(tag[0]) && isRelay(tag[2])) {
      relays.add(tag[2]);
    }
    if (event.kind === 10002 && tag[0] === 'r' && isRelay(tag[1])) {
      relays.add(tag[1]);
    }
  });

  return addRelays([...relays]);
}

export { handleEvent };
