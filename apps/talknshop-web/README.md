# TalknShop Web - MVP Chat Application

Modern React-based web application for testing TalknShop orchestrator service integration with real-time WebSocket chat.

## 🎯 Overview

This is an MVP web application built with:
- **React 18** with TypeScript for type safety
- **Vite** for lightning-fast development
- **Tailwind CSS** for modern, responsive UI
- **WebSocket** for real-time bidirectional communication
- **Material Design** principles for UX

## ✨ Features

- 💬 **Real-time Chat** - WebSocket-based messaging with token streaming
- 🎨 **Modern UI** - Clean, ChatGPT-inspired interface
- 📱 **Responsive** - Works on desktop, tablet, and mobile
- 🔄 **Live Updates** - Progress indicators and status updates
- 🎯 **Product Cards** - Beautiful display of search results
- 💡 **Clarifications** - Interactive question-answer flow
- 🎭 **Error Handling** - Graceful error messages and recovery
- 🌓 **Dark Mode** - Eye-friendly dark theme

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn
- Orchestrator service running (see `../orchestrator-service`)

### Local Development (Recommended for MVP)

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

### Docker Setup (Optional)

```bash
# Build Docker image
docker build -t talknshop-web .

# Run container
docker run -p 5173:5173 talknshop-web
```

Or use docker-compose from root:
```bash
docker-compose up talknshop-web
```

## 🔧 Configuration

Create `.env` file:

```bash
# Orchestrator WebSocket URL
VITE_WS_URL=ws://localhost:8000/ws/chat

# API Base URL
VITE_API_URL=http://localhost:8000

# User ID (for testing)
VITE_USER_ID=test_user_web
```

## 📁 Project Structure

```
talknshop-web/
├── src/
│   ├── components/          # React components
│   │   ├── ChatInterface.tsx    # Main chat UI
│   │   ├── MessageList.tsx      # Message display
│   │   ├── MessageInput.tsx     # Input field
│   │   ├── ProductCard.tsx      # Product results
│   │   └── StatusIndicator.tsx  # Progress/status
│   ├── hooks/               # Custom React hooks
│   │   └── useWebSocket.ts      # WebSocket management
│   ├── types/               # TypeScript types
│   │   └── index.ts             # Type definitions
│   ├── utils/               # Utility functions
│   │   └── websocket.ts         # WebSocket helpers
│   ├── App.tsx              # Root component
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── public/                  # Static assets
├── index.html               # HTML template
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite config
├── tailwind.config.js       # Tailwind config
└── Dockerfile               # Docker configuration
```

## 🎨 UI Components

### Chat Interface
- Clean, minimal design inspired by modern chat apps
- Auto-scrolling message list
- Typing indicators
- Message timestamps

### Message Types
- **User messages** - Right-aligned, blue
- **Assistant messages** - Left-aligned, gray
- **System messages** - Centered, subtle
- **Product cards** - Rich media with images, prices, ratings

### Progress Indicators
- Loading spinner during processing
- Step-by-step progress messages
- Token-by-token streaming animation

## 🔌 WebSocket Integration

### Connection Flow
```
1. User opens app
2. WebSocket connects to orchestrator
3. Receives "connected" event with session_id
4. User sends message
5. Receives stream of events:
   - progress: "Analyzing message..."
   - token: Streaming response
   - clarification: Question (if needed)
   - results: Product results
   - done: Workflow complete
```

### Event Handling
```typescript
// All server event types handled:
- connected: Connection established
- progress: Processing updates
- thinking: AI is processing
- token: Streaming text (character by character)
- clarification: Question from AI
- results: Product search results
- error: Error occurred
- done: Processing complete
- ping: Heartbeat (auto-respond with pong)
```

## 🧪 Testing

### Manual Testing Checklist
- [ ] WebSocket connection establishes
- [ ] Can send messages
- [ ] Receives streaming responses
- [ ] Progress indicators show
- [ ] Clarification questions display
- [ ] Can answer clarifications
- [ ] Product results render
- [ ] Error handling works
- [ ] Reconnection works after disconnect
- [ ] Mobile responsive layout

### Test Scenarios
1. **Simple Search**: "I need a laptop under $1000"
2. **With Clarification**: "I want a laptop" → Budget? → "$800"
3. **With Media**: Upload image → Analyze → Search
4. **Error Recovery**: Disconnect → Reconnect → Continue

## 🎯 Best Practices Implemented

### Performance
- ✅ React 18 with concurrent features
- ✅ Component lazy loading
- ✅ Memoization for expensive renders
- ✅ Debounced input handling
- ✅ Virtual scrolling for long message lists

### UX Design
- ✅ Loading states and skeletons
- ✅ Error boundaries
- ✅ Graceful degradation
- ✅ Accessibility (ARIA labels)
- ✅ Keyboard shortcuts
- ✅ Mobile-first responsive design

### Code Quality
- ✅ TypeScript for type safety
- ✅ ESLint for code quality
- ✅ Prettier for formatting
- ✅ Component-based architecture
- ✅ Custom hooks for logic reuse

## 🔒 Security

- WebSocket connections only to configured URLs
- No sensitive data in localStorage
- Input sanitization
- XSS protection via React
- CORS handling

## 📱 Responsive Design

### Breakpoints
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### Layout Adaptations
- Single column on mobile
- Sidebar on tablet+
- Full chat interface on desktop

## 🚢 Deployment Options

### Option 1: Local Development (MVP)
```bash
npm run dev
# Fastest for testing, hot-reload
```

### Option 2: Docker (Team/Staging)
```bash
docker-compose up talknshop-web
# Consistent environment
```

### Option 3: Production Build
```bash
npm run build
# Creates optimized static files in dist/
# Serve with Nginx, Vercel, or Netlify
```

## 🔗 Integration with Orchestrator

### Environment Setup
```bash
# Development (local orchestrator)
VITE_WS_URL=ws://localhost:8000/ws/chat

# Docker (docker-compose)
VITE_WS_URL=ws://orchestrator-service:8000/ws/chat

# Production (AWS)
VITE_WS_URL=wss://api.talknshop.com/ws/chat
```

### Testing Connection
```bash
# 1. Start orchestrator service
cd ../orchestrator-service
uvicorn main:app --reload

# 2. In new terminal, start web app
cd ../talknshop-web
npm run dev

# 3. Open browser to http://localhost:5173
```

## 📊 Performance Metrics

- **First Load**: < 2s
- **Time to Interactive**: < 3s
- **WebSocket Connection**: < 500ms
- **Message Latency**: < 100ms
- **Bundle Size**: < 500KB gzipped

## 🐛 Troubleshooting

### WebSocket won't connect
- Check orchestrator service is running
- Verify VITE_WS_URL in .env
- Check CORS settings on orchestrator

### Messages not appearing
- Open DevTools → Network → WS
- Check WebSocket messages
- Verify event type handling

### Styling issues
- Run `npm run build` to rebuild Tailwind
- Clear browser cache
- Check console for errors

## 🤝 Contributing

1. Follow React best practices
2. Use TypeScript strictly
3. Format with Prettier before commit
4. Test on mobile and desktop
5. Update README for new features

## 📚 Resources

- [React Documentation](https://react.dev)
- [Vite Guide](https://vitejs.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

**Version**: 0.1.0 (MVP)  
**Status**: Ready for Testing  
**Last Updated**: October 24, 2025






