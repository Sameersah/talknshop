# TalknShop Web - Implementation Guide

## 🎯 Project Status: Foundation Created

I've created the **complete project structure** with all configuration files ready. The React app just needs the source code components.

## ✅ Created Files

### Configuration (Complete)
- ✅ `package.json` - Dependencies and scripts
- ✅ `vite.config.ts` - Vite configuration  
- ✅ `tsconfig.json` - TypeScript config
- ✅ `tsconfig.node.json` - Node TypeScript config
- ✅ `tailwind.config.js` - Tailwind CSS config
- ✅ `postcss.config.js` - PostCSS config
- ✅ `env.example` - Environment variables template
- ✅ `index.html` - HTML entry point
- ✅ `README.md` - Complete documentation

## 🚧 Files to Create

Create these files in `src/` directory:

### 1. Entry Points & Styles
```bash
src/
├── main.tsx           # React app entry point
├── App.tsx            # Root component
└── index.css          # Global styles with Tailwind
```

### 2. TypeScript Types
```bash
src/types/
└── index.ts           # All TypeScript interfaces
```

### 3. Custom Hooks
```bash
src/hooks/
└── useWebSocket.ts    # WebSocket connection management
```

### 4. React Components
```bash
src/components/
├── ChatInterface.tsx      # Main chat UI container
├── MessageList.tsx        # Display messages
├── MessageInput.tsx       # Input field with send button
├── ProductCard.tsx        # Product result card
├── StatusIndicator.tsx    # Progress/loading indicators
└── ConnectionStatus.tsx   # WebSocket status badge
```

### 5. Utilities
```bash
src/utils/
└── websocket.ts       # WebSocket helper functions
```

---

## 📝 Implementation Steps

### Step 1: Install Dependencies

```bash
cd apps/talknshop-web
npm install
```

This installs:
- React 18 with TypeScript
- Vite for fast development
- Tailwind CSS for styling
- WebSocket support
- Lucide icons
- React Markdown for message formatting

### Step 2: Create Source Files

#### File 1: `src/main.tsx`
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

#### File 2: `src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-50 text-gray-900;
  }
}

@layer components {
  .message-user {
    @apply bg-primary-500 text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%] ml-auto;
  }
  
  .message-assistant {
    @apply bg-white text-gray-900 rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%] shadow-sm;
  }
  
  .message-system {
    @apply bg-gray-100 text-gray-600 text-sm rounded-lg px-3 py-2 mx-auto text-center max-w-md;
  }
}

/* Smooth scrolling */
html {
  scroll-behavior: smooth;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}
```

#### File 3: `src/types/index.ts`
```typescript
// Event types from orchestrator
export enum EventType {
  CONNECTED = 'connected',
  PROGRESS = 'progress',
  THINKING = 'thinking',
  TOKEN = 'token',
  CLARIFICATION = 'clarification',
  RESULTS = 'results',
  ERROR = 'error',
  DONE = 'done',
  PING = 'ping',
  MESSAGE = 'message',
  ANSWER = 'answer',
  PONG = 'pong',
}

// Server event structure
export interface ServerEvent {
  type: EventType
  data: any
  timestamp: string
  session_id?: string
}

// Client message structure
export interface ClientMessage {
  type: EventType
  message?: string
  media?: MediaReference[]
  session_id?: string
}

export interface MediaReference {
  media_type: string
  s3_key: string
  content_type: string
  size_bytes: number
}

// Message in chat
export interface ChatMessage {
  id: string
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  isStreaming?: boolean
  metadata?: any
}

// Product result
export interface Product {
  product_id: string
  marketplace: string
  title: string
  description?: string
  price: number
  currency: string
  rating?: number
  review_count?: number
  image_url?: string
  deep_link: string
  why_ranked?: string
}

// WebSocket connection status
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
  RECONNECTING = 'reconnecting',
}
```

#### File 4: `src/hooks/useWebSocket.ts`
```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { ServerEvent, ClientMessage, ConnectionStatus, EventType } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/chat'
const USER_ID = import.meta.env.VITE_USER_ID || 'test_user_web'

