import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { Memorelay } from '@/storages/memorelay.ts';
import { Optimizer } from '@/storages/optimizer.ts';
import { Reqmeister } from '@/storages/reqmeister.ts';
import { SearchStore } from '@/storages/search-store.ts';
import { Time } from '@/utils/time.ts';

/** SQLite database to store events this Ditto server cares about. */
const eventsDB = new EventsDB(db);

/** In-memory data store for cached events. */
const memorelay = new Memorelay({ max: 3000 });

/** Batches requests for single events. */
const reqmeister = new Reqmeister({
  delay: Time.seconds(1),
  timeout: Time.seconds(1),
});

/** Main Ditto storage adapter */
const optimizer = new Optimizer({
  db: eventsDB,
  cache: memorelay,
  client: reqmeister,
});

/** Storage to use for remote search. */
const searchStore = new SearchStore({
  relay: Conf.searchRelay,
  fallback: optimizer,
});

export { eventsDB, memorelay, optimizer, reqmeister, searchStore };
