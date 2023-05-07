import { type AppContext, AppController } from '@/app.ts';
import { getAncestors, getDescendants, getEvent } from '@/client.ts';
import { Kind, validator, z } from '@/deps.ts';
import { type Event } from '@/event.ts';
import publish from '@/publisher.ts';
import { signEvent } from '@/sign.ts';
import { toStatus } from '@/transmute.ts';

const createStatusSchema = z.object({
  status: z.string(),
});

const statusController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id, 1);
  if (event) {
    return c.json(await toStatus(event as Event<1>));
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const createStatusController = validator('json', async (value, c: AppContext) => {
  const result = createStatusSchema.safeParse(value);

  if (result.success) {
    const { data } = result;

    const event = await signEvent({
      kind: Kind.Text,
      content: data.status,
      tags: [],
      created_at: Math.floor(new Date().getTime() / 1000),
    }, c);

    publish(event);

    return c.json(await toStatus(event));
  } else {
    return c.json({ error: 'Bad request' }, 400);
  }
});

const contextController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id, 1);

  if (event) {
    const ancestorEvents = await getAncestors(event);
    const descendantEvents = await getDescendants(event.id);

    return c.json({
      ancestors: (await Promise.all((ancestorEvents).map(toStatus))).filter(Boolean),
      descendants: (await Promise.all((descendantEvents).map(toStatus))).filter(Boolean),
    });
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const favouriteController: AppController = async (c) => {
  const id = c.req.param('id');
  const target = await getEvent(id, 1);

  if (target) {
    const event = await signEvent({
      kind: Kind.Reaction,
      content: '+',
      tags: [
        ['e', target.id],
        ['p', target.pubkey],
      ],
      created_at: Math.floor(new Date().getTime() / 1000),
    }, c);

    publish(event);

    const status = await toStatus(target);

    if (status) {
      status.favourited = true;
      status.favourites_count++;
    }

    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

export { contextController, createStatusController, favouriteController, statusController };
