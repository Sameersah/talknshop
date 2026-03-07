/**
 * React hook for managing WebSocket connection and messages
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { OrchestratorWebSocketClient, EventHandler } from '../services/websocket';
import { WebSocketEvent, EventType, ChatMessage, ProductResult, WorkflowStage } from '../types';

const WS_URL = import.meta.env.VITE_ORCHESTRATOR_WS_URL || import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/chat';

interface UseWebSocketReturn {
  messages: ChatMessage[];
  sendMessage: (text: string, media?: { media_type: 'image' | 'audio' | 'video'; s3_key: string; content_type: string; size_bytes: number }[]) => void;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  currentStage: WorkflowStage | null;
}

export const useWebSocket = (sessionId: string, userId: string): UseWebSocketReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<WorkflowStage | null>(null);
  
  const clientRef = useRef<OrchestratorWebSocketClient | null>(null);
  const streamingMessageRef = useRef<ChatMessage | null>(null);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateLastMessage = useCallback((updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const newMessages = [...prev];
      newMessages[newMessages.length - 1] = updater(newMessages[newMessages.length - 1]);
      return newMessages;
    });
  }, []);

  const handleEvent: EventHandler = useCallback((event: WebSocketEvent) => {
    console.log('Received event:', event);

    switch (event.type) {
      case EventType.CONNECTED:
        setConnected(true);
        setConnecting(false);
        setError(null);
        break;

      case EventType.PROGRESS:
        if (event.data.stage) {
          setCurrentStage(event.data.stage);
        }
        if (event.data.message) {
          const progressContent = `⏳ ${event.data.message}`;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const isProgressMessage = last?.role === 'system' && typeof last.content === 'string' && last.content.startsWith('⏳ ');
            if (last?.role === 'system' && last.content === progressContent) {
              return prev;
            }
            if (isProgressMessage) {
              return prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: progressContent, stage: event.data.stage } : m
              );
            }
            return [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'system' as const,
                content: progressContent,
                timestamp: new Date(),
                stage: event.data.stage,
              },
            ];
          });
        }
        break;

      case EventType.TOKEN:
        if (event.data.token) {
          if (streamingMessageRef.current) {
            streamingMessageRef.current.content += event.data.token;
            updateLastMessage(msg => ({
              ...msg,
              content: streamingMessageRef.current!.content,
            }));
          } else {
            streamingMessageRef.current = {
              id: Date.now().toString(),
              role: 'assistant',
              content: event.data.token,
              timestamp: new Date(),
              isStreaming: true,
            };
            setMessages((prev) => {
              const withoutProgress = prev.filter(
                (m) => !(m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('⏳ '))
              );
              return [...withoutProgress, streamingMessageRef.current!];
            });
          }
        }
        break;

      case EventType.CLARIFICATION:
        if (event.data.question) {
          setMessages((prev) => {
            const withoutProgress = prev.filter(
              (m) => !(m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('⏳ '))
            );
            return [
              ...withoutProgress,
              {
                id: Date.now().toString(),
                role: 'assistant' as const,
                content: `❓ ${event.data.question}`,
                timestamp: new Date(),
                clarificationQuestion: event.data.question,
              },
            ];
          });
        }
        break;

      case EventType.RESULTS: {
        const products = (event.data.products ?? []) as ProductResult[];
        const count = products.length;
        const noResultsContent =
          event.data.final_response ||
          "We couldn't find any products matching your search. Try updating your criteria—for example, a different style, price range, or brand—and I'll search again.";
        const resultsContent =
          count > 0
            ? `Here are ${count} ${count === 1 ? 'option' : 'options'} that might work for you. Need a different price range, style, or brand? Just tell me what you'd like to change and I'll refine the search.`
            : noResultsContent;
          const resultsMessage = {
            id: Date.now().toString(),
            role: 'assistant' as const,
            content: resultsContent,
            timestamp: new Date(),
            ...(count > 0 && { products }),
          };
          setMessages((prev) => {
            const withoutProgress = prev.filter(
              (m) => !(m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('⏳ '))
            );
            const last = withoutProgress[withoutProgress.length - 1];
            const lastIsAssistant = last?.role === 'assistant';
            const alreadyHasSameResults = lastIsAssistant && count > 0 && last.products && last.products.length === count;
            if (alreadyHasSameResults) return prev;
            if (lastIsAssistant) {
              return withoutProgress.map((m, i) =>
                i === withoutProgress.length - 1
                  ? { ...m, content: resultsMessage.content, products: resultsMessage.products, isStreaming: false }
                  : m
              );
            }
            return [...withoutProgress, resultsMessage];
          });
          streamingMessageRef.current = null;
        }
        break;

      case EventType.DONE:
        if (streamingMessageRef.current) {
          updateLastMessage(msg => ({ ...msg, isStreaming: false }));
          streamingMessageRef.current = null;
        }
        setCurrentStage(WorkflowStage.COMPLETED);
        setMessages((prev) =>
          prev.filter(
            (m) => !(m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('⏳ '))
          )
        );
        break;

      case EventType.ERROR:
        setError(event.data.error?.message || 'An error occurred');
        addMessage({
          id: Date.now().toString(),
          role: 'system',
          content: `❌ Error: ${event.data.error?.message || 'Unknown error'}`,
          timestamp: new Date(),
        });
        break;
    }
  }, [addMessage, updateLastMessage]);

  useEffect(() => {
    const client = new OrchestratorWebSocketClient(WS_URL, sessionId, userId);
    clientRef.current = client;

    // Register event handler
    client.on('ALL', handleEvent);

    // Connect
    setConnecting(true);
    client.connect().catch(err => {
      console.error('Failed to connect:', err);
      setError('Failed to connect to server');
      setConnecting(false);
    });

    // Cleanup
    return () => {
      client.off('ALL', handleEvent);
      client.disconnect();
      clientRef.current = null;
    };
  }, [sessionId, userId, handleEvent]);

  const sendMessage = useCallback((text: string, media?: { media_type: 'image' | 'audio' | 'video'; s3_key: string; content_type: string; size_bytes: number }[]) => {
    if (!clientRef.current || !clientRef.current.isConnected()) {
      setError('Not connected to server');
      return;
    }

    try {
      const attachmentLabel = (type: 'image' | 'audio' | 'video') =>
        type === 'audio' ? 'Voice message' : type === 'image' ? 'Photo' : 'Video';
      const displayContent = text || (media && media.length > 0
        ? media.length === 1
          ? attachmentLabel(media[0].media_type)
          : media.map(m => attachmentLabel(m.media_type)).join(', ').replace(/, ([^,]+)$/, ' and $1')
        : '');
      addMessage({
        id: Date.now().toString(),
        role: 'user',
        content: displayContent,
        timestamp: new Date(),
        attachedMedia: media?.map(m => ({ media_type: m.media_type })),
      });

      clientRef.current.sendChatMessage(text, media);
      streamingMessageRef.current = null;
    } catch (err) {
      console.error('Failed to send message:', err);
      setError('Failed to send message');
    }
  }, [addMessage]);

  return {
    messages,
    sendMessage,
    connected,
    connecting,
    error,
    currentStage,
  };
};






