import { NostrEvent, NostrSigner, NStore } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';
import { type Context, Env as HonoEnv, type Handler, Hono, Input as HonoInput, type MiddlewareHandler } from 'hono';
import { cors, logger, serveStatic } from 'hono/middleware';

import { Conf } from '@/config.ts';
import { startFirehose } from '@/firehose.ts';
import { Time } from '@/utils.ts';

import { actorController } from '@/controllers/activitypub/actor.ts';
import {
  accountController,
  accountLookupController,
  accountSearchController,
  accountStatusesController,
  createAccountController,
  favouritesController,
  followController,
  followersController,
  followingController,
  muteController,
  relationshipsController,
  unfollowController,
  unmuteController,
  updateCredentialsController,
  verifyCredentialsController,
} from '@/controllers/api/accounts.ts';
import { adminAccountAction, adminAccountsController } from '@/controllers/api/admin.ts';
import { appCredentialsController, createAppController } from '@/controllers/api/apps.ts';
import { blocksController } from '@/controllers/api/blocks.ts';
import { bookmarksController } from '@/controllers/api/bookmarks.ts';
import { adminRelaysController, adminSetRelaysController } from '@/controllers/api/ditto.ts';
import { emptyArrayController, emptyObjectController, notImplementedController } from '@/controllers/api/fallback.ts';
import { instanceController } from '@/controllers/api/instance.ts';
import { markersController, updateMarkersController } from '@/controllers/api/markers.ts';
import { mediaController } from '@/controllers/api/media.ts';
import { mutesController } from '@/controllers/api/mutes.ts';
import { notificationsController } from '@/controllers/api/notifications.ts';
import { createTokenController, oauthAuthorizeController, oauthController } from '@/controllers/api/oauth.ts';
import {
  configController,
  frontendConfigController,
  pleromaAdminDeleteStatusController,
  updateConfigController,
} from '@/controllers/api/pleroma.ts';
import { preferencesController } from '@/controllers/api/preferences.ts';
import { relayController } from '@/controllers/nostr/relay.ts';
import {
  adminReportController,
  adminReportResolveController,
  adminReportsController,
  reportController,
} from '@/controllers/api/reports.ts';
import { searchController } from '@/controllers/api/search.ts';
import {
  bookmarkController,
  contextController,
  createStatusController,
  deleteStatusController,
  favouriteController,
  favouritedByController,
  pinController,
  rebloggedByController,
  reblogStatusController,
  statusController,
  unbookmarkController,
  unpinController,
  unreblogStatusController,
  zapController,
} from '@/controllers/api/statuses.ts';
import { streamingController } from '@/controllers/api/streaming.ts';
import { suggestionsV1Controller, suggestionsV2Controller } from '@/controllers/api/suggestions.ts';
import {
  hashtagTimelineController,
  homeTimelineController,
  publicTimelineController,
} from '@/controllers/api/timelines.ts';
import { trendingTagsController } from '@/controllers/api/trends.ts';
import { indexController } from '@/controllers/site.ts';
import { hostMetaController } from '@/controllers/well-known/host-meta.ts';
import { nodeInfoController, nodeInfoSchemaController } from '@/controllers/well-known/nodeinfo.ts';
import { nostrController } from '@/controllers/well-known/nostr.ts';
import { webfingerController } from '@/controllers/well-known/webfinger.ts';
import { DittoUploader } from '@/interfaces/DittoUploader.ts';
import { auth98Middleware, requireProof, requireRole } from '@/middleware/auth98Middleware.ts';
import { cacheMiddleware } from '@/middleware/cacheMiddleware.ts';
import { cspMiddleware } from '@/middleware/cspMiddleware.ts';
import { requireSigner } from '@/middleware/requireSigner.ts';
import { signerMiddleware } from '@/middleware/signerMiddleware.ts';
import { storeMiddleware } from '@/middleware/storeMiddleware.ts';
import { blockController } from '@/controllers/api/accounts.ts';
import { unblockController } from '@/controllers/api/accounts.ts';
import { uploaderMiddleware } from '@/middleware/uploaderMiddleware.ts';

interface AppEnv extends HonoEnv {
  Variables: {
    /** Signer to get the logged-in user's pubkey, relays, and to sign events, or `undefined` if the user isn't logged in. */
    signer?: NostrSigner;
    /** Uploader for the user to upload files. */
    uploader?: DittoUploader;
    /** NIP-98 signed event proving the pubkey is owned by the user. */
    proof?: NostrEvent;
    /** Store */
    store: NStore;
  };
}

type AppContext = Context<AppEnv>;
type AppMiddleware = MiddlewareHandler<AppEnv>;
type AppController = Handler<AppEnv, any, HonoInput, Response | Promise<Response>>;

const app = new Hono<AppEnv>();

const debug = Debug('ditto:http');

if (Conf.firehoseEnabled) {
  startFirehose();
}

app.use('/api/*', logger(debug));
app.use('/relay/*', logger(debug));
app.use('/.well-known/*', logger(debug));
app.use('/users/*', logger(debug));
app.use('/nodeinfo/*', logger(debug));
app.use('/oauth/*', logger(debug));

app.get('/api/v1/streaming', streamingController);
app.get('/api/v1/streaming/', streamingController);
app.get('/relay', relayController);

app.use(
  '*',
  cspMiddleware(),
  cors({ origin: '*', exposeHeaders: ['link'] }),
  signerMiddleware,
  uploaderMiddleware,
  auth98Middleware(),
  storeMiddleware,
);

