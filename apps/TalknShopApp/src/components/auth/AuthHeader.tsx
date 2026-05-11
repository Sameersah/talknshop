import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { AuroraOrb } from '@/components/ui';

interface AuthHeaderProps {
  title: string;
  subtitle: string;
}

export const AuthHeader: React.FC<AuthHeaderProps> = ({ title, subtitle }) => {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <AuroraOrb size={72} state="idle" />
      <Text style={[typography.label, { color: colors.textSecondary, marginTop: 12 }]}>
        TALKNSHOP
      </Text>
      <Text
        style={[
          typography.display,
          {
            color: colors.text,
            textAlign: 'center',
            marginTop: 4,
            fontSize: 32,
            lineHeight: 36,
          },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          typography.body,
          {
            color: colors.textSecondary,
            textAlign: 'center',
            marginTop: 8,
            maxWidth: 280,
          },
        ]}
      >
        {subtitle}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 36,
  },
});
