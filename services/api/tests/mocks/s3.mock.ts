// ═══════════════════════════════════════════════════════════
// S3 MOCK — AWS SDK S3 client mock for file upload tests
// ═══════════════════════════════════════════════════════════

export const S3Client = jest.fn().mockImplementation(() => ({
  send: jest.fn().mockResolvedValue({
    $metadata: { httpStatusCode: 200 },
    ETag: '"abc123"',
    Location: 'https://mock-s3.test/bucket/file.jpg',
  }),
}));

export const PutObjectCommand = jest.fn().mockImplementation((input) => ({
  input,
  _tag: 'PutObjectCommand',
}));

export const GetObjectCommand = jest.fn().mockImplementation((input) => ({
  input,
  _tag: 'GetObjectCommand',
}));

export const DeleteObjectCommand = jest.fn().mockImplementation((input) => ({
  input,
  _tag: 'DeleteObjectCommand',
}));

// Presigner mock
export const getSignedUrl = jest.fn().mockResolvedValue(
  'https://mock-presigned-url.test/file.jpg?X-Amz-Signature=abc'
);