app.get('/.well-known/webfinger', webfingerController);
app.get('/.well-known/host-meta', hostMetaController);
app.get('/.well-known/nodeinfo', nodeInfoController);
app.get('/.well-known/nostr.json', nostrController);

app.get('/users/:username', actorController);

app.get('/nodeinfo/:version', nodeInfoSchemaController);

app.get('/api/v1/instance', cacheMiddleware({ cacheName: 'web', expires: Time.minutes(5) }), instanceController);

app.get('/api/v1/apps/verify_credentials', appCredentialsController);
app.post('/api/v1/apps', createAppController);

app.post('/oauth/token', createTokenController);
app.post('/oauth/revoke', emptyObjectController);
app.post('/oauth/authorize', oauthAuthorizeController);
app.get('/oauth/authorize', oauthController);

app.post('/api/v1/accounts', requireProof({ pow: 20 }), createAccountController);
app.get('/api/v1/accounts/verify_credentials', requireSigner, verifyCredentialsController);
app.patch('/api/v1/accounts/update_credentials', requireSigner, updateCredentialsController);
app.get('/api/v1/accounts/search', accountSearchController);
app.get('/api/v1/accounts/lookup', accountLookupController);
app.get('/api/v1/accounts/relationships', requireSigner, relationshipsController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/block', requireSigner, blockController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unblock', requireSigner, unblockController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/mute', requireSigner, muteController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unmute', requireSigner, unmuteController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/follow', requireSigner, followController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unfollow', requireSigner, unfollowController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/followers', followersController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/following', followingController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/statuses', accountStatusesController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}', accountController);

app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/favourited_by', favouritedByController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/reblogged_by', rebloggedByController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/context', contextController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}', statusController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/favourite', requireSigner, favouriteController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/bookmark', requireSigner, bookmarkController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/unbookmark', requireSigner, unbookmarkController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/pin', requireSigner, pinController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/unpin', requireSigner, unpinController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/zap', requireSigner, zapController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/reblog', requireSigner, reblogStatusController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/unreblog', requireSigner, unreblogStatusController);
app.post('/api/v1/statuses', requireSigner, createStatusController);
app.delete('/api/v1/statuses/:id{[0-9a-f]{64}}', requireSigner, deleteStatusController);

app.post('/api/v1/media', mediaController);
app.post('/api/v2/media', mediaController);

app.get('/api/v1/timelines/home', requireSigner, homeTimelineController);
app.get('/api/v1/timelines/public', publicTimelineController);
app.get('/api/v1/timelines/tag/:hashtag', hashtagTimelineController);

app.get('/api/v1/preferences', preferencesController);
app.get('/api/v1/search', searchController);
app.get('/api/v2/search', searchController);

app.get('/api/pleroma/frontend_configurations', frontendConfigController);

app.get(
  '/api/v1/trends/tags',
  cacheMiddleware({ cacheName: 'web', expires: Time.minutes(15) }),
  trendingTagsController,
);
app.get('/api/v1/trends', cacheMiddleware({ cacheName: 'web', expires: Time.minutes(15) }), trendingTagsController);

app.get('/api/v1/suggestions', suggestionsV1Controller);
app.get('/api/v2/suggestions', suggestionsV2Controller);

app.get('/api/v1/notifications', requireSigner, notificationsController);
app.get('/api/v1/favourites', requireSigner, favouritesController);
app.get('/api/v1/bookmarks', requireSigner, bookmarksController);
app.get('/api/v1/blocks', requireSigner, blocksController);
app.get('/api/v1/mutes', requireSigner, mutesController);

app.get('/api/v1/markers', requireProof(), markersController);
app.post('/api/v1/markers', requireProof(), updateMarkersController);

app.get('/api/v1/admin/accounts', requireRole('admin'), adminAccountsController);
app.get('/api/v1/pleroma/admin/config', requireRole('admin'), configController);
app.post('/api/v1/pleroma/admin/config', requireRole('admin'), updateConfigController);
app.delete('/api/v1/pleroma/admin/statuses/:id', requireRole('admin'), pleromaAdminDeleteStatusController);

app.get('/api/v1/admin/ditto/relays', requireRole('admin'), adminRelaysController);
app.put('/api/v1/admin/ditto/relays', requireRole('admin'), adminSetRelaysController);

app.post('/api/v1/reports', requireSigner, reportController);
app.get('/api/v1/admin/reports', requireSigner, requireRole('admin'), adminReportsController);
app.get('/api/v1/admin/reports/:id{[0-9a-f]{64}}', requireSigner, requireRole('admin'), adminReportController);
app.post(
  '/api/v1/admin/reports/:id{[0-9a-f]{64}}/resolve',
  requireSigner,
  requireRole('admin'),
  adminReportResolveController,
);

app.post('/api/v1/admin/accounts/:id{[0-9a-f]{64}}/action', requireSigner, requireRole('admin'), adminAccountAction);

// Not (yet) implemented.
app.get('/api/v1/custom_emojis', emptyArrayController);
app.get('/api/v1/filters', emptyArrayController);
app.get('/api/v1/domain_blocks', emptyArrayController);
app.get('/api/v1/conversations', emptyArrayController);
app.get('/api/v1/lists', emptyArrayController);

app.use('/api/*', notImplementedController);

app.get('*', serveStatic({ root: './public/' }));
app.get('*', serveStatic({ root: './static/' }));
app.get('*', serveStatic({ path: './public/index.html' }));

app.get('/', indexController);

export default app;

export type { AppContext, AppController, AppMiddleware };
