import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('event_zaps')
    .addColumn('receipt_id', 'text', (col) => col.primaryKey())
    .addColumn('target_event_id', 'text', (col) => col.notNull())
    .addColumn('sender_pubkey', 'text', (col) => col.notNull())
    .addColumn('amount_millisats', 'integer', (col) => col.notNull())
    .addColumn('comment', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('idx_event_zaps_id_amount')
    .on('event_zaps')
    .column('amount_millisats')
    .column('target_event_id')
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_event_zaps_id_amount').ifExists().execute();
  await db.schema.dropTable('event_zaps').execute();
}
