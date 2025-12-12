import { Redirect } from 'expo-router';
import { useAuth } from '@/components/AuthProvider';

export default function Index() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user && !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)" />;
}

