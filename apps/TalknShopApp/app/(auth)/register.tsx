import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { useTheme } from '@/hooks/useTheme';

export default function RegisterScreen() {
  const { colors } = useTheme();
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <AuthHeader
          title="Create Account"
          subtitle="Sign up to start shopping with TalknShop"
        />
        <RegisterForm />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
});

