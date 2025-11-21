import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/components/AuthProvider';

export default function ProfileScreen() {
  const { colors, typography } = useTheme();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text, ...typography.h1 }]}>
          Profile
        </Text>
        
        <View style={[styles.userInfo, { backgroundColor: colors.surface }]}>
          <Text style={[styles.userName, { color: colors.text, ...typography.h3 }]}>
            {user?.name || 'Guest User'}
          </Text>
          <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
            {user?.email || 'guest@example.com'}
          </Text>
        </View>

        <View style={styles.menu}>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>Notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>Help & Support</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: colors.border }]}>
            <Text style={[styles.menuText, { color: colors.text }]}>About</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: colors.error }]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
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
    padding: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
  },
  userInfo: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  userName: {
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
  },
  menu: {
    flex: 1,
  },
  menuItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  menuText: {
    fontSize: 16,
  },
  logoutButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
