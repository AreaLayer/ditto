import denoJson from 'deno.json' with { type: 'json' };

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

const version = `3.0.0 (compatible; Ditto ${denoJson.version})`;

const features = [
  'exposable_reactions',
  'mastodon_api',
  'mastodon_api_streaming',
  'pleroma_emoji_reactions',
  'quote_posting',
  'v2_suggestions',
];

const instanceV1Controller: AppController = async (c) => {
  const { host, protocol } = Conf.url;
  const meta = await getInstanceMetadata(await Storages.db(), c.req.raw.signal);

  /** Protocol to use for WebSocket URLs, depending on the protocol of the `LOCAL_DOMAIN`. */
  const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';

  return c.json({
    uri: host,
    title: meta.name,
    description: meta.about,
    short_description: meta.tagline,
    registrations: true,
    max_toot_chars: Conf.postCharLimit,
    configuration: {
      media_attachments: {
        image_size_limit: 100000000,
        video_size_limit: 100000000,
      },
      polls: {
        max_characters_per_option: 0,
        max_expiration: 0,
        max_options: 0,
        min_expiration: 0,
      },
      statuses: {
        max_characters: Conf.postCharLimit,
        max_media_attachments: 20,
      },
    },
    pleroma: {
      metadata: {
        features,
      },
    },
    languages: ['en'],
    stats: {
      domain_count: 0,
      status_count: 0,
      user_count: 0,
    },
    urls: {
      streaming_api: `${wsProtocol}//${host}`,
    },
    version,
    email: meta.email,
    nostr: {
      pubkey: Conf.pubkey,
      relay: `${wsProtocol}//${host}/relay`,
    },
    rules: [],
  });
};

const instanceV2Controller: AppController = async (c) => {
  const { host, protocol } = Conf.url;
  const meta = await getInstanceMetadata(await Storages.db(), c.req.raw.signal);

  /** Protocol to use for WebSocket URLs, depending on the protocol of the `LOCAL_DOMAIN`. */
  const wsProtocol = protocol === 'http:' ? 'ws:' : 'wss:';

  return c.json({
    domain: host,
    title: meta.name,
    version,
    source_url: 'https://gitlab.com/soapbox-pub/ditto',
    description: meta.about,
    usage: {
      users: {
        active_month: 0,
      },
    },
    thumbnail: {
      url: meta.picture,
      blurhash: '',
      versions: {
        '@1x': meta.picture,
        '@2x': meta.picture,
      },
    },
    screenshots: meta.screenshots,
    languages: [
      'en',
    ],
    configuration: {
      urls: {
        streaming: `${wsProtocol}//${host}`,
      },
      vapid: {
        public_key: await Conf.vapidPublicKey,
      },
      accounts: {
        max_featured_tags: 10,
        max_pinned_statuses: 5,
      },
      statuses: {
        max_characters: Conf.postCharLimit,
        max_media_attachments: 4,
        characters_reserved_per_url: 23,
      },
      media_attachments: {
        image_size_limit: 16777216,
        image_matrix_limit: 33177600,
        video_size_limit: 103809024,
        video_frame_rate_limit: 120,
        video_matrix_limit: 8294400,
      },
      polls: {
        max_options: 4,
        max_characters_per_option: 50,
        min_expiration: 300,
        max_expiration: 2629746,
      },
      translation: {
        enabled: Boolean(Conf.translationProvider),
      },
    },
    nostr: {
      pubkey: Conf.pubkey,
      relay: `${wsProtocol}//${host}/relay`,
    },
    pleroma: {
      metadata: {
        features,
      },
    },
    registrations: {
      enabled: true,
      approval_required: false,
      message: null,
      url: null,
    },
    rules: [],
  });
};

const instanceDescriptionController: AppController = async (c) => {
  const meta = await getInstanceMetadata(await Storages.db(), c.req.raw.signal);

  return c.json({
    content: meta.about,
    updated_at: new Date((meta.event?.created_at ?? 0) * 1000).toISOString(),
  });
};

export { instanceDescriptionController, instanceV1Controller, instanceV2Controller };
