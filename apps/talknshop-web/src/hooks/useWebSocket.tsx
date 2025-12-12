/**
 * React hook for managing WebSocket connection and messages
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { OrchestratorWebSocketClient, EventHandler } from '../services/websocket';
import { WebSocketEvent, EventType, ChatMessage, ProductResult, WorkflowStage } from '../types';

const WS_URL = import.meta.env.VITE_ORCHESTRATOR_WS_URL || import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/chat';

interface UseWebSocketReturn {
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
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
        addMessage({
          id: Date.now().toString(),
          role: 'system',
          content: '✅ Connected to TalknShop',
          timestamp: new Date(),
        });
        break;

      case EventType.PROGRESS:
        if (event.data.stage) {
          setCurrentStage(event.data.stage);
        }
        if (event.data.message) {
          addMessage({
            id: Date.now().toString(),
            role: 'system',
            content: `⏳ ${event.data.message}`,
            timestamp: new Date(),
            stage: event.data.stage,
          });
        }
        break;

      case EventType.TOKEN:
        if (event.data.token) {
          if (streamingMessageRef.current) {
            // Update existing streaming message
            streamingMessageRef.current.content += event.data.token;
            updateLastMessage(msg => ({
              ...msg,
              content: streamingMessageRef.current!.content,
            }));
          } else {
            // Start new streaming message
            streamingMessageRef.current = {
              id: Date.now().toString(),
              role: 'assistant',
              content: event.data.token,
              timestamp: new Date(),
              isStreaming: true,
            };
            addMessage(streamingMessageRef.current);
          }
        }
        break;

      case EventType.CLARIFICATION:
        if (event.data.question) {
          addMessage({
            id: Date.now().toString(),
            role: 'assistant',
            content: `❓ ${event.data.question}`,
            timestamp: new Date(),
            clarificationQuestion: event.data.question,
          });
        }
        break;

      case EventType.RESULTS:
        if (event.data.products && event.data.products.length > 0) {
          addMessage({
            id: Date.now().toString(),
            role: 'assistant',
            content: `Found ${event.data.products.length} products:`,
            timestamp: new Date(),
            products: event.data.products as ProductResult[],
          });
        }
        break;

      case EventType.DONE:
        if (streamingMessageRef.current) {
          updateLastMessage(msg => ({ ...msg, isStreaming: false }));
          streamingMessageRef.current = null;
        }
        setCurrentStage(WorkflowStage.COMPLETED);
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

  const sendMessage = useCallback((text: string) => {
    if (!clientRef.current || !clientRef.current.isConnected()) {
      setError('Not connected to server');
      return;
    }

    try {
      // Add user message to UI
      addMessage({
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      });

      // Send via WebSocket
      clientRef.current.sendChatMessage(text);
      
      // Reset streaming ref
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






