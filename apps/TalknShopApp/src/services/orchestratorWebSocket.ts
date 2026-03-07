import { Platform } from 'react-native';
import { LOCAL_IP, SERVICE_URLS } from '@/constants/config';
import Constants from 'expo-constants';

export type OrchestratorClientMessageType = 'message' | 'answer' | 'ping' | 'pong' | 'disconnect';
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

export type MediaItemForSend = {
  media_type: 'image' | 'audio' | 'video';
  s3_key: string;
  content_type?: string;
  size_bytes?: number;
  uploaded_at?: string;
};

export interface OrchestratorClientMessage {
  type: OrchestratorClientMessageType;
  message?: string;
  media?: MediaItemForSend[];
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
  const with127 = base.includes('localhost') ? base.replace('localhost', '127.0.0.1') : '';
  const withLocalIp =
    __DEV__ && Platform.OS === 'ios' && base.includes('localhost') && LOCAL_IP
      ? base.replace('localhost', LOCAL_IP)
      : '';

  // On physical iOS device, localhost is the device; try Mac's IP first so we connect in one try.
  const order =
    withLocalIp && Platform.OS === 'ios'
      ? [withLocalIp, base, with127].filter(Boolean)
      : [base, with127, withLocalIp].filter(Boolean);
  return [...new Set(order)];
};

const PING_INTERVAL_MS = 25000;
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

export class OrchestratorWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private urlCandidates: string[];
  private handlers: Set<OrchestratorEventHandler> = new Set();
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

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

          const hint =
            Platform.OS === 'ios' && LOCAL_IP
              ? ` Start the orchestrator on your Mac (e.g. docker-compose up orchestrator-service) and ensure it listens on 0.0.0.0:8000. On a physical device, set LOCAL_IP in config to your Mac's IP (${LOCAL_IP}).`
              : ' Start the orchestrator (e.g. docker-compose up orchestrator-service) and ensure it is running on port 8000.';
          reject(
            new Error(`Cannot connect to orchestrator.${hint}`)
          );
        };

        void tryConnect();
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  private connectOnce(url: string, timeoutMs: number): Promise<void> {
    const self = this;
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
        if (self.ws) {
          try {
            self.ws.close();
          } catch {
            // ignore
          }
        }
        self.ws = ws;
        self.reconnectAttempts = 0;
        self.startPingInterval();

        ws.onmessage = (event) => {
          try {
            const parsed: OrchestratorServerEvent = JSON.parse(String(event.data));

            // Auto-handle ping/pong heartbeat
            if (parsed?.type === 'ping') {
              self.send({ type: 'pong' });
              return;
            }

            self.handlers.forEach((h) => h(parsed));
          } catch (e) {
            console.warn('Failed to parse WS message', e);
          }
        };

        ws.onclose = () => {
          self.stopPingInterval();
          if (self.ws === ws) self.ws = null;
          if (self.shouldReconnect && self.reconnectAttempts < RECONNECT_MAX_ATTEMPTS) {
            self.reconnectAttempts++;
            const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, self.reconnectAttempts - 1);
            console.warn(
              `WebSocket closed; reconnecting in ${delay}ms (attempt ${self.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})`
            );
            setTimeout(() => {
              self.connect().catch((e) => console.warn('Reconnect failed', e));
            }, delay);
          }
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
    this.shouldReconnect = false;
    this.stopPingInterval();
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

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      try {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send({ type: 'ping' });
        }
      } catch {
        // ignore
      }
    }, PING_INTERVAL_MS);
  }

  private stopPingInterval(): void {
    if (this.pingInterval != null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
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

  sendUserMessage(text: string, media?: MediaItemForSend[]): void {
    const payload: OrchestratorClientMessage = { type: 'message', message: text ?? '' };
    if (media && media.length > 0) {
      const now = new Date().toISOString();
      payload.media = media.map((m) => ({
        media_type: m.media_type,
        s3_key: m.s3_key,
        content_type: m.content_type ?? 'application/octet-stream',
        size_bytes: m.size_bytes ?? 0,
        uploaded_at: m.uploaded_at ?? now,
      }));
    }
    this.send(payload);
  }

  sendClarificationAnswer(text: string): void {
    this.send({ type: 'answer', message: text });
  }
}


