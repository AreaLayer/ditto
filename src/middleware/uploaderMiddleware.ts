import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DenoUploader } from '@/uploaders/DenoUploader.ts';
import { IPFSUploader } from '@/uploaders/IPFSUploader.ts';
import { NostrBuildUploader } from '@/uploaders/NostrBuildUploader.ts';
import { S3Uploader } from '@/uploaders/S3Uploader.ts';
import { fetchWorker } from '@/workers/fetch.ts';

/** Set an uploader for the user. */
export const uploaderMiddleware: AppMiddleware = async (c, next) => {
  switch (Conf.uploader) {
    case 's3':
      c.set('uploader', new S3Uploader(Conf.s3));
      break;
    case 'ipfs':
      c.set('uploader', new IPFSUploader({ baseUrl: Conf.mediaDomain, apiUrl: Conf.ipfs.apiUrl, fetch: fetchWorker }));
      break;
    case 'local':
      c.set('uploader', new DenoUploader({ baseUrl: Conf.mediaDomain, dir: Conf.uploadsDir }));
      break;
    case 'nostrbuild':
      c.set('uploader', new NostrBuildUploader({ endpoint: Conf.nostrbuildEndpoint, fetch: fetchWorker }));
      break;
  }

  await next();
};
