/**
 * Type definitions for TalknShop Web App
 */

export enum MessageType {
  MESSAGE = 'message',
  ANSWER = 'answer',
  ERROR = 'error',
  PONG = 'pong'
}

export enum EventType {
  CONNECTED = 'connected',
  PROGRESS = 'progress',
  TOKEN = 'token',
  CLARIFICATION = 'clarification',
  RESULTS = 'results',
  ERROR = 'error',
  DONE = 'done'
}

export enum WorkflowStage {
  INITIAL = 'INITIAL',
  MEDIA_PROCESSING = 'MEDIA_PROCESSING',
  REQUIREMENT_BUILDING = 'REQUIREMENT_BUILDING',
  CLARIFICATION = 'CLARIFICATION',
  SEARCHING = 'SEARCHING',
  RANKING = 'RANKING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface WebSocketMessage {
  type: MessageType;
  session_id: string;
  user_id: string;
  message?: string;
  media_refs?: MediaReference[];
  timestamp?: string;
}

export interface MediaReference {
  media_id: string;
  s3_key: string;
  category: 'IMAGE' | 'AUDIO' | 'VIDEO';
  mime_type: string;
  size_bytes: number;
}

/** Request body for getting a presigned upload URL from orchestrator */
export interface MediaUploadUrlRequest {
  file_name: string;
  content_type: string;
  file_size: number;
  media_type?: 'image' | 'audio' | 'video';
}

/** Response from POST /api/v1/media/upload-url */
export interface MediaUploadUrlResponse {
  upload_url: string;
  s3_key: string;
}

export interface WebSocketEvent {
  type: EventType;
  session_id: string;
  data: {
    message?: string;
    stage?: WorkflowStage;
    token?: string;
    question?: string;
    products?: ProductResult[];
    final_response?: string;
    error?: {
      code?: string;
      message?: string;
      details?: Record<string, any>;
    };
    metadata?: Record<string, any>;
  };
  timestamp: string;
}

export interface ProductResult {
  product_id: string;
  title: string;
  price: number;
  currency: string;
  rating?: number;
  image_url?: string;
  marketplace: string;
  deep_link: string;
  availability?: string;
}

export type AttachedMediaType = 'image' | 'audio' | 'video';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  stage?: WorkflowStage;
  isStreaming?: boolean;
  products?: ProductResult[];
  clarificationQuestion?: string;
  /** When user sent with media (voice, image, ASL video), show indicators in bubble */
  attachedMedia?: { media_type: AttachedMediaType }[];
}

export interface ConnectionStatus {
  connected: boolean;
  error?: string;
  reconnecting?: boolean;
}






