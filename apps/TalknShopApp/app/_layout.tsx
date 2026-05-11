import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistGate } from 'redux-persist/integration/react';
import {
  useFonts as useGeistFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import {
  GeistMono_500Medium,
  GeistMono_600SemiBold,
} from '@expo-google-fonts/geist-mono';
import { store, persistor } from '@/store';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { NotificationProvider } from '@/components/NotificationProvider';
import { useTheme } from '@/hooks/useTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
    },
  },
});

function RootLayoutContent() {
  const { colors } = useTheme();
  
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </Stack>
      <StatusBar style="light" />
    </View>
  );
}

export default function RootLayout() {
  // Geist + Geist Mono power the entire typographic system. If they fail to
  // load we still render — RN falls back to system font, so worst case is
  // momentarily-uglier text on first launch.
  const [fontsLoaded] = useGeistFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
  });

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <NotificationProvider>
                {fontsLoaded ? (
                  <RootLayoutContent />
                ) : (
                  // Tiny "splash" window — usually < 200ms. Pure-color view
                  // avoids a flash of system font on a near-black canvas.
                  <View style={{ flex: 1, backgroundColor: '#0A0A0F' }} />
                )}
              </NotificationProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  );
}
