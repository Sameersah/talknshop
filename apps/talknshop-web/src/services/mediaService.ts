/**
 * Media upload service: get presigned URL from orchestrator, then upload file to S3.
 * Use when the user attaches image/audio/video before sending a message.
 *
 * Flow: (1) POST to orchestrator with metadata only (file_name, content_type, file_size, media_type)
 *       — the actual file is NOT sent to the orchestrator.
 *       (2) PUT the file directly to the presigned S3 URL returned by the orchestrator.
 */

import type { MediaUploadUrlRequest, MediaUploadUrlResponse } from '../types';

// In dev, use relative path so Vite proxy forwards /api to orchestrator (localhost:8000)
const API_BASE =
  import.meta.env.DEV
    ? ''
    : (import.meta.env.VITE_ORCHESTRATOR_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000');

/**
 * Get a presigned URL and S3 key for uploading a file.
 * Sends only metadata (name, type, size) to the orchestrator — never the file contents.
 */
export async function getUploadUrl(params: MediaUploadUrlRequest): Promise<MediaUploadUrlResponse> {
  const res = await fetch(`${API_BASE}/api/v1/media/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: params.file_name,
      content_type: params.content_type,
      file_size: params.file_size,
      media_type: params.media_type ?? 'image',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const msg =
      res.status === 404
        ? 'Upload endpoint not found. Is the orchestrator running on port 8000?'
        : (err.detail?.error ?? err.detail ?? `Upload URL failed: ${res.status}`);
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Upload the file directly to S3 using the presigned URL (PUT).
 * The file bytes go to S3 only, not to the orchestrator.
 */
export async function uploadFileToS3(file: File, uploadUrl: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload to S3 failed: ${res.status} ${res.statusText}`);
  }
}

/** Turn network/CORS errors into a clearer message. */
function normalizeFetchError(e: unknown, step: 'get upload URL' | 'upload to storage'): string {
  const msg = e instanceof Error ? e.message : String(e);
  const isNetworkOrCors =
    msg === 'Failed to fetch' ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('CORS');
  if (isNetworkOrCors) {
    if (step === 'get upload URL') {
      return 'Cannot reach the server. Is the orchestrator running? (e.g. docker-compose up orchestrator-service on port 8000).';
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const hint = origin
      ? ` Add this origin to the bucket CORS AllowedOrigins: ${origin}`
      : ' Ensure the S3 bucket CORS allows PUT from your site’s origin.';
    return `Upload to storage failed (often due to S3 CORS).${hint}`;
  }
  return msg;
}

/**
 * Get upload URL and upload the file in one step. Returns s3_key for use in message.media.
 */
export async function uploadMediaFile(
  file: File,
  mediaType: 'image' | 'audio' | 'video'
): Promise<{ s3_key: string }> {
  let upload_url: string;
  let s3_key: string;
  try {
    const res = await getUploadUrl({
      file_name: file.name,
      content_type: file.type,
      file_size: file.size,
      media_type: mediaType,
    });
    upload_url = res.upload_url;
    s3_key = res.s3_key;
  } catch (e) {
    throw new Error(normalizeFetchError(e, 'get upload URL'));
  }
  try {
    await uploadFileToS3(file, upload_url);
  } catch (e) {
    throw new Error(normalizeFetchError(e, 'upload to storage'));
  }
  return { s3_key };
}
