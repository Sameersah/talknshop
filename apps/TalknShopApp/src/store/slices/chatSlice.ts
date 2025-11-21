import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ChatSession, ChatMessage, AppError } from '@/types';

interface ChatState {
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  isLoading: boolean;
  error: AppError | null;
}

const initialState: ChatState = {
  currentSession: null,
  sessions: [],
  isLoading: false,
  error: null,
};

// Async thunks
export const createChatSession = createAsyncThunk(
  'chat/createSession',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to create session');
      return await response.json();
    } catch (error) {
      return rejectWithValue(error as AppError);
    }
  }
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ sessionId, message }: { sessionId: string; message: string }, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error('Failed to send message');
      return await response.json();
    } catch (error) {
      return rejectWithValue(error as AppError);
    }
  }
);

export const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentSession: (state, action: PayloadAction<ChatSession>) => {
      state.currentSession = action.payload;
    },
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      if (state.currentSession) {
        state.currentSession.messages.push(action.payload);
      }
    },
    clearCurrentSession: (state) => {
      state.currentSession = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createChatSession.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createChatSession.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentSession = action.payload;
        state.sessions.push(action.payload);
        state.error = null;
      })
      .addCase(createChatSession.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as AppError;
      });

    builder
      .addCase(sendMessage.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.isLoading = false;
        if (state.currentSession) {
          state.currentSession.messages.push(action.payload);
        }
        state.error = null;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as AppError;
      });
  },
});

export const { clearError, setCurrentSession, addMessage, clearCurrentSession } = chatSlice.actions;
