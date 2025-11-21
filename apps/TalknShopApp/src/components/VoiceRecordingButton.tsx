import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Audio } from 'expo-av';

interface VoiceRecordingButtonProps {
  onRecordingComplete?: (uri: string) => void;
  onError?: (error: Error) => void;
}

export const VoiceRecordingButton: React.FC<VoiceRecordingButtonProps> = ({
  onRecordingComplete,
  onError,
}) => {
  const { colors, spacing } = useTheme();
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [rippleAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (isRecording) {
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Ripple animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(rippleAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(rippleAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Recording duration counter
      const interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    } else {
      pulseAnim.setValue(1);
      rippleAnim.setValue(0);
    }
  }, [isRecording]);

  const startRecording = async () => {
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Microphone permission not granted');
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);
    } catch (error) {
      console.error('Failed to start recording', error);
      onError?.(error as Error);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        onRecordingComplete?.(uri);
      }

      setRecording(null);
      setRecordingDuration(0);
    } catch (error) {
      console.error('Failed to stop recording', error);
      onError?.(error as Error);
    }
  };

  const handlePress = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const pulseScale = pulseAnim.interpolate({
    inputRange: [1, 1.2],
    outputRange: [1, 1.2],
  });

  const rippleScale = rippleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.5],
  });

  const rippleOpacity = rippleAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.3, 0],
  });

  return (
    <View style={styles.container}>
      <View style={styles.buttonContainer}>
        {/* Ripple effect */}
        {isRecording && (
          <Animated.View
            style={[
              styles.ripple,
              {
                backgroundColor: colors.error,
                transform: [{ scale: rippleScale }],
                opacity: rippleOpacity,
              },
            ]}
          />
        )}

        {/* Recording button */}
        <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: isRecording ? colors.error : colors.primary,
              },
            ]}
            onPress={handlePress}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isRecording ? 'stop' : 'mic'}
              size={32}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Recording status */}
      {isRecording && (
        <View style={styles.statusContainer}>
          <View style={[styles.indicator, { backgroundColor: colors.error }]} />
          <Text style={[styles.statusText, { color: colors.text }]}>
            Recording... {formatDuration(recordingDuration)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  ripple: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

