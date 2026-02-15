import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../src/constants/storage';
import { colors, spacing, fontSize } from '../src/constants/theme';
import type { ServerConfig } from '../src/types';

/** First-time setup: user enters ErsatzTV server address. */
export default function SetupScreen() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8409');
  const [connecting, setConnecting] = useState(false);

  // Attempt to connect and validate the server responds with an M3U
  const handleConnect = async () => {
    const trimmedHost = host.trim();
    const trimmedPort = port.trim();

    if (!trimmedHost) {
      Alert.alert('Missing host', 'Enter the ErsatzTV server address.');
      return;
    }

    const portNum = parseInt(trimmedPort, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      Alert.alert('Invalid port', 'Enter a valid port number (1-65535).');
      return;
    }

    setConnecting(true);

    try {
      const url = `http://${trimmedHost}:${portNum}/iptv/channels.m3u`;
      const response = await fetch(url, { method: 'HEAD' });

      if (!response.ok) {
        Alert.alert('Connection failed', `Server returned ${response.status}. Check the address.`);
        setConnecting(false);
        return;
      }

      const config: ServerConfig = { host: trimmedHost, port: portNum };
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_CONFIG, JSON.stringify(config));
      router.replace('/channels');
    } catch (error) {
      Alert.alert(
        'Connection failed',
        'Could not reach the server. Check the address and ensure you\'re on the same network.',
      );
      setConnecting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Branding */}
        <Text style={styles.title}>IPSwitch</Text>
        <Text style={styles.subtitle}>Connect to your ErsatzTV server</Text>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Server Address</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.100 or hostname"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
          />

          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="8409"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleConnect}
          />

          <TouchableOpacity
            style={[styles.button, connecting && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={connecting}
            activeOpacity={0.8}
          >
            {connecting ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator size="small" color={colors.text} />
                <Text style={styles.buttonText}>Connecting...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Connect</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer hint */}
        <Text style={styles.hint}>
          ErsatzTV default port is 8409
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  title: {
    fontSize: fontSize.hero,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: 48,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: fontSize.md,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: {
    backgroundColor: colors.accentDim,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
