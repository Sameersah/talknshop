/**
 * Message input: large mic (primary), right-aligned icons for attach, note/chat, ASL, send.
 * Supports text, image attach, audio record, and ASL video record/upload.
 */

import React, { useState, useRef, useCallback, KeyboardEvent, useEffect } from 'react';
import { Mic, Video, ImagePlus, Send, X, Square, Upload, MessageSquare } from 'lucide-react';
import { uploadMediaFile } from '../services/mediaService';
import { recognizeAslVideo, type AslRecognitionOutcome } from '../services/aslService';

function aslDebugHint(outcome: AslRecognitionOutcome): string {
  const alts = outcome.alternatives?.slice(0, 5) ?? [];
  const altStr = alts.map((a) => `${a.gloss} ${(a.confidence * 100).toFixed(0)}%`).join(' · ');
  const dec = outcome.decision ?? '—';
  return altStr ? `${dec}: ${altStr}` : String(dec);
}

function getFollowupChips(outcome: AslRecognitionOutcome): string[] {
  const seed = `${outcome.transcript} ${(outcome.alternatives ?? [])
    .map((a) => `${a.gloss} ${a.query}`)
    .join(' ')}`.toLowerCase();

  if (/(shoe|sneaker|boot|slipper|heel|footwear)/.test(seed)) {
    return [
      'running shoes under $100',
      'casual sneakers under $80',
      'formal black shoes',
      'women size 7',
      'men size 10',
      'nike shoes under $120',
    ];
  }
  if (/(book|novel|textbook|guide)/.test(seed)) {
    return [
      'fiction books under $20',
      'self-help bestsellers',
      'python programming book',
      'kids books age 8-10',
      'exam prep books',
      'hardcover only',
    ];
  }
  if (/(computer|laptop)/.test(seed)) {
    return [
      'laptop under $700',
      'gaming laptop under $1200',
      'lightweight for college',
      '16GB RAM',
      'MacBook alternatives',
      'battery life 10+ hours',
    ];
  }

  return [
    'under $100',
    'best rated',
    'budget option',
    'premium option',
    'popular brands',
    'fast delivery',
  ];
}

export type MediaItem = {
  media_type: 'image' | 'audio' | 'video';
  s3_key: string;
  content_type: string;
  size_bytes: number;
  /** Optional preview URL for images (object URL) */
  previewUrl?: string;
};

interface MessageInputProps {
  onSend: (text: string, media?: MediaItem[]) => void;
  disabled: boolean;
  clarificationQuestion?: string;
}

const ACCEPT_IMAGES = 'image/*';
const ACCEPT_VIDEO = 'video/*';

const RECORDING_MIME = 'audio/webm';
const RECORDING_FILENAME = 'recording.webm';
const VIDEO_MIME = 'video/webm';
const VIDEO_FILENAME = 'asl-video.webm';

