import { CashuMint, CashuWallet, getEncodedToken, type Proof } from '@cashu/cashu-ts';
import { type DittoConf } from '@ditto/conf';
import { MiddlewareHandler } from '@hono/hono';
import { HTTPException } from '@hono/hono/http-exception';
import { getPublicKey } from 'nostr-tools';
import { NostrFilter, NostrSigner, NSchema as n, NStore } from '@nostrify/nostrify';
import { SetRequired } from 'type-fest';
import { stringToBytes } from '@scure/base';
import { logi } from '@soapbox/logi';

import { isNostrId } from '@/utils.ts';
import { errorJson } from '@/utils/log.ts';
import { createEvent } from '@/utils/api.ts';
import { z } from 'zod';

/**
 * Swap nutzaps into wallet (create new events) if the user has a wallet, otheriwse, just fallthrough.
 * Errors are only thrown if 'signer' and 'store' middlewares are not set.
 */
export const swapNutzapsMiddleware: MiddlewareHandler<
  { Variables: { signer: SetRequired<NostrSigner, 'nip44'>; store: NStore; conf: DittoConf } }
> = async (c, next) => {
  const { conf } = c.var;
  const signer = c.get('signer');
  const store = c.get('store');

  if (!signer) {
    throw new HTTPException(401, { message: 'No pubkey provided' });
  }

  if (!signer.nip44) {
    throw new HTTPException(401, { message: 'No NIP-44 signer provided' });
  }

  if (!store) {
    throw new HTTPException(401, { message: 'No store provided' });
  }

  const { signal } = c.req.raw;
  const pubkey = await signer.getPublicKey();
  const [wallet] = await store.query([{ authors: [pubkey], kinds: [17375] }], { signal });

  if (wallet) {
    let decryptedContent: string;
    try {
      decryptedContent = await signer.nip44.decrypt(pubkey, wallet.content);
    } catch (e) {
      logi({
        level: 'error',
        ns: 'ditto.api.cashu.wallet.swap',
        id: wallet.id,
        kind: wallet.kind,
        error: errorJson(e),
      });
      return c.json({ error: 'Could not decrypt wallet content.' }, 400);
    }

    let contentTags: string[][];
    try {
      contentTags = JSON.parse(decryptedContent);
    } catch {
      return c.json({ error: 'Could not JSON parse the decrypted wallet content.' }, 400);
    }

    const privkey = contentTags.find(([value]) => value === 'privkey')?.[1];
    if (!privkey || !isNostrId(privkey)) {
      return c.json({ error: 'Wallet does not contain privkey or privkey is not a valid nostr id.' }, 400);
    }
    const p2pk = getPublicKey(stringToBytes('hex', privkey));

    const [nutzapInformation] = await store.query([{ authors: [pubkey], kinds: [10019] }], { signal });
    if (!nutzapInformation) {
      return c.json({ error: 'You need to have a nutzap information event so we can get the mints.' }, 400);
    }

    const nutzapInformationPubkey = nutzapInformation.tags.find(([name]) => name === 'pubkey')?.[1];
    if (!nutzapInformationPubkey || (nutzapInformationPubkey !== p2pk)) {
      return c.json({
        error:
          "You do not have a 'pubkey' tag in your nutzap information event or the one you have does not match the one derivated from the wallet.",
      }, 400);
    }

    const mints = [...new Set(nutzapInformation.tags.filter(([name]) => name === 'mint').map(([_, value]) => value))];
    if (mints.length < 1) {
      return c.json({ error: 'You do not have any mints in your nutzap information event.' }, 400);
    }

    const nutzapsFilter: NostrFilter = { kinds: [9321], '#p': [pubkey], '#u': mints };

    const [nutzapHistory] = await store.query([{ kinds: [7376], authors: [pubkey] }], { signal });
    if (nutzapHistory) {
      nutzapsFilter.since = nutzapHistory.created_at;
    }

    const mintsToProofs: { [key: string]: { proofs: Proof[]; redeemed: string[][] } } = {};

    const nutzaps = await store.query([nutzapsFilter], { signal });

    for (const event of nutzaps) {
      try {
        const mint = event.tags.find(([name]) => name === 'u')?.[1];
        if (!mint) {
          continue;
        }

        const proof = event.tags.find(([name]) => name === 'proof')?.[1];
        if (!proof) {
          continue;
        }

        if (!mintsToProofs[mint]) {
          mintsToProofs[mint] = { proofs: [], redeemed: [] };
        }

        const parsed = n.json().pipe(
          z.object({
            id: z.string(),
            amount: z.number(),
            secret: z.string(),
            C: z.string(),
            dleq: z.object({ s: z.string(), e: z.string(), r: z.string().optional() }).optional(),
            dleqValid: z.boolean().optional(),
          }).array(),
        ).safeParse(proof);

        if (!parsed.success) {
          continue;
        }

        mintsToProofs[mint].proofs = [...mintsToProofs[mint].proofs, ...parsed.data];
        mintsToProofs[mint].redeemed = [
          ...mintsToProofs[mint].redeemed,
          [
            'e', // nutzap event that has been redeemed
            event.id,
            conf.relay,
            'redeemed',
          ],
          ['p', event.pubkey], // pubkey of the author of the 9321 event (nutzap sender)
        ];
      } catch (e) {
        logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', error: errorJson(e) });
      }
    }

    // TODO: throw error if mintsToProofs is an empty object?
    for (const mint of Object.keys(mintsToProofs)) {
      try {
        const token = getEncodedToken({ mint, proofs: mintsToProofs[mint].proofs });

        const cashuWallet = new CashuWallet(new CashuMint(mint));
        const receiveProofs = await cashuWallet.receive(token, { privkey });

        const unspentProofs = await createEvent({
          kind: 7375,
          content: await signer.nip44.encrypt(
            pubkey,
            JSON.stringify({
              mint,
              proofs: receiveProofs,
            }),
          ),
        }, c);

        const amount = receiveProofs.reduce((accumulator, current) => {
          return accumulator + current.amount;
        }, 0);

        await createEvent({
          kind: 7376,
          content: await signer.nip44.encrypt(
            pubkey,
            JSON.stringify([
              ['direction', 'in'],
              ['amount', amount],
              ['e', unspentProofs.id, conf.relay, 'created'],
            ]),
          ),
          tags: mintsToProofs[mint].redeemed,
        }, c);
      } catch (e) {
        logi({ level: 'error', ns: 'ditto.api.cashu.wallet.swap', error: errorJson(e) });
      }
    }
  }

  await next();
};