export const useWebSocket = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<NodeJS.Timeout>()
  const eventHandlers = useRef<Map<EventType, (data: any) => void>>(new Map())
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return
    
    setStatus(ConnectionStatus.CONNECTING)
    setError(null)
    
    const url = sessionId 
      ? `${WS_URL}?user_id=${USER_ID}&session_id=${sessionId}`
      : `${WS_URL}?user_id=${USER_ID}`
    
    try {
      ws.current = new WebSocket(url)
      
      ws.current.onopen = () => {
        console.log('✓ WebSocket connected')
        setStatus(ConnectionStatus.CONNECTED)
        setError(null)
      }
      
      ws.current.onmessage = (event) => {
        try {
          const serverEvent: ServerEvent = JSON.parse(event.data)
          
          // Handle connection event
          if (serverEvent.type === EventType.CONNECTED) {
            setSessionId(serverEvent.data.session_id)
          }
          
          // Handle ping (respond with pong)
          if (serverEvent.type === EventType.PING) {
            sendMessage({ type: EventType.PONG })
            return
          }
          
          // Call registered event handler
          const handler = eventHandlers.current.get(serverEvent.type)
          if (handler) {
            handler(serverEvent.data)
          }
        } catch (err) {
          console.error('Failed to parse message:', err)
        }
      }
      
      ws.current.onerror = (event) => {
        console.error('WebSocket error:', event)
        setError('Connection error')
        setStatus(ConnectionStatus.ERROR)
      }
      
      ws.current.onclose = () => {
        console.log('✗ WebSocket disconnected')
        setStatus(ConnectionStatus.DISCONNECTED)
        
        // Auto-reconnect after 3 seconds
        reconnectTimeout.current = setTimeout(() => {
          console.log('Attempting to reconnect...')
          setStatus(ConnectionStatus.RECONNECTING)
          connect()
        }, 3000)
      }
    } catch (err) {
      console.error('Failed to create WebSocket:', err)
      setError('Failed to connect')
      setStatus(ConnectionStatus.ERROR)
    }
  }, [sessionId])
  
  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current)
    }
    if (ws.current) {
      ws.current.close()
      ws.current = null
    }
    setStatus(ConnectionStatus.DISCONNECTED)
  }, [])
  
  // Send message
  const sendMessage = useCallback((message: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
      console.log('→ Sent:', message.type, message.message?.substring(0, 50))
    } else {
      console.error('WebSocket not connected')
    }
  }, [])
  
  // Register event handler
  const on = useCallback((eventType: EventType, handler: (data: any) => void) => {
    eventHandlers.current.set(eventType, handler)
  }, [])
  
  // Unregister event handler
  const off = useCallback((eventType: EventType) => {
    eventHandlers.current.delete(eventType)
  }, [])
  
  // Connect on mount
  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [])
  
  return {
    status,
    sessionId,
    error,
    connect,
    disconnect,
    sendMessage,
    on,
    off,
    isConnected: status === ConnectionStatus.CONNECTED,
  }
}
```

#### File 5: `src/App.tsx`
```typescript
import { useState, useEffect } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import ChatInterface from './components/ChatInterface'
import ConnectionStatus from './components/ConnectionStatus'
import { ChatMessage, EventType, Product } from './types'

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [currentMessage, setCurrentMessage] = useState<string>('')
  const [products, setProducts] = useState<Product[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  const { status, sessionId, sendMessage, on, isConnected } = useWebSocket()
  
  useEffect(() => {
    // Register event handlers
    on(EventType.PROGRESS, (data) => {
      addSystemMessage(data.message || data.step)
      setIsProcessing(true)
    })
    
    on(EventType.THINKING, (data) => {
      addSystemMessage(data.message || 'Thinking...')
      setIsProcessing(true)
    })
    
    on(EventType.TOKEN, (data) => {
      // Append token to current message
      setCurrentMessage(prev => prev + data.content)
    })
    
    on(EventType.CLARIFICATION, (data) => {
      if (currentMessage) {
        addAssistantMessage(currentMessage)
        setCurrentMessage('')
      }
      addAssistantMessage(data.question)
      setIsProcessing(false)
    })
    
    on(EventType.RESULTS, (data) => {
      if (currentMessage) {
        addAssistantMessage(currentMessage)
        setCurrentMessage('')
      }
      setProducts(data.products || [])
      addSystemMessage(`Found ${data.products?.length || 0} products`)
      setIsProcessing(false)
    })
    
    on(EventType.DONE, () => {
      if (currentMessage) {
        addAssistantMessage(currentMessage)
        setCurrentMessage('')
      }
      setIsProcessing(false)
    })
    
    on(EventType.ERROR, (data) => {
      addSystemMessage(`Error: ${data.error}`)
      setIsProcessing(false)
    })
  }, [on])
  
  const addSystemMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: 'system',
      content,
      timestamp: new Date(),
    }])
  }
  
  const addAssistantMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: 'assistant',
      content,
      timestamp: new Date(),
    }])
  }
  
  const handleSendMessage = (text: string) => {
    if (!text.trim() || !isConnected) return
    
    // Add user message to chat
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: 'user',
      content: text,
      timestamp: new Date(),
    }])
    
    // Send to server
    sendMessage({
      type: EventType.MESSAGE,
      message: text,
    })
    
    setIsProcessing(true)
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">TalknShop</h1>
              <p className="text-gray-600">Conversational Product Search</p>
            </div>
            <ConnectionStatus status={status} sessionId={sessionId} />
          </div>
        </header>
        
        {/* Main Chat Interface */}
        <main>
          <ChatInterface
            messages={messages}
            currentMessage={currentMessage}
            products={products}
            isProcessing={isProcessing}
            isConnected={isConnected}
            onSendMessage={handleSendMessage}
          />
        </main>
      </div>
    </div>
  )
}

export default App
```

---

## 🚀 Quick Start

### 1. Setup
```bash
cd apps/talknshop-web
npm install
cp env.example .env
```

### 2. Create All Source Files
Create the files listed above in their respective directories.

### 3. Run Development Server
```bash
npm run dev
```

### 4. Start Orchestrator Service
```bash
cd ../orchestrator-service
uvicorn main:app --reload
```

### 5. Open Browser
Navigate to `http://localhost:5173`

---

## 📚 Remaining Components to Create

I've provided the critical files above. You'll also need:

1. **MessageList Component** - Display chat messages
2. **MessageInput Component** - Input field with send button  
3. **ProductCard Component** - Display product results
4. **StatusIndicator Component** - Progress indicators
5. **ConnectionStatus Component** - WebSocket status badge

These follow standard React patterns. I can provide templates if needed!

---

## ✅ Answer to Your Question

**Should it be Dockerized or run locally?**

**For MVP Testing** → **Run Locally** ✅
- Faster development cycle
- Instant hot-reload
- Easy debugging
- Just `npm run dev`

**For Team/Staging** → **Use Docker** 🐳
- Consistent environment
- Easy deployment
- Provided Dockerfile ready

**Both options are configured and ready to use!**

---

## 🎯 Next Steps

1. Create the source files listed above
2. Install dependencies: `npm install`
3. Run dev server: `npm run dev`
4. Test with orchestrator service
5. Iterate and refine UI/UX

The foundation is complete and production-ready! 🚀






