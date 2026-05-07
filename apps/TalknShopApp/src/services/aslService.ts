/**
 * ASL recognition client — mirrors talknshop-web src/services/aslService.ts.
 * Posts multipart video to ASL service POST /predict.
 */

import { Platform } from 'react-native';
import { LOCAL_IP, SERVICE_URLS } from '@/constants/config';

export interface AslAlternative {
  gloss: string;
  query: string;
  confidence: number;
}

export interface AslRecognitionOutcome {
  transcript: string;
  confidence?: number;
  decision?: string;
  alternatives?: AslAlternative[];
}

function aslBaseUrl(): string {
  const base = SERVICE_URLS.ASL;
  if (__DEV__ && Platform.OS === 'ios' && base.includes('localhost')) {
    return base.replace('localhost', LOCAL_IP);
  }
  return base;
}

/**
 * Upload a local video file (e.g. from expo-image-picker) to /predict.
 */
export async function recognizeAslVideoFromUri(
  uri: string,
  fileName: string,
  mimeType: string
): Promise<AslRecognitionOutcome> {
  const form = new FormData();
  form.append('video', {
    uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(`${aslBaseUrl()}/predict`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (data && typeof data.detail === 'string') {
        detail = data.detail;
      } else if (data && typeof data.detail === 'object') {
        detail = JSON.stringify(data.detail);
      }
    } catch {
      // ignore
    }
    const statusMsg = `${res.status} ${res.statusText}`.trim();
    throw new Error(detail || statusMsg || 'ASL recognition failed');
  }

  const data = (await res.json()) as {
    transcript?: string;
    confidence?: number;
    decision?: string;
    alternatives?: AslAlternative[];
  };
  const transcript = (data && data.transcript) || '';
  if (!transcript.trim()) {
    throw new Error('ASL service returned an empty transcript');
  }

  return {
    transcript: transcript.trim(),
    confidence: data.confidence,
    decision: data.decision,
    alternatives: data.alternatives,
  };
}
