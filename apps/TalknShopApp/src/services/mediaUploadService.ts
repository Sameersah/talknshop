/**
 * Get presigned upload URL from orchestrator and upload file to S3.
 * Use when the user attaches image/audio/video (before or when they send).
 */

import { SERVICE_URLS, API_ENDPOINTS } from '@/constants/config';

export type MediaType = 'image' | 'audio' | 'video';

export interface GetUploadUrlParams {
  file_name: string;
  content_type: string;
  file_size: number;
  media_type?: MediaType;
}

export interface GetUploadUrlResult {
  upload_url: string;
  s3_key: string;
}

const baseUrl = (): string => SERVICE_URLS.ORCHESTRATOR;

/**
 * Request a presigned URL and S3 key from the orchestrator (which calls media-service).
 */
export async function getUploadUrl(params: GetUploadUrlParams): Promise<GetUploadUrlResult> {
  const url = `${baseUrl()}${API_ENDPOINTS.MEDIA.UPLOAD_URL}`;
  const res = await fetch(url, {
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
    throw new Error(err.detail?.error ?? err.detail ?? `Upload URL failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Upload file to S3 using the presigned URL (PUT).
 */
export async function uploadFileToS3(uri: string, uploadUrl: string, contentType: string): Promise<void> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error(`Upload to S3 failed: ${putRes.status} ${putRes.statusText}`);
  }
}

/**
 * Get upload URL and upload from a file URI (e.g. from ImagePicker or recording).
 * Returns s3_key for use in message.media[].
 */
export async function uploadMediaFile(
  fileUri: string,
  fileName: string,
  contentType: string,
  fileSize: number,
  mediaType: MediaType
): Promise<{ s3_key: string }> {
  const { upload_url, s3_key } = await getUploadUrl({
    file_name: fileName,
    content_type: contentType,
    file_size: fileSize,
    media_type: mediaType,
  });
  await uploadFileToS3(fileUri, upload_url, contentType);
  return { s3_key };
}
