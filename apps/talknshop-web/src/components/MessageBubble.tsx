/**
 * Message bubble with optional media indicators (voice, image, ASL video).
 * System progress messages show a single, user-friendly waiting state.
 */

import React from 'react';
import { Mic, Image, Video, Loader2 } from 'lucide-react';
import { ChatMessage, AttachedMediaType } from '../types';
import { ProductCard } from './ProductCard';
import { TypingIndicator } from './TypingIndicator';

interface MessageBubbleProps {
  message: ChatMessage;
}

function mediaTypeLabel(type: AttachedMediaType): string {
  return type === 'audio' ? 'Voice message' : type === 'image' ? 'Photo' : 'Video';
}

function MediaIndicator({ type }: { type: AttachedMediaType }) {
  const props = { className: 'w-3.5 h-3.5' };
  if (type === 'audio') return <Mic {...props} />;
  if (type === 'video') return <Video {...props} />;
  return <Image {...props} />;
}

/** Strip leading ⏳ if present (used for progress text only) */
function progressText(content: string): string {
  return content.startsWith('⏳ ') ? content.slice(2).trim() : content;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isProgress = isSystem && typeof message.content === 'string' && message.content.startsWith('⏳ ');

  if (isSystem) {
    if (isProgress) {
      return (
        <div className="flex justify-center py-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-100/90 px-4 py-2 text-sm text-gray-700">
            <Loader2 className="w-4 h-4 animate-spin text-violet-500 flex-shrink-0" />
            <span>{progressText(message.content)}</span>
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-center">
        <p className="text-gray-600 text-sm max-w-md text-center">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-2xl ${isUser ? 'ml-8' : 'mr-8'}`}>
        <div className="flex flex-wrap items-center gap-2">
          {message.attachedMedia && message.attachedMedia.length > 0 && (
            <div className="flex gap-1.5 text-gray-500">
              {message.attachedMedia.map((m, i) => (
                <span
                  key={i}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gray-100"
                  title={mediaTypeLabel(m.media_type)}
                >
                  <MediaIndicator type={m.media_type} />
                </span>
              ))}
            </div>
          )}
          {message.content && (
            <p className={`whitespace-pre-wrap break-words ${isUser ? 'text-right text-gray-900' : 'text-left text-gray-800'}`}>
              {message.content}
            </p>
          )}
        </div>

        {message.isStreaming && (
          <div className="mt-2">
            <TypingIndicator />
          </div>
        )}

        {message.products && message.products.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {message.products.map((product, idx) => (
              <ProductCard key={`${product.product_id}-${idx}`} product={product} />
            ))}
          </div>
        )}

        <div
          className={`text-xs mt-1 ${isUser ? 'text-right text-gray-500' : 'text-left text-gray-400'}`}
        >
          {message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};
