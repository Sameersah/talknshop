/**
 * ASL recognition client for the web app.
 *
 * Calls the ASL service /predict endpoint and returns transcript + optional
 * diagnostics (alternatives, decision) for debugging ambiguous signs.
 */

export interface AslAlternative {
  gloss: string;
  query: string;
  confidence: number;
}

export interface AslRecognizeResponse {
  transcript: string;
  confidence?: number;
  provider?: string;
  processing_time_seconds?: number;
  alternatives?: AslAlternative[];
  decision?: string;
}

/** Outcome passed to chat (transcript) plus optional model diagnostics. */
export interface AslRecognitionOutcome {
  transcript: string;
  confidence?: number;
  decision?: string;
  alternatives?: AslAlternative[];
}

// In dev, call ASL service directly on localhost:8004 unless overridden.
const ASL_API_BASE =
  import.meta.env.VITE_ASL_API_URL || 'http://localhost:8004';

/**
 * Send a video file to the ASL service /predict endpoint.
 * Returns transcript and optional alternatives / decision for debugging.
 */
export async function recognizeAslVideo(file: File): Promise<AslRecognitionOutcome> {
  const form = new FormData();
  form.append('video', file, file.name);

  const res = await fetch(`${ASL_API_BASE}/predict`, {
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
    const msg = detail || statusMsg || 'ASL recognition failed';
    throw new Error(msg);
  }

  const data = (await res.json()) as AslRecognizeResponse;
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
