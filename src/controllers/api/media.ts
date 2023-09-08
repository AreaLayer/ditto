import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { z } from '@/deps.ts';
import { fileSchema } from '@/schema.ts';
import { configUploader as uploader } from '@/uploaders/config.ts';
import { parseBody } from '@/utils/web.ts';

const mediaBodySchema = z.object({
  file: fileSchema.refine((file) => !!file.type),
  thumbnail: fileSchema.optional(),
  description: z.string().optional(),
  focus: z.string().optional(),
});

const mediaController: AppController = async (c) => {
  const result = mediaBodySchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json({ error: 'Bad request.', schema: result.error }, 422);
  }

  try {
    const { file, description } = result.data;
    const { cid } = await uploader.upload(file);

    const url = new URL(`/ipfs/${cid}`, Conf.mediaDomain).toString();

    return c.json({
      id: cid,
      type: file.type,
      url,
      preview_url: url,
      remote_url: null,
      description,
      blurhash: null,
    });
  } catch (e) {
    console.error(e);
    return c.json({ error: 'Failed to upload file.' }, 500);
  }
};

export { mediaController };
