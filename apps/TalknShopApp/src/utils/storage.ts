import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Platform-aware storage utility
 * Uses SecureStore on native platforms, localStorage on web
 */
class Storage {
  private isWeb = Platform.OS === 'web';

  async setItem(key: string, value: string): Promise<void> {
    if (this.isWeb) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error('Error storing item:', error);
        throw error;
      }
    } else {
      try {
        await SecureStore.setItemAsync(key, value);
      } catch (error) {
        console.error('Error storing in SecureStore:', error);
        throw error;
      }
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (this.isWeb) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.error('Error reading from localStorage:', error);
        return null;
      }
    } else {
      try {
        return await SecureStore.getItemAsync(key);
      } catch (error) {
        console.error('Error reading from SecureStore:', error);
        return null;
      }
    }
  }

  async removeItem(key: string): Promise<void> {
    if (this.isWeb) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('Error removing from localStorage:', error);
      }
    } else {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (error) {
        console.error('Error removing from SecureStore:', error);
      }
    }
  }
}

export const storage = new Storage();

