/**
 * Main chat interface component
 */

import React from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ConnectionStatus } from './ConnectionStatus';
import { ChatMessage, WorkflowStage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
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
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">TalknShop</h1>
              <p className="text-sm text-gray-600">Your AI Shopping Assistant</p>
            </div>
            <ConnectionStatus 
              connected={connected} 
              connecting={connecting} 
              error={error}
              currentStage={currentStage}
            />
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-4xl mx-auto h-full px-4 py-6">
          <MessageList messages={messages} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <MessageInput 
            onSend={sendMessage} 
            disabled={!connected || connecting}
          />
        </div>
      </div>
    </div>
  );
};






