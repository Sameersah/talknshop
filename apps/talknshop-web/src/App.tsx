/**
 * Main App component
 */

import { useState, useEffect } from 'react';
import { ChatInterface } from './components/ChatInterface';
import { useWebSocket } from './hooks/useWebSocket';
import './App.css';

function App() {
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [userId] = useState(() => `user-${Math.random().toString(36).substr(2, 9)}`);

  const {
    messages,
    sendMessage,
    connected,
    connecting,
    error,
    currentStage,
  } = useWebSocket(sessionId, userId);

  useEffect(() => {
    console.log('App initialized with:', { sessionId, userId });
  }, [sessionId, userId]);

  return (
    <ChatInterface
      messages={messages}
      sendMessage={sendMessage}
      connected={connected}
      connecting={connecting}
      error={error}
      currentStage={currentStage}
    />
  );
}

export default App;






