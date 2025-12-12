import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch } from '@/store';
import { RootState, persistor } from '@/store';
import { actions } from '@/store';
import { authService } from '@/services/authService';
import { User } from '@/types';
import { router, useSegments } from 'expo-router';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (userData: { email: string; password: string; name: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

// Route protection hook - ENABLED
function useProtectedRoute(user: User | null, isInitialized: boolean) {
  const segments = useSegments();

  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user) {
      // User is not authenticated - redirect to login
      if (!inAuthGroup) {
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 50);
      }
    } else {
      // User is authenticated - redirect away from auth screens
      if (inAuthGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [user, isInitialized, segments]);
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { user, isAuthenticated, isLoading } = useSelector((state: RootState) => state.auth);
  const [isInitialized, setIsInitialized] = useState(false);

  // Use route protection
  useProtectedRoute(user, isInitialized);

  // Initialize auth state on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Clear any stale auth state first
        dispatch(actions.auth.clearAuth());
        
        const isAuth = await authService.isAuthenticated();
        
        if (isAuth) {
          const currentUser = await authService.getCurrentUser();
          const accessToken = await authService.getAccessToken();
          
          if (currentUser && accessToken) {
            // Get stored tokens to get refresh token and expiration
            const storedTokens = await (authService as any).getStoredTokens();
            
            dispatch(actions.auth.setTokens({
              accessToken,
              refreshToken: storedTokens?.refreshToken || '',
              expiresAt: storedTokens?.expiresAt || Date.now() + 3600000,
            }));
            
            // Set user in Redux
            dispatch({
              type: actions.auth.login.fulfilled.type,
              payload: {
                user: currentUser,
                tokens: {
                  accessToken,
                  refreshToken: storedTokens?.refreshToken || '',
                  expiresAt: storedTokens?.expiresAt || Date.now() + 3600000,
                },
              },
            });
          } else {
            dispatch(actions.auth.clearAuth());
          }
        } else {
          dispatch(actions.auth.clearAuth());
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        dispatch(actions.auth.clearAuth());
      } finally {
        setIsInitialized(true);
      }
    };

    initializeAuth();
  }, [dispatch]);


  const login = async (credentials: { email: string; password: string }) => {
    try {
      const resultAction = await dispatch(actions.auth.login(credentials));
      if (actions.auth.login.rejected.match(resultAction)) {
        const error = resultAction.payload || resultAction.error;
        throw error || new Error('Login failed');
      }
    } catch (error) {
      console.error('Login error in AuthProvider:', error);
      throw error;
    }
  };

  const register = async (userData: { email: string; password: string; name: string }) => {
    try {
      const resultAction = await dispatch(actions.auth.register(userData));
      if (actions.auth.register.rejected.match(resultAction)) {
        const error = resultAction.payload || resultAction.error;
        throw error || new Error('Registration failed');
      }
    } catch (error) {
      console.error('Register error in AuthProvider:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Clear auth state immediately
      dispatch(actions.auth.clearAuth());
      
      // Call logout service (clears Cognito session and tokens)
      try {
        await dispatch(actions.auth.logout());
      } catch (error) {
        // Continue even if service logout fails
        console.error('Logout service error:', error);
      }
      
      // Purge Redux Persist storage to prevent rehydration
      try {
        await persistor.purge();
      } catch (error) {
        console.error('Error purging persist storage:', error);
      }
      
      // Ensure auth state is cleared
      dispatch(actions.auth.clearAuth());
      
      // Navigate to login
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 100);
    } catch (error) {
      console.error('Logout error:', error);
      // Always clear auth state even on error
      dispatch(actions.auth.clearAuth());
      
      // Purge persist storage
      try {
        await persistor.purge();
      } catch (e) {
        // Ignore purge errors
      }
      
      // Navigate to login
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 100);
    }
  };

  const refreshAuth = async () => {
    const resultAction = await dispatch(actions.auth.refreshTokens());
    if (actions.auth.refreshTokens.rejected.match(resultAction)) {
      throw resultAction.payload;
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshAuth,
  };

  // Show loading screen while initializing
  // Note: We still render children so route protection can work
  // The route protection will handle redirects once initialized
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
