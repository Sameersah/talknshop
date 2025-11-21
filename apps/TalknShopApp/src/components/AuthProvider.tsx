import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { actions } from '@/store';
import { authService } from '@/services/authService';
import { User } from '@/types';

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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const dispatch = useDispatch();
  const { user, isAuthenticated, isLoading } = useSelector((state: RootState) => state.auth);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize auth state on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const isAuth = await authService.isAuthenticated();
        if (isAuth) {
          const currentUser = await authService.getCurrentUser();
          if (currentUser) {
            dispatch(actions.auth.setTokens({
              accessToken: await authService.getAccessToken() || '',
              refreshToken: '', // This would be retrieved from storage
              expiresAt: Date.now() + 3600000, // 1 hour
            }));
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    initializeAuth();
  }, [dispatch]);

  const login = async (credentials: { email: string; password: string }) => {
    const resultAction = await dispatch(actions.auth.login(credentials));
    if (actions.auth.login.rejected.match(resultAction)) {
      throw resultAction.payload;
    }
  };

  const register = async (userData: { email: string; password: string; name: string }) => {
    const resultAction = await dispatch(actions.auth.register(userData));
    if (actions.auth.register.rejected.match(resultAction)) {
      throw resultAction.payload;
    }
  };

  const logout = async () => {
    const resultAction = await dispatch(actions.auth.logout());
    if (actions.auth.logout.rejected.match(resultAction)) {
      throw resultAction.payload;
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
  if (!isInitialized) {
    return null; // Or a loading component
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
