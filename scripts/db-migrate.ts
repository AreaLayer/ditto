import { Storages } from '../packages/ditto/storages.ts';

// This migrates kysely internally.
const kysely = await Storages.kysely();

// Close the connection before exiting.
await kysely.destroy();

Deno.exit();
