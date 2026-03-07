/**
 * Message input: large mic (primary), right-aligned icons for attach, note/chat, ASL, send.
 * Supports text, image attach, audio record, and ASL video record/upload.
 */

import React, { useState, useRef, useCallback, KeyboardEvent, useEffect } from 'react';
import { Mic, Video, ImagePlus, Send, X, Square, Upload, MessageSquare } from 'lucide-react';
import { uploadMediaFile } from '../services/mediaService';

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

export const MessageInput: React.FC<MessageInputProps> = ({ onSend, disabled }) => {
  const [message, setMessage] = useState('');
  const [attached, setAttached] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [noteBoxOpen, setNoteBoxOpen] = useState(false);
  const [aslPanelOpen, setAslPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (noteBoxOpen) {
      chatTextareaRef.current?.focus({ preventScroll: true });
    }
  }, [noteBoxOpen]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);


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
        setUploading(true);
        try {
          const { s3_key } = await uploadMediaFile(file, 'video');
          setAttached((prev) => [
            ...prev,
            { media_type: 'video', s3_key, content_type: file.type, size_bytes: file.size },
          ]);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed');
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
  }, [disabled, uploading, isRecordingAudio, isRecordingVideo, stopStream]);

  const stopVideoRecording = useCallback(() => {
    if (!isRecordingVideo || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecordingVideo(false);
  }, [isRecordingVideo]);

  const handleAttachImage = () => {
    if (disabled || uploading) return;
    fileInputRef.current?.click();
  };

  const handleAttachVideo = () => {
    if (disabled || uploading) return;
    videoInputRef.current?.click();
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
        <div className="flex flex-wrap gap-2 items-center">
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
