import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers } from '@reduxjs/toolkit';
import { authSlice, login, register, logout, refreshTokens, forgotPassword, resetPassword } from './slices/authSlice';
import { userSlice } from './slices/userSlice';
import { searchSlice } from './slices/searchSlice';
import { chatSlice } from './slices/chatSlice';
import { wishlistSlice } from './slices/wishlistSlice';
import { orderSlice } from './slices/orderSlice';
import { notificationSlice } from './slices/notificationSlice';
import { themeSlice } from './slices/themeSlice';

// Persist config
const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['auth', 'user', 'theme', 'wishlist'], // Only persist these slices
  blacklist: ['search', 'chat', 'notifications'], // Don't persist these slices
};

// Root reducer
const rootReducer = combineReducers({
  auth: authSlice.reducer,
  user: userSlice.reducer,
  search: searchSlice.reducer,
  chat: chatSlice.reducer,
  wishlist: wishlistSlice.reducer,
  orders: orderSlice.reducer,
  notifications: notificationSlice.reducer,
  theme: themeSlice.reducer,
});

// Persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: __DEV__,
});

// Persistor
export const persistor = persistStore(store);

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Actions - combine sync actions with async thunks
export const actions = {
  auth: {
    ...authSlice.actions,
    login,
    register,
    logout,
    refreshTokens,
    forgotPassword,
    resetPassword,
  },
  user: userSlice.actions,
  search: searchSlice.actions,
  chat: chatSlice.actions,
  wishlist: wishlistSlice.actions,
  orders: orderSlice.actions,
  notifications: notificationSlice.actions,
  theme: themeSlice.actions,
};
