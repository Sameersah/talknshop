import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { WishlistItem, AppError } from '@/types';

interface WishlistState {
  items: WishlistItem[];
  isLoading: boolean;
  error: AppError | null;
}

const initialState: WishlistState = {
  items: [],
  isLoading: false,
  error: null,
};

// Async thunks
export const fetchWishlist = createAsyncThunk(
  'wishlist/fetchWishlist',
  async (_, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/wishlist');
      if (!response.ok) throw new Error('Failed to fetch wishlist');
      return await response.json();
    } catch (error) {
      return rejectWithValue(error as AppError);
    }
  }
);

export const addToWishlist = createAsyncThunk(
  'wishlist/addItem',
  async (productId: string, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/wishlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      if (!response.ok) throw new Error('Failed to add to wishlist');
      return await response.json();
    } catch (error) {
      return rejectWithValue(error as AppError);
    }
  }
);

export const removeFromWishlist = createAsyncThunk(
  'wishlist/removeItem',
  async (itemId: string, { rejectWithValue }) => {
    try {
      const response = await fetch(`/api/wishlist/remove/${itemId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to remove from wishlist');
      return itemId;
    } catch (error) {
      return rejectWithValue(error as AppError);
    }
  }
);

export const wishlistSlice = createSlice({
  name: 'wishlist',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWishlist.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchWishlist.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = action.payload;
        state.error = null;
      })
      .addCase(fetchWishlist.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as AppError;
      });

    builder
      .addCase(addToWishlist.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(addToWishlist.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items.push(action.payload);
        state.error = null;
      })
      .addCase(addToWishlist.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as AppError;
      });

    builder
      .addCase(removeFromWishlist.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(removeFromWishlist.fulfilled, (state, action) => {
        state.isLoading = false;
        state.items = state.items.filter(item => item.id !== action.payload);
        state.error = null;
      })
      .addCase(removeFromWishlist.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as AppError;
      });
  },
});

export const { clearError } = wishlistSlice.actions;