function mediaTypeFromFile(file: File): 'image' | 'audio' | 'video' {
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

const ICON_BTN = 'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-violet-600 hover:border-violet-200 transition-colors disabled:opacity-50';

function getClarificationChips(question?: string): string[] {
  const q = (question ?? '').toLowerCase();
  if (!q) return [];

  if (/(color|colour)/.test(q)) {
    return ['Black', 'White', 'Blue', 'No color preference'];
  }
  if (/(budget|price|under|cost)/.test(q)) {
    return ['Under $50', 'Under $100', 'Under $150', 'No strict budget'];
  }
  if (/(size|sized?)/.test(q)) {
    return ['Size 7', 'Size 8', 'Size 9', 'Not sure yet'];
  }
  if (/(brand|make)/.test(q)) {
    return ['Nike', 'Adidas', 'Puma', 'No brand preference'];
  }
  if (/(type|style|kind)/.test(q)) {
    return ['Running', 'Casual', 'Formal', 'No preference'];
  }

  return ['No preference', 'Most popular options', 'Best rated', 'Budget-friendly'];
}

export const MessageInput: React.FC<MessageInputProps> = ({ onSend, disabled, clarificationQuestion }) => {
  const [message, setMessage] = useState('');
  const [attached, setAttached] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [noteBoxOpen, setNoteBoxOpen] = useState(false);
  const [aslPanelOpen, setAslPanelOpen] = useState(false);
  const [aslStatus, setAslStatus] = useState<string | null>(null);
  /** After ASL /predict: let user pick a candidate or type a word (WLASL often misses live "shoes"). */
  const [aslDisambiguation, setAslDisambiguation] = useState<AslRecognitionOutcome | null>(null);
  const [aslManualOverride, setAslManualOverride] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (noteBoxOpen) {
      chatTextareaRef.current?.focus({ preventScroll: true });
    }
  }, [noteBoxOpen]);

  // When assistant asks a follow-up clarification, prioritize quick-reply chips.
  useEffect(() => {
    if (!clarificationQuestion) return;
    setAslPanelOpen(false);
  }, [clarificationQuestion]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoPreviewRef.current) {
      // Clear the preview when the stream stops
      videoPreviewRef.current.srcObject = null;
    }
  }, []);

  const clearAslDisambiguation = useCallback(() => {
    setAslDisambiguation(null);
    setAslManualOverride('');
  }, []);

  /** If model returns several guesses or wasn't sure, let user pick (or type "shoes"). */
  const applyAslOutcome = useCallback(
    (outcome: AslRecognitionOutcome) => {
      const alts = outcome.alternatives ?? [];
      const uncertain = outcome.decision !== 'accepted';
      if (alts.length >= 2 || uncertain) {
        setAslDisambiguation(outcome);
        setAslManualOverride('');
        setAslStatus(
          uncertain
            ? 'Model was unsure — tap the closest word, type one (e.g. shoes), or use its top choice.'
            : 'Tap the word you meant, or type one if it’s not listed.',
        );
        return;
      }
      onSend(outcome.transcript);
      setAslStatus(
        import.meta.env.DEV && alts.length
          ? aslDebugHint(outcome)
          : 'ASL video recognized',
      );
    },
    [onSend],
  );

  const confirmAslPick = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      onSend(t);
      clearAslDisambiguation();
      setAslStatus(`Sent: ${t}`);
    },
    [onSend, clearAslDisambiguation],
  );


  const startAudioRecording = useCallback(async () => {
    if (disabled || uploading || isRecordingAudio || isRecordingVideo) return;
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported(RECORDING_MIME) ? RECORDING_MIME : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], RECORDING_FILENAME, { type: blob.type });
        setUploading(true);
        try {
          const { s3_key } = await uploadMediaFile(file, 'audio');
          setAttached((prev) => [
            ...prev,
            { media_type: 'audio', s3_key, content_type: file.type, size_bytes: file.size },
          ]);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
          setUploading(false);
        }
      };
      recorder.start();
      setIsRecordingAudio(true);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : 'Microphone access denied');
      stopStream();
    }
  }, [disabled, uploading, isRecordingAudio, isRecordingVideo, stopStream]);

  const stopAudioRecording = useCallback(() => {
    if (!isRecordingAudio || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecordingAudio(false);
  }, [isRecordingAudio]);

  const startVideoRecording = useCallback(async () => {
    if (disabled || uploading || isRecordingAudio || isRecordingVideo) return;
    setRecordError(null);
    setAslStatus('Recording ASL video…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported(VIDEO_MIME) ? VIDEO_MIME : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const file = new File([blob], VIDEO_FILENAME, { type: blob.type });
        // Phase 1 ASL flow: send video to ASL service to get transcript,
        // then send transcript as a normal text message (no video attachment).
        setUploading(true);
        setAslStatus('Uploading and recognizing ASL video…');
        try {
          const outcome = await recognizeAslVideo(file);
          applyAslOutcome(outcome);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'ASL recognition failed. Please try again.';
          setUploadError(msg);
          setAslStatus(null);
        } finally {
          setUploading(false);
        }
      };
      recorder.start();
      setIsRecordingVideo(true);
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : 'Camera/mic access denied');
      stopStream();
    }
  }, [disabled, uploading, isRecordingAudio, isRecordingVideo, stopStream, applyAslOutcome]);

  // Attach the active stream to the preview once recording starts and the video element is mounted
  useEffect(() => {
    if (isRecordingVideo && videoPreviewRef.current && streamRef.current) {
      const videoEl = videoPreviewRef.current;
      // @ts-expect-error srcObject is not in the standard DOM typings
      videoEl.srcObject = streamRef.current;
      videoEl.muted = true;
      videoEl
        .play()
        .catch(() => {
          // Autoplay may require interaction; ignore play errors.
        });
    }
  }, [isRecordingVideo]);

  const stopVideoRecording = useCallback(() => {
    if (!isRecordingVideo || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecordingVideo(false);
    // Keep current aslStatus (it will move to "Uploading and recognizing…" in onstop).
  }, [isRecordingVideo]);

  const handleAttachImage = () => {
    if (disabled || uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploadError(null);
    setUploading(true);
    const newMedia: MediaItem[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const mediaType = mediaTypeFromFile(file);
        if (mediaType === 'video') {
          // Treat uploaded video from ASL panel as ASL input: call ASL service directly.
          try {
            setAslStatus('Uploading and recognizing ASL video…');
            const outcome = await recognizeAslVideo(file);
            applyAslOutcome(outcome);
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : 'ASL recognition failed. Please try again.';
            setUploadError(msg);
            setAslStatus(null);
          }
        } else {
          const { s3_key } = await uploadMediaFile(file, mediaType);
          const item: MediaItem = {
            media_type: mediaType,
            s3_key,
            content_type: file.type,
            size_bytes: file.size,
          };
          if (mediaType === 'image') {
            item.previewUrl = URL.createObjectURL(file);
          }
          newMedia.push(item);
        }
      }
      setAttached((prev) => [...prev, ...newMedia]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeAttached = (index: number) => {
    const item = attached[index];
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    setAttached((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    const text = message.trim();
    if ((!text && attached.length === 0) || disabled) return;
    onSend(text, attached.length > 0 ? attached : undefined);
    setMessage('');
    setAttached([]);
  };

  const sendQuickReply = useCallback(
    (text: string) => {
      if (disabled || uploading || !text.trim()) return;
      onSend(text.trim());
      setMessage('');
    },
    [disabled, uploading, onSend],
  );

  const canSend =
    (message.trim().length > 0 || attached.length > 0) && !disabled && !uploading;

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const attachedRef = useRef(attached);
  attachedRef.current = attached;

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      attachedRef.current.forEach((m) => {
        if (m.previewUrl && m.media_type === 'image') URL.revokeObjectURL(m.previewUrl);
      });
    };
  }, []);

  const isRecording = isRecordingAudio || isRecordingVideo;

  const toggleNoteBox = () => {
    setNoteBoxOpen((o) => !o);
    setAslPanelOpen(false);
  };
  const toggleAslPanel = () => {
    setAslPanelOpen((o) => !o);
    setNoteBoxOpen(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Persistent type box: appears above when Add note / Chat is opened; does not move the icon row */}
      {noteBoxOpen && (
        <div className="flex gap-2 items-end">
          <textarea
            ref={chatTextareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={disabled ? 'Connecting...' : 'Type your message…'}
            disabled={disabled}
            rows={2}
            aria-label="Type your message"
            className="flex-1 min-w-0 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent resize-none bg-white text-gray-800 placeholder-gray-400 disabled:bg-gray-100"
            style={{ minHeight: '56px', maxHeight: '120px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = '56px';
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
        </div>
      )}

      {/* ASL panel: record or upload video — appears above when ASL icon is opened */}
      {aslPanelOpen && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={isRecordingVideo ? stopVideoRecording : startVideoRecording}
              disabled={disabled || uploading || isRecordingAudio}
              title={isRecordingVideo ? 'Stop ASL video' : 'Record ASL video'}
              className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                isRecordingVideo
                  ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                  : 'bg-teal-500 text-white hover:bg-teal-600'
              }`}
            >
              {isRecordingVideo ? (
                <Square className="w-5 h-5" fill="currentColor" />
              ) : (
                <Video className="w-5 h-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={disabled || uploading || isRecording}
              className={`${ICON_BTN} hover:text-teal-600`}
              title="Upload ASL video"
            >
              <Upload className="w-5 h-5" />
            </button>
            <span className="text-xs text-gray-500">Record or upload ASL video</span>
            {isRecordingVideo && (
              <video
                ref={videoPreviewRef}
                className="w-32 h-24 rounded-lg border border-gray-200 bg-black object-cover"
                autoPlay
                playsInline
                muted
              />
            )}
          </div>
          {aslStatus && (
            <p className="text-xs text-teal-700">
              {aslStatus}
            </p>
          )}
          {aslDisambiguation && (
            <div
              className="flex flex-col gap-2 mt-1 p-3 rounded-xl border border-teal-200 bg-teal-50/80"
              role="region"
              aria-label="Choose ASL search word"
            >
              <p className="text-xs font-medium text-gray-800">Choose what to search</p>
              <div className="flex flex-wrap gap-2">
                {(aslDisambiguation.alternatives ?? []).slice(0, 8).map((a, i) => (
                  <button
                    key={`${a.gloss}-${i}-${a.query}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => confirmAslPick(a.query)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-teal-300 text-gray-800 hover:bg-teal-100 disabled:opacity-50"
                  >
                    {a.gloss}{' '}
                    <span className="text-gray-500 font-normal">({(a.confidence * 100).toFixed(0)}%)</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={aslManualOverride}
                  onChange={(e) => setAslManualOverride(e.target.value)}
                  placeholder="Not listed? e.g. shoes, sneakers"
                  disabled={disabled}
                  className="flex-1 min-w-[8rem] px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmAslPick(aslManualOverride);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={disabled || !aslManualOverride.trim()}
                  onClick={() => confirmAslPick(aslManualOverride)}
                  className="px-2 py-1.5 text-xs rounded-lg bg-teal-600 text-white disabled:opacity-50"
                >
                  Send typed
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[11px] text-gray-600">Quick picks</p>
                <div className="flex flex-wrap gap-2">
                  {getFollowupChips(aslDisambiguation).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      disabled={disabled}
                      onClick={() => confirmAslPick(chip)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-teal-200 text-gray-700 hover:bg-teal-100 disabled:opacity-50"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => confirmAslPick(aslDisambiguation.transcript)}
                  className="text-xs text-teal-800 underline hover:no-underline"
                >
                  Use model top choice: &quot;{aslDisambiguation.transcript}&quot;
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={clearAslDisambiguation}
                  className="text-xs text-gray-600 underline hover:no-underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clarification quick replies for tap-first flow */}
      {clarificationQuestion && (
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-violet-200 bg-violet-50/70">
          <p className="text-xs font-medium text-gray-800">Quick options</p>
          <div className="flex flex-wrap gap-2">
            {getClarificationChips(clarificationQuestion).map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={disabled || uploading}
                onClick={() => sendQuickReply(chip)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-violet-200 text-gray-800 hover:bg-violet-100 disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Attachments row */}
      {attached.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {attached.map((m, i) => (
            <div
              key={`${m.s3_key}-${i}`}
              className="relative inline-flex items-center gap-1.5 rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden"
            >
              {m.media_type === 'image' && m.previewUrl ? (
                <img src={m.previewUrl} alt="Attached" className="w-12 h-12 object-cover" />
              ) : (
                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 text-gray-500">
                  {m.media_type === 'audio' && <Mic className="w-5 h-5" />}
                  {m.media_type === 'video' && <Video className="w-5 h-5" />}
                </div>
              )}
              <span className="pr-8 pl-1 text-xs text-gray-600">
                {m.media_type === 'audio' ? 'Voice message' : m.media_type === 'image' ? 'Photo' : 'Video'}
              </span>
              <button
                type="button"
                onClick={() => removeAttached(i)}
                className="absolute top-1 right-1 p-1 rounded-full bg-gray-200/90 text-gray-600 hover:bg-gray-300"
                aria-label="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(uploadError || recordError) && (
        <p className="text-sm text-red-600">{uploadError || recordError}</p>
      )}

      {/* Main row: centered mic (normal size) + right-aligned action icons */}
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_IMAGES}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept={ACCEPT_VIDEO}
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Left spacer for centering */}
        <div className="flex-1 min-w-0" />

        {/* Centered mic — normal touch target (56px), primary action */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
            disabled={disabled || uploading || isRecordingVideo}
            title={isRecordingAudio ? 'Stop recording' : 'Tap to speak'}
            className={`rounded-full flex items-center justify-center shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 ${
              isRecordingAudio
                ? 'w-14 h-14 bg-red-500 text-white hover:bg-red-600 animate-pulse'
                : 'w-14 h-14 bg-violet-500 text-white hover:bg-violet-600'
            }`}
            aria-label={isRecordingAudio ? 'Stop recording' : 'Tap to speak to the app'}
          >
            {isRecordingAudio ? (
              <Square className="w-6 h-6" fill="currentColor" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
          </button>
          <span className="text-xs font-medium text-gray-500">Tap to speak</span>
        </div>

        {/* Right: spacer + action icons */}
        <div className="flex-1 min-w-0 flex justify-end">
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleAttachImage}
              disabled={disabled || uploading || isRecording}
              title="Attach image"
              className={`${ICON_BTN}`}
              aria-label="Attach image"
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={toggleNoteBox}
              title={noteBoxOpen ? 'Close note' : 'Add note / type message'}
              className={`${ICON_BTN} ${noteBoxOpen ? 'bg-violet-50 text-violet-600 border-violet-200' : ''}`}
              aria-label={noteBoxOpen ? 'Close note' : 'Add note or type message'}
              aria-pressed={noteBoxOpen}
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={toggleAslPanel}
              title={aslPanelOpen ? 'Close ASL' : 'ASL video'}
              className={`${ICON_BTN} ${aslPanelOpen ? 'bg-teal-50 text-teal-600 border-teal-200' : ''} hover:text-teal-600`}
              aria-label={aslPanelOpen ? 'Close ASL' : 'Record or upload ASL video'}
              aria-pressed={aslPanelOpen}
            >
              <Video className="w-5 h-5" />
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-violet-500 text-white flex items-center justify-center hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Send"
              aria-label="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
