// deno-lint-ignore-file require-await
import { type DittoDatabase, DittoDB } from '@ditto/db';
import { internalSubscriptionsSizeGauge } from '@ditto/metrics';
import { logi } from '@soapbox/logi';

import { Conf } from '@/config.ts';
import { wsUrlSchema } from '@/schema.ts';
import { AdminStore } from '@/storages/AdminStore.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { InternalRelay } from '@/storages/InternalRelay.ts';
import { NPool, NRelay1 } from '@nostrify/nostrify';
import { getRelays } from '@/utils/outbox.ts';
import { seedZapSplits } from '@/utils/zap-split.ts';

export class Storages {
  private static _db: Promise<EventsDB> | undefined;
  private static _database: Promise<DittoDatabase> | undefined;
  private static _admin: Promise<AdminStore> | undefined;
  private static _client: Promise<NPool<NRelay1>> | undefined;
  private static _pubsub: Promise<InternalRelay> | undefined;

  public static async database(): Promise<DittoDatabase> {
    if (!this._database) {
      this._database = (async () => {
        const db = DittoDB.create(Conf.databaseUrl, {
          poolSize: Conf.pg.poolSize,
          debug: Conf.pgliteDebug,
        });
        await DittoDB.migrate(db.kysely);
        return db;
      })();
    }
    return this._database;
  }

  public static async kysely(): Promise<DittoDatabase['kysely']> {
    const { kysely } = await this.database();
    return kysely;
  }

  /** SQL database to store events this Ditto server cares about. */
  public static async db(): Promise<EventsDB> {
    if (!this._db) {
      this._db = (async () => {
        const kysely = await this.kysely();
        const store = new EventsDB({ kysely, pubkey: Conf.pubkey, timeout: Conf.db.timeouts.default });
        await seedZapSplits(store);
        return store;
      })();
    }
    return this._db;
  }

  /** Admin user storage. */
  public static async admin(): Promise<AdminStore> {
    if (!this._admin) {
      this._admin = Promise.resolve(new AdminStore(await this.db()));
    }
    return this._admin;
  }

  /** Internal pubsub relay between controllers and the pipeline. */
  public static async pubsub(): Promise<InternalRelay> {
    if (!this._pubsub) {
      this._pubsub = Promise.resolve(new InternalRelay({ gauge: internalSubscriptionsSizeGauge }));
    }
    return this._pubsub;
  }

  /** Relay pool storage. */
  public static async client(): Promise<NPool<NRelay1>> {
    if (!this._client) {
      this._client = (async () => {
        const db = await this.db();

        const [relayList] = await db.query([
          { kinds: [10002], authors: [Conf.pubkey], limit: 1 },
        ]);

        const tags = relayList?.tags ?? [];

        const activeRelays = tags.reduce((acc, [name, url, marker]) => {
          const valid = wsUrlSchema.safeParse(url).success;

          if (valid && name === 'r' && (!marker || marker === 'write')) {
            acc.push(url);
          }
          return acc;
        }, []);

        logi({
          level: 'info',
          ns: 'ditto.pool',
          msg: `connecting to ${activeRelays.length} relays`,
          relays: activeRelays,
        });

        return new NPool({
          open(url) {
            return new NRelay1(url, {
              // Skip event verification (it's done in the pipeline).
              verifyEvent: () => true,
              log(log) {
                logi(log);
              },
            });
          },
          reqRouter: async (filters) => {
            return new Map(activeRelays.map((relay) => {
              return [relay, filters];
            }));
          },
          eventRouter: async (event) => {
            const relaySet = await getRelays(await Storages.db(), event.pubkey);
            relaySet.delete(Conf.relay);

            const relays = [...relaySet].slice(0, 4);
            return relays;
          },
        });
      })();
    }
    return this._client;
  }
}
