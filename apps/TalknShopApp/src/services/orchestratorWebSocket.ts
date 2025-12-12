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

const buildHttpBaseCandidates = (): string[] => {
  const base = SERVICE_URLS.ORCHESTRATOR;
  const candidates = new Set<string>();

  candidates.add(base);

  // Some environments behave differently for "localhost" resolution.
  // iOS Simulator usually supports localhost, but if anything is off, 127.0.0.1 can help.
  if (base.includes('localhost')) {
    candidates.add(base.replace('localhost', '127.0.0.1'));
  }

  // For physical iOS devices, localhost won't work; LOCAL_IP is required.
  // Simulator detection can be flaky in Expo Go, so include LOCAL_IP as a fallback.
  if (__DEV__ && Platform.OS === 'ios' && base.includes('localhost') && LOCAL_IP) {
    candidates.add(base.replace('localhost', LOCAL_IP));
  }

  return Array.from(candidates);
};

export class OrchestratorWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private urlCandidates: string[];
  private handlers: Set<OrchestratorEventHandler> = new Set();

  constructor(params: { sessionId: string; userId: string }) {
    const { sessionId, userId } = params;
    const httpBases = buildHttpBaseCandidates();
    this.urlCandidates = httpBases.map((httpBase) => {
      const wsBase = toWebSocketBaseUrl(httpBase);
      return `${wsBase}/ws/chat?session_id=${encodeURIComponent(sessionId)}&user_id=${encodeURIComponent(userId)}`;
    });
    this.url = this.urlCandidates[0];
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          resolve();
          return;
        }
        const tryConnect = async () => {
          const timeoutMs = 2500;

          for (const candidateUrl of this.urlCandidates) {
            try {
              await this.connectOnce(candidateUrl, timeoutMs);
              this.url = candidateUrl;
              resolve();
              return;
            } catch (e) {
              // Try next candidate
              console.warn('WS connect attempt failed', candidateUrl, e);
            }
          }

          reject(new Error(`WebSocket error: failed to connect to any candidate URL`));
        };

        void tryConnect();
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  private connectOnce(url: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error(`Timeout connecting to ${url}`));
      }, timeoutMs);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        // Replace existing ws
        if (this.ws) {
          try {
            this.ws.close();
          } catch {
            // ignore
          }
        }
        this.ws = ws;

        ws.onmessage = (event) => {
          try {
            const parsed: OrchestratorServerEvent = JSON.parse(String(event.data));

            // Auto-handle ping/pong heartbeat
            if (parsed?.type === 'ping') {
              this.send({ type: 'pong' });
              return;
            }

            this.handlers.forEach((h) => h(parsed));
          } catch (e) {
            console.warn('Failed to parse WS message', e);
          }
        };

        ws.onclose = () => {
          if (this.ws === ws) this.ws = null;
        };

        ws.onerror = () => {
          // errors after connection will surface as disconnects; leave handling to caller
        };

        resolve();
      };

      ws.onerror = (event) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error(`WebSocket error: ${JSON.stringify(event)}`));
      };
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


