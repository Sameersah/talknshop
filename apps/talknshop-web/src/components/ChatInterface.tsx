/**
 * Main chat interface – audio-first conversational layout
 */

import React from 'react';
import { MessageList } from './MessageList';
import { MessageInput, type MediaItem } from './MessageInput';
import { ConnectionStatus } from './ConnectionStatus';
import { ChatMessage, WorkflowStage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  sendMessage: (text: string, media?: MediaItem[]) => void;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  currentStage: WorkflowStage | null;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  sendMessage,
  connected,
  connecting,
  error,
  currentStage,
}) => {
  return (
    <div className="flex flex-col h-screen bg-[#f8f7fc]">
      {/* Header: minimal, consistent height, clear hierarchy */}
      <header className="flex-shrink-0 h-14 flex items-center bg-white/95 backdrop-blur-md border-b border-gray-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="w-full max-w-3xl mx-auto px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm" aria-hidden>
              T
            </div>
            <h1 className="text-base font-semibold text-gray-900 truncate">TalknShop</h1>
          </div>
          <ConnectionStatus
            connected={connected}
            connecting={connecting}
            error={error}
            currentStage={currentStage}
          />
        </div>
      </header>

      {/* Messages – scrollbar on extreme right (full-width scroll container) */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="max-w-3xl mx-auto px-4 py-4 min-h-full">
          <MessageList messages={messages} />
        </div>
      </main>

      {/* Input bar – fixed at bottom */}
      <div className="flex-shrink-0 bg-white/95 backdrop-blur-sm border-t border-gray-200/80 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.06)]">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <MessageInput
            onSend={sendMessage}
            disabled={!connected || connecting}
          />
        </div>
      </div>
    </div>
  );
};
