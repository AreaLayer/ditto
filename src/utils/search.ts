import { Kysely, sql } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

/** Get pubkeys whose name and NIP-05 is similar to 'q' */
export async function getPubkeysBySearch(
  kysely: Kysely<DittoTables>,
  opts: { q: string; limit: number; offset: number; following: Set<string> },
): Promise<Set<string>> {
  const { q, limit, following, offset } = opts;

  const pubkeys = new Set<string>();

  const query = kysely
    .selectFrom('author_stats')
    .select('pubkey')
    .where('search', sql`%>`, q)
    .orderBy('followers_count desc')
    .limit(limit)
    .offset(offset);

  if (following.size) {
    const authorsQuery = query.where('pubkey', 'in', [...following]);

    for (const { pubkey } of await authorsQuery.execute()) {
      pubkeys.add(pubkey);
    }
  }

  if (pubkeys.size >= limit) {
    return pubkeys;
  }

  for (const { pubkey } of await query.execute()) {
    pubkeys.add(pubkey);
  }

  return pubkeys;
}
