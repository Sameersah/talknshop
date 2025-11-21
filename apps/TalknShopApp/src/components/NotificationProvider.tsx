import React, { createContext, useContext, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { config, NOTIFICATION_CHANNELS } from '@/constants/config';

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  sendPushNotification: (title: string, body: string, data?: any) => Promise<void>;
  scheduleLocalNotification: (title: string, body: string, trigger?: Notifications.NotificationTriggerInput) => Promise<string>;
  cancelNotification: (notificationId: string) => Promise<void>;
  cancelAllNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        // Register token with your backend
        registerTokenWithBackend(token);
      }
    });

    // Listen for notifications received while app is foregrounded
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // Listen for user interactions with notifications
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      // Handle notification tap
      handleNotificationResponse(response);
    });

    return () => {
      // In newer versions of expo-notifications, subscriptions have a remove() method
      if (notificationListener && typeof notificationListener.remove === 'function') {
        notificationListener.remove();
      }
      if (responseListener && typeof responseListener.remove === 'function') {
        responseListener.remove();
      }
    };
  }, []);

  const registerForPushNotificationsAsync = async (): Promise<string | null> => {
    let token: string | null = null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.DEFAULT, {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });

      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.PRICE_ALERTS, {
        name: 'Price Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });

      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.ORDER_UPDATES, {
        name: 'Order Updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });

      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.GENERAL, {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      // Try to get push token - will fail gracefully if projectId is invalid
      token = (await Notifications.getExpoPushTokenAsync()).data;
    } catch (error) {
      // Silently fail for local development when projectId is not configured
      // This is expected when using Expo Go without a valid EAS project
      if (error instanceof Error && error.message.includes('projectId')) {
        console.log('Push notifications disabled - no valid EAS projectId configured');
      } else {
        console.log('Push notifications not available:', error instanceof Error ? error.message : 'Unknown error');
      }
      return null;
    }

    return token;
  };

  const registerTokenWithBackend = async (token: string) => {
    try {
      // Register the push token with your backend
      await fetch(`${config.API_BASE_URL}${config.API_VERSION}/notifications/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
    } catch (error) {
      console.error('Error registering push token:', error);
    }
  };

  const sendPushNotification = async (title: string, body: string, data?: any) => {
    if (!expoPushToken) {
      console.log('No push token available');
      return;
    }

    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  };

  const scheduleLocalNotification = async (
    title: string,
    body: string,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string> => {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
      },
      trigger: trigger || null,
    });

    return notificationId;
  };

  const cancelNotification = async (notificationId: string) => {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  };

  const cancelAllNotifications = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  };

  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const { data } = response.notification.request.content;
    
    // Handle different notification types
    if (data?.type === 'price_alert') {
      // Navigate to product detail
      console.log('Navigate to product:', data.productId);
    } else if (data?.type === 'order_update') {
      // Navigate to order detail
      console.log('Navigate to order:', data.orderId);
    }
  };

  const value: NotificationContextType = {
    expoPushToken,
    notification,
    sendPushNotification,
    scheduleLocalNotification,
    cancelNotification,
    cancelAllNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
