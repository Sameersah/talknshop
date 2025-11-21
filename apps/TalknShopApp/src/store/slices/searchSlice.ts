import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { SearchQuery, SearchResult, AppError } from '@/types';

interface SearchState {
  currentQuery: SearchQuery | null;
  searchHistory: SearchQuery[];
  results: SearchResult | null;
  isLoading: boolean;
  error: AppError | null;
}

const initialState: SearchState = {
  currentQuery: null,
  searchHistory: [],
  results: null,
  isLoading: false,
  error: null,
};

// Async thunks
export const searchProducts = createAsyncThunk(
  'search/searchProducts',
  async (query: { text?: string; image?: string; audio?: string }, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      });
      if (!response.ok) throw new Error('Search failed');
      return await response.json();
    } catch (error) {
      return rejectWithValue(error as AppError);
    }
  }
);

export const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearResults: (state) => {
      state.results = null;
      state.currentQuery = null;
    },
    addToHistory: (state, action: PayloadAction<SearchQuery>) => {
      state.searchHistory.unshift(action.payload);
      // Keep only last 10 searches
      if (state.searchHistory.length > 10) {
        state.searchHistory = state.searchHistory.slice(0, 10);
      }
    },
    clearHistory: (state) => {
      state.searchHistory = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchProducts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(searchProducts.fulfilled, (state, action) => {
        state.isLoading = false;
        state.results = action.payload;
        state.error = null;
      })
      .addCase(searchProducts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as AppError;
      });
  },
});

export const { clearError, clearResults, addToHistory, clearHistory } = searchSlice.actions;
