import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.deleteFrom('nostr_events').where('deleted_at', 'is not', 'null').execute();
  await db.schema.alterTable('nostr_events').dropColumn('deleted_at').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('nostr_events').addColumn('deleted_at', 'integer').execute();
}
