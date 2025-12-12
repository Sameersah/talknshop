/**
 * Message list component with auto-scroll
 */

import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: ChatMessage[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-6xl mb-4">🛍️</div>
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">
            Welcome to TalknShop!
          </h2>
          <p className="text-gray-600 max-w-md">
            Start a conversation to search for products. Try asking:
          </p>
          <div className="mt-4 space-y-2 text-left max-w-md mx-auto">
            <p className="text-sm text-gray-700 bg-white rounded-lg p-3 shadow">
              💡 "I need a wireless keyboard for my MacBook"
            </p>
            <p className="text-sm text-gray-700 bg-white rounded-lg p-3 shadow">
              💡 "Show me running shoes under $100"
            </p>
            <p className="text-sm text-gray-700 bg-white rounded-lg p-3 shadow">
              💡 "Find a gift for my mom who loves gardening"
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};






