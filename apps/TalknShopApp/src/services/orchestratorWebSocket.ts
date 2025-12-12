import { Platform } from 'react-native';
import { LOCAL_IP, SERVICE_URLS } from '@/constants/config';
import Constants from 'expo-constants';

export type OrchestratorClientMessageType = 'message' | 'answer' | 'pong' | 'disconnect';
export type OrchestratorServerEventType =
  | 'connected'
  | 'progress'
  | 'thinking'
  | 'token'
  | 'clarification'
  | 'results'
  | 'error'
  | 'done'
  | 'ping';

export interface OrchestratorClientMessage {
  type: OrchestratorClientMessageType;
  message?: string;
  media?: Array<{ media_type: 'image' | 'audio' | 'video'; s3_key: string }>;
  session_id?: string;
}

export interface OrchestratorServerEvent {
  type: OrchestratorServerEventType;
  data: any;
  timestamp?: string;
  session_id?: string;
}

export type OrchestratorEventHandler = (event: OrchestratorServerEvent) => void;

const toWebSocketBaseUrl = (httpBaseUrl: string): string => {
  if (httpBaseUrl.startsWith('https://')) return `wss://${httpBaseUrl.slice('https://'.length)}`;
  if (httpBaseUrl.startsWith('http://')) return `ws://${httpBaseUrl.slice('http://'.length)}`;
  // Fallback: assume already host:port
  return httpBaseUrl.startsWith('ws') ? httpBaseUrl : `ws://${httpBaseUrl}`;
};

const getOrchestratorHttpBaseUrl = (): string => {
  // In dev, iOS Simulator can reach localhost, but physical iPhone cannot.
  // For device testing, use Mac IP; for simulator, keep localhost.
  const base = SERVICE_URLS.ORCHESTRATOR;
  const isIosSimulator = Boolean(Constants.platform?.ios?.simulator);
  if (__DEV__ && Platform.OS === 'ios' && !isIosSimulator) return base.replace('localhost', LOCAL_IP);
  return base;
};

export class OrchestratorWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Set<OrchestratorEventHandler> = new Set();

  constructor(params: { sessionId: string; userId: string }) {
    const httpBase = getOrchestratorHttpBaseUrl();
    const wsBase = toWebSocketBaseUrl(httpBase);
    const { sessionId, userId } = params;
    this.url = `${wsBase}/ws/chat?session_id=${encodeURIComponent(sessionId)}&user_id=${encodeURIComponent(userId)}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          resolve();
          return;
        }

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => resolve();

        this.ws.onerror = (event) => {
          // React Native WebSocket error is not very detailed
          reject(new Error(`WebSocket error: ${JSON.stringify(event)}`));
        };

        this.ws.onmessage = (event) => {
          try {
            const parsed: OrchestratorServerEvent = JSON.parse(String(event.data));

            // Auto-handle ping/pong heartbeat
            if (parsed?.type === 'ping') {
              this.send({ type: 'pong' });
              return;
            }

            this.handlers.forEach((h) => h(parsed));
          } catch (e) {
            // Ignore malformed messages but surface to console for debugging
            console.warn('Failed to parse WS message', e);
          }
        };

        this.ws.onclose = () => {
          this.ws = null;
        };
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  disconnect(): void {
    try {
      this.send({ type: 'disconnect' });
    } catch {
      // ignore
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onEvent(handler: OrchestratorEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(message: OrchestratorClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.ws.send(JSON.stringify(message));
  }

  sendUserMessage(text: string): void {
    this.send({ type: 'message', message: text });
  }

  sendClarificationAnswer(text: string): void {
    this.send({ type: 'answer', message: text });
  }
}


