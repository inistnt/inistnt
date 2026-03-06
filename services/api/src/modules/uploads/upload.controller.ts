import type { FastifyRequest, FastifyReply } from 'fastify';
import { uploadService, type UploadType } from './upload.service';

export async function getPresignedUrl(req: FastifyRequest, rep: FastifyReply) {
  const { uploadType, contentType } = req.body as { uploadType: UploadType; contentType: string };

  const result = await uploadService.getPresignedUrl({
    uploadType,
    contentType,
    uploaderId:   req.currentUser.id,
    uploaderType: req.currentUser.userType as any,
  });

  return rep.send({ success: true, data: result });
}
