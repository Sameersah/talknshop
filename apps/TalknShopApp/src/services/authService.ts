import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { config, STORAGE_KEYS } from '@/constants/config';
import { User, AppError } from '@/types';

// Configure WebBrowser for auth session
WebBrowser.maybeCompleteAuthSession();

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

class AuthService {
  private discovery: AuthSession.DiscoveryDocument | null = null;

  // Initialize Cognito discovery document
  private async getDiscovery(): Promise<AuthSession.DiscoveryDocument> {
    if (!this.discovery) {
      const discoveryUrl = `https://${config.COGNITO_DOMAIN}/.well-known/openid_configuration`;
      this.discovery = await AuthSession.fetchDiscoveryAsync(discoveryUrl);
    }
    return this.discovery;
  }

  // Generate PKCE challenge
  private async generatePKCEChallenge(): Promise<{ codeChallenge: string; codeVerifier: string }> {
    const codeVerifier = AuthSession.AuthRequest.createRandomCodeChallenge();
    const codeChallenge = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64URL }
    );
    return { codeChallenge, codeVerifier };
  }

  // Store tokens securely
  private async storeTokens(tokens: AuthTokens): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, tokens.accessToken),
      SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken),
    ]);
  }

  // Retrieve tokens from secure storage
  private async getStoredTokens(): Promise<AuthTokens | null> {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN),
        SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
      ]);

      if (!accessToken || !refreshToken) {
        return null;
      }

      // Get expiration from token (simplified - in production, decode JWT)
      const expiresAt = Date.now() + 3600000; // 1 hour from now

      return {
        accessToken,
        refreshToken,
        expiresAt,
      };
    } catch (error) {
      console.error('Error retrieving stored tokens:', error);
      return null;
    }
  }

  // Clear stored tokens
  private async clearStoredTokens(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
    ]);
  }

  // Login with Hosted UI
  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    try {
      const discovery = await this.getDiscovery();
      const { codeChallenge, codeVerifier } = await this.generatePKCEChallenge();

      const request = new AuthSession.AuthRequest({
        clientId: config.APP_CLIENT_ID,
        scopes: ['openid', 'email', 'profile'],
        redirectUri: config.REDIRECT_URI,
        responseType: AuthSession.ResponseType.Code,
        codeChallenge,
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
        extraParams: {
          username: credentials.email,
          password: credentials.password,
        },
      });

      const result = await request.promptAsync(discovery);

      if (result.type === 'success' && result.params.code) {
        const tokenResponse = await AuthSession.exchangeCodeAsync(
          {
            clientId: config.APP_CLIENT_ID,
            code: result.params.code,
            redirectUri: config.REDIRECT_URI,
            extraParams: {
              code_verifier: codeVerifier,
            },
          },
          discovery
        );

        const tokens: AuthTokens = {
          accessToken: tokenResponse.accessToken,
          refreshToken: tokenResponse.refreshToken || '',
          expiresAt: Date.now() + (tokenResponse.expiresIn || 3600) * 1000,
        };

        await this.storeTokens(tokens);

        // Get user info from ID token
        const user = await this.getUserFromToken(tokenResponse.idToken || '');

        return { user, tokens };
      } else {
        throw new AppError('AUTH_ERROR', 'Login failed', result);
      }
    } catch (error) {
      throw new AppError('AUTH_ERROR', 'Login failed', error);
    }
  }

  // Register new user
  async register(userData: { email: string; password: string; name: string }): Promise<AuthResponse> {
    try {
      // This would typically call your backend API to register the user
      // For now, we'll simulate a successful registration
      const response = await fetch(`${config.API_BASE_URL}${config.API_VERSION}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new AppError('AUTH_ERROR', error.message || 'Registration failed');
      }

      const data = await response.json();
      
      // After successful registration, log the user in
      return this.login({ email: userData.email, password: userData.password });
    } catch (error) {
      throw new AppError('AUTH_ERROR', 'Registration failed', error);
    }
  }

  // Logout
  async logout(): Promise<void> {
    try {
      await this.clearStoredTokens();
      
      // Call backend logout endpoint if needed
      const tokens = await this.getStoredTokens();
      if (tokens?.accessToken) {
        await fetch(`${config.API_BASE_URL}${config.API_VERSION}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local tokens even if backend call fails
      await this.clearStoredTokens();
    }
  }

  // Refresh tokens
  async refreshTokens(): Promise<AuthTokens> {
    try {
      const storedTokens = await this.getStoredTokens();
      if (!storedTokens?.refreshToken) {
        throw new AppError('AUTH_ERROR', 'No refresh token available');
      }

      const discovery = await this.getDiscovery();
      
      const response = await fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: config.APP_CLIENT_ID,
          refresh_token: storedTokens.refreshToken,
        }),
      });

      if (!response.ok) {
        throw new AppError('AUTH_ERROR', 'Token refresh failed');
      }

      const tokenData = await response.json();
      
      const tokens: AuthTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || storedTokens.refreshToken,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      };

      await this.storeTokens(tokens);
      return tokens;
    } catch (error) {
      throw new AppError('AUTH_ERROR', 'Token refresh failed', error);
    }
  }

  // Forgot password
  async forgotPassword(email: string): Promise<void> {
    try {
      const response = await fetch(`${config.API_BASE_URL}${config.API_VERSION}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new AppError('AUTH_ERROR', error.message || 'Password reset failed');
      }
    } catch (error) {
      throw new AppError('AUTH_ERROR', 'Password reset failed', error);
    }
  }

  // Reset password
  async resetPassword(data: { token: string; password: string }): Promise<void> {
    try {
      const response = await fetch(`${config.API_BASE_URL}${config.API_VERSION}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new AppError('AUTH_ERROR', error.message || 'Password reset failed');
      }
    } catch (error) {
      throw new AppError('AUTH_ERROR', 'Password reset failed', error);
    }
  }

  // Get current user from stored tokens
  async getCurrentUser(): Promise<User | null> {
    try {
      const tokens = await this.getStoredTokens();
      if (!tokens?.accessToken) {
        return null;
      }

      // Check if token is expired
      if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
        // Try to refresh tokens
        try {
          const newTokens = await this.refreshTokens();
          return this.getUserFromToken(newTokens.accessToken);
        } catch (error) {
          // Refresh failed, clear tokens
          await this.clearStoredTokens();
          return null;
        }
      }

      return this.getUserFromToken(tokens.accessToken);
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  // Extract user info from JWT token (simplified)
  private async getUserFromToken(accessToken: string): Promise<User> {
    try {
      // In a real app, you'd decode the JWT token
      // For now, we'll make an API call to get user info
      const response = await fetch(`${config.API_BASE_URL}${config.API_VERSION}/user/profile`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new AppError('AUTH_ERROR', 'Failed to get user info');
      }

      const userData = await response.json();
      return userData.data;
    } catch (error) {
      throw new AppError('AUTH_ERROR', 'Failed to get user info', error);
    }
  }

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    try {
      const tokens = await this.getStoredTokens();
      if (!tokens?.accessToken) {
        return false;
      }

      // Check if token is expired
      if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
        // Try to refresh tokens
        try {
          await this.refreshTokens();
          return true;
        } catch (error) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  // Get access token (with automatic refresh)
  async getAccessToken(): Promise<string | null> {
    try {
      const tokens = await this.getStoredTokens();
      if (!tokens?.accessToken) {
        return null;
      }

      // Check if token is expired
      if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
        // Try to refresh tokens
        try {
          const newTokens = await this.refreshTokens();
          return newTokens.accessToken;
        } catch (error) {
          return null;
        }
      }

      return tokens.accessToken;
    } catch (error) {
      return null;
    }
  }
}

export const authService = new AuthService();
