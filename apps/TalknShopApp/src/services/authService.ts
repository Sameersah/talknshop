import { config, STORAGE_KEYS } from '@/constants/config';
import { User, createAppError } from '@/types';
import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';
import { storage } from '@/utils/storage';

// Initialize Cognito User Pool
const userPool = new CognitoUserPool({
  UserPoolId: config.USER_POOL_ID,
  ClientId: config.APP_CLIENT_ID,
});

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
}

interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

class AuthService {
  // Store tokens securely
  private async storeTokens(tokens: AuthTokens): Promise<void> {
    await Promise.all([
      storage.setItem(STORAGE_KEYS.AUTH_TOKEN, tokens.accessToken),
      storage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken),
      storage.setItem('id_token', tokens.idToken),
      storage.setItem('token_expires_at', tokens.expiresAt.toString()),
    ]);
  }

  // Retrieve tokens from secure storage (public for AuthProvider)
  async getStoredTokens(): Promise<AuthTokens | null> {
    try {
      const [accessToken, refreshToken, idToken, expiresAtStr] = await Promise.all([
        storage.getItem(STORAGE_KEYS.AUTH_TOKEN),
        storage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
        storage.getItem('id_token'),
        storage.getItem('token_expires_at'),
      ]);

      if (!accessToken || !refreshToken || !idToken) {
        return null;
      }

      const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : Date.now() + 3600000;

      return {
        accessToken,
        refreshToken,
        idToken,
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
      storage.removeItem(STORAGE_KEYS.AUTH_TOKEN),
      storage.removeItem(STORAGE_KEYS.REFRESH_TOKEN),
      storage.removeItem('id_token'),
      storage.removeItem('token_expires_at'),
    ]);
  }

  // Extract user info from ID token
  private getUserFromIdToken(idToken: string): User {
    try {
      // Decode JWT token (base64url decode)
      const base64Url = idToken.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const decoded = JSON.parse(jsonPayload);

      return {
        id: decoded.sub || decoded['cognito:username'] || '',
        email: decoded.email || '',
        name: decoded.name || decoded['cognito:username'] || '',
        avatar: decoded.picture || null,
        preferences: {
          theme: 'dark',
          notifications: {
            push: true,
            email: true,
            priceAlerts: true,
            orderUpdates: true,
          },
          search: {
            voiceEnabled: true,
            imageEnabled: true,
            defaultRetailer: 'amazon',
            maxResults: 20,
          },
          language: 'en',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error decoding ID token:', error);
      throw createAppError('AUTH_ERROR', 'Failed to decode user token', error);
    }
  }

  // Login with email and password
  async login(credentials: { email: string; password: string }): Promise<AuthResponse> {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: credentials.email,
        Password: credentials.password,
      });

      const cognitoUser = new CognitoUser({
        Username: credentials.email,
        Pool: userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: async (result) => {
          try {
            const accessToken = result.getAccessToken().getJwtToken();
            const idToken = result.getIdToken().getJwtToken();
            const refreshToken = result.getRefreshToken().getToken();

            // Get expiration from token
            const idTokenPayload = JSON.parse(atob(idToken.split('.')[1]));
            const expiresAt = (idTokenPayload.exp || Math.floor(Date.now() / 1000) + 3600) * 1000;

            const tokens: AuthTokens = {
              accessToken,
              idToken,
              refreshToken,
              expiresAt,
            };

            await this.storeTokens(tokens);
            const user = this.getUserFromIdToken(idToken);

            resolve({ user, tokens });
          } catch (error) {
            reject(createAppError('AUTH_ERROR', 'Failed to process login', error));
          }
        },
        onFailure: (err: any) => {
          console.error('Login error:', err);
          
          let errorMessage = 'Login failed. Please check your credentials.';
          if (err.code === 'NotAuthorizedException') {
            errorMessage = 'Invalid email or password.';
          } else if (err.code === 'UserNotConfirmedException') {
            errorMessage = 'Please verify your email address before signing in.';
          } else if (err.code === 'UserNotFoundException') {
            errorMessage = 'User not found. Please sign up first.';
          }

          reject(createAppError('AUTH_ERROR', errorMessage, err));
        },
        newPasswordRequired: (_userAttributes: any, _requiredAttributes: any) => {
          // User needs to set a new password (first time login)
          reject(createAppError('AUTH_ERROR', 'Please set a new password. This is your first login.'));
        },
      });
    });
  }

  // Register new user
  async register(userData: { email: string; password: string; name: string }): Promise<AuthResponse> {
    return new Promise((resolve, reject) => {
      const attributeList = [
        new CognitoUserAttribute({ Name: 'email', Value: userData.email }),
        new CognitoUserAttribute({ Name: 'name', Value: userData.name }),
      ];

      userPool.signUp(
        userData.email,
        userData.password,
        attributeList,
        [],
        async (err, result) => {
          if (err) {
            console.error('Registration error:', err);
            
            let errorMessage = 'Registration failed. Please try again.';
            const errorCode = (err as any)?.code;
            if (errorCode === 'UsernameExistsException') {
              errorMessage = 'An account with this email already exists.';
            } else if (errorCode === 'InvalidPasswordException') {
              errorMessage = 'Password does not meet requirements.';
            } else if (errorCode === 'InvalidParameterException') {
              errorMessage = 'Invalid email or password format.';
            }

            reject(createAppError('AUTH_ERROR', errorMessage, err));
            return;
          }

          if (!result) {
            reject(createAppError('AUTH_ERROR', 'Registration failed. Please try again.'));
            return;
          }

          // If user is confirmed, log them in
          if (result.userConfirmed) {
            try {
              const response = await this.login({ email: userData.email, password: userData.password });
              resolve(response);
            } catch (loginError) {
              reject(createAppError('AUTH_ERROR', 'Registration successful but login failed. Please try logging in.'));
            }
          } else {
            // User needs to verify email
            reject(createAppError('AUTH_ERROR', 'Please check your email to verify your account before signing in.'));
          }
        }
      );
    });
  }

  // Confirm sign up with verification code
  async confirmSignUp(email: string, code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(code, true, (err) => {
        if (err) {
          reject(createAppError('AUTH_ERROR', 'Invalid verification code. Please try again.', err));
          return;
        }
        resolve();
      });
    });
  }

  // Resend verification code
  async resendConfirmationCode(email: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.resendConfirmationCode((err) => {
        if (err) {
          reject(createAppError('AUTH_ERROR', 'Failed to resend verification code.', err));
          return;
        }
        resolve();
      });
    });
  }

  // Logout
  async logout(): Promise<void> {
    try {
      console.log('authService.logout called');
      const tokens = await this.getStoredTokens();
      console.log('Tokens retrieved:', tokens ? 'exists' : 'null');
      
      if (tokens?.idToken) {
        const cognitoUser = userPool.getCurrentUser();
        console.log('Cognito user:', cognitoUser ? 'exists' : 'null');
        if (cognitoUser) {
          cognitoUser.signOut();
          console.log('Cognito signOut called');
        }
      }
      
      await this.clearStoredTokens();
      console.log('Stored tokens cleared');
    } catch (error) {
      console.error('Logout error in authService:', error);
      // Always clear tokens even if there's an error
      try {
        await this.clearStoredTokens();
      } catch (clearError) {
        console.error('Error clearing tokens:', clearError);
      }
      throw error;
    }
  }

  // Refresh tokens
  async refreshTokens(): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      const cognitoUser = userPool.getCurrentUser();
      
      if (!cognitoUser) {
        reject(createAppError('AUTH_ERROR', 'No user session found'));
        return;
      }

      cognitoUser.getSession(async (err: any, session: any) => {
        if (err || !session.isValid()) {
          // Try to refresh
          cognitoUser.refreshSession(session.getRefreshToken(), async (refreshErr: any, refreshSession: any) => {
            if (refreshErr) {
              reject(createAppError('AUTH_ERROR', 'Token refresh failed. Please log in again.'));
              return;
            }

            try {
              const accessToken = refreshSession.getAccessToken().getJwtToken();
              const idToken = refreshSession.getIdToken().getJwtToken();
              const refreshToken = refreshSession.getRefreshToken().getToken();

              const idTokenPayload = JSON.parse(atob(idToken.split('.')[1]));
              const expiresAt = (idTokenPayload.exp || Math.floor(Date.now() / 1000) + 3600) * 1000;

              const tokens: AuthTokens = {
                accessToken,
                idToken,
                refreshToken,
                expiresAt,
              };

              await this.storeTokens(tokens);
              resolve(tokens);
            } catch (error) {
              reject(createAppError('AUTH_ERROR', 'Failed to process refreshed tokens', error));
            }
          });
        } else {
          // Session is still valid, just return current tokens
          try {
            const accessToken = session.getAccessToken().getJwtToken();
            const idToken = session.getIdToken().getJwtToken();
            const refreshToken = session.getRefreshToken().getToken();

            const idTokenPayload = JSON.parse(atob(idToken.split('.')[1]));
            const expiresAt = (idTokenPayload.exp || Math.floor(Date.now() / 1000) + 3600) * 1000;

            const tokens: AuthTokens = {
              accessToken,
              idToken,
              refreshToken,
              expiresAt,
            };

            await this.storeTokens(tokens);
            resolve(tokens);
          } catch (error) {
            reject(createAppError('AUTH_ERROR', 'Failed to get current session', error));
          }
        }
      });
    });
  }

  // Forgot password
  async forgotPassword(email: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.forgotPassword({
        onSuccess: () => {
          resolve();
        },
        onFailure: (err: any) => {
          reject(createAppError('AUTH_ERROR', 'Failed to send password reset code.', err));
        },
      });
    });
  }

  // Reset password with code
  async resetPassword(data: { email: string; code: string; newPassword: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: data.email,
        Pool: userPool,
      });

      cognitoUser.confirmPassword(data.code, data.newPassword, {
        onSuccess: () => {
          resolve();
        },
        onFailure: (err: any) => {
          reject(createAppError('AUTH_ERROR', 'Failed to reset password. Please check your code.', err));
        },
      });
    });
  }

  // Change password (when logged in)
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cognitoUser = userPool.getCurrentUser();
      
      if (!cognitoUser) {
        reject(createAppError('AUTH_ERROR', 'No user session found'));
        return;
      }

      cognitoUser.getSession((err: any, session: any) => {
        if (err || !session.isValid()) {
          reject(createAppError('AUTH_ERROR', 'Session expired. Please log in again.'));
          return;
        }

        cognitoUser.changePassword(oldPassword, newPassword, (changeErr: any) => {
          if (changeErr) {
            reject(createAppError('AUTH_ERROR', 'Failed to change password.', changeErr));
            return;
          }
          resolve();
        });
      });
    });
  }

  // Get current user from stored tokens
  async getCurrentUser(): Promise<User | null> {
    try {
      const tokens = await this.getStoredTokens();
      if (!tokens?.idToken) {
        return null;
      }

      // Check if token is expired
      if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
        // Try to refresh tokens
        try {
          const newTokens = await this.refreshTokens();
          return this.getUserFromIdToken(newTokens.idToken);
        } catch (error) {
          // Refresh failed, clear tokens
          await this.clearStoredTokens();
          return null;
        }
      }

      return this.getUserFromIdToken(tokens.idToken);
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
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

      // Also verify with Cognito
      const cognitoUser = userPool.getCurrentUser();
      if (!cognitoUser) {
        return false;
      }

      return new Promise((resolve) => {
        cognitoUser.getSession((err: any, session: any) => {
          resolve(!err && session && session.isValid());
        });
      });
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
