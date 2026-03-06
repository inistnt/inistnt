import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config';
import crypto from 'crypto';

// ──────────────────────────────────────────────────────────
// S3 CLIENT (MinIO dev mein, Cloudflare R2 prod mein)
// ──────────────────────────────────────────────────────────

const s3 = new S3Client({
  endpoint:          config.S3_ENDPOINT,
  region:            config.S3_REGION,
  credentials: {
    accessKeyId:     config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
  forcePathStyle: true, // MinIO ke liye required
});

// ──────────────────────────────────────────────────────────
// UPLOAD TYPES — Kaun sa file kaun se bucket mein jayega
// ──────────────────────────────────────────────────────────

const UPLOAD_CONFIG = {
  // Worker documents
  aadhaar_front:       { bucket: config.S3_BUCKET_DOCUMENTS, maxSizeMb: 5,  allowed: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  aadhaar_back:        { bucket: config.S3_BUCKET_DOCUMENTS, maxSizeMb: 5,  allowed: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  pan_card:            { bucket: config.S3_BUCKET_DOCUMENTS, maxSizeMb: 5,  allowed: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  police_verification: { bucket: config.S3_BUCKET_DOCUMENTS, maxSizeMb: 10, allowed: ['image/jpeg', 'image/png', 'application/pdf'] },
  bank_passbook:       { bucket: config.S3_BUCKET_DOCUMENTS, maxSizeMb: 5,  allowed: ['image/jpeg', 'image/png', 'application/pdf'] },
  certificate:         { bucket: config.S3_BUCKET_DOCUMENTS, maxSizeMb: 5,  allowed: ['image/jpeg', 'image/png', 'application/pdf'] },

  // Profile photos
  profile_photo:       { bucket: config.S3_BUCKET_PHOTOS,    maxSizeMb: 3,  allowed: ['image/jpeg', 'image/png', 'image/webp'] },

  // Booking photos
  booking_before:      { bucket: config.S3_BUCKET_PHOTOS,    maxSizeMb: 5,  allowed: ['image/jpeg', 'image/png', 'image/webp'] },
  booking_after:       { bucket: config.S3_BUCKET_PHOTOS,    maxSizeMb: 5,  allowed: ['image/jpeg', 'image/png', 'image/webp'] },
  booking_evidence:    { bucket: config.S3_BUCKET_PHOTOS,    maxSizeMb: 5,  allowed: ['image/jpeg', 'image/png', 'image/webp'] },

  // Uniform selfie
  uniform_selfie:      { bucket: config.S3_BUCKET_PHOTOS,    maxSizeMb: 3,  allowed: ['image/jpeg', 'image/png', 'image/webp'] },

  // Admin banners
  banner:              { bucket: config.S3_BUCKET_BANNERS,   maxSizeMb: 2,  allowed: ['image/jpeg', 'image/png', 'image/webp'] },
} as const;

export type UploadType = keyof typeof UPLOAD_CONFIG;

// ──────────────────────────────────────────────────────────
// UPLOAD SERVICE
// ──────────────────────────────────────────────────────────

export const uploadService = {

  // ─── GET PRESIGNED URL ───────────────────────────────────
  // Frontend directly S3 pe upload karega — server se nahi guzrega
  getPresignedUrl: async (params: {
    uploadType:  UploadType;
    contentType: string;
    uploaderId:  string;
    uploaderType: 'user' | 'worker' | 'staff';
  }) => {
    const uploadConfig = UPLOAD_CONFIG[params.uploadType];

    // Content type check karo
    if (!uploadConfig.allowed.includes(params.contentType as any)) {
      throw {
        statusCode: 400,
        code: 'INVALID_FILE_TYPE',
        message: `Allowed types: ${uploadConfig.allowed.join(', ')}`,
      };
    }

    // Unique key generate karo
    const ext = params.contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const fileKey = `${params.uploadType}/${params.uploaderType}/${params.uploaderId}/${crypto.randomBytes(16).toString('hex')}.${ext}`;

    // Presigned URL generate karo (10 minute valid)
    const command = new PutObjectCommand({
      Bucket:      uploadConfig.bucket,
      Key:         fileKey,
      ContentType: params.contentType,
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 600 });

    // Final public URL
    const publicUrl = `${config.S3_PUBLIC_URL}/${uploadConfig.bucket}/${fileKey}`;

    return {
      uploadUrl:   presignedUrl,
      publicUrl,
      fileKey,
      expiresIn:   600,
      maxSizeBytes: uploadConfig.maxSizeMb * 1024 * 1024,
    };
  },

  // ─── DELETE FILE ─────────────────────────────────────────
  deleteFile: async (bucket: string, fileKey: string) => {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
    } catch {
      // Silently fail — file already deleted hogi
    }
  },
};
