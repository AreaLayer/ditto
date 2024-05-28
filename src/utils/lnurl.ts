import { LNURL, LNURLDetails } from '@nostrify/nostrify/ln';
import Debug from '@soapbox/stickynotes/debug';

import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';
import { fetchWorker } from '@/workers/fetch.ts';
import { NostrEvent } from '@nostrify/nostrify';

const debug = Debug('ditto:lnurl');

const lnurlCache = new SimpleLRU<string, LNURLDetails>(
  async (lnurl, { signal }) => {
    debug(`Lookup ${lnurl}`);
    try {
      const result = await LNURL.lookup(lnurl, { fetch: fetchWorker, signal });
      debug(`Found: ${lnurl}`);
      return result;
    } catch (e) {
      debug(`Not found: ${lnurl}`);
      throw e;
    }
  },
  { max: 1000, ttl: Time.minutes(30) },
);

/** Get an LNURL from a lud06 or lud16. */
function getLnurl({ lud06, lud16 }: { lud06?: string; lud16?: string }, limit?: number): string | undefined {
  if (lud06) return lud06;
  if (lud16) {
    const [name, host] = lud16.split('@');
    if (name && host) {
      try {
        const url = new URL(`/.well-known/lnurlp/${name}`, `https://${host}`);
        return LNURL.encode(url, limit);
      } catch {
        return;
      }
    }
  }
}

interface CallbackParams {
  amount: number;
  nostr: NostrEvent;
  lnurl: string;
}

async function getInvoice(params: CallbackParams, signal?: AbortSignal): Promise<string> {
  const { amount, lnurl } = params;

  const details = await lnurlCache.fetch(lnurl, { signal });

  if (details.tag !== 'payRequest' || !details.allowsNostr || !details.nostrPubkey) {
    throw new Error('invalid lnurl');
  }

  if (amount > details.maxSendable || amount < details.minSendable) {
    throw new Error('amount out of range');
  }

  const { pr } = await LNURL.callback(
    details.callback,
    params,
    { fetch: fetchWorker, signal },
  );

  return pr;
}

export { getInvoice, getLnurl, lnurlCache };
