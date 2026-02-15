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
      // Quick check: fetch the M3U to verify the server is reachable
      const url = `http://${trimmedHost}:${portNum}/iptv/channels.m3u`;
      const response = await fetch(url, { method: 'HEAD' });

      if (!response.ok) {
        Alert.alert('Connection failed', `Server returned ${response.status}. Check the address.`);
        setConnecting(false);
        return;
      }

      // Save config and navigate to channel list
      const config: ServerConfig = { host: trimmedHost, port: portNum };
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_CONFIG, JSON.stringify(config));
      router.replace('/channels');
    } catch (error) {
      Alert.alert(
        'Connection failed',
        'Could not reach the server. Check the address and ensure you\'re on the same network.'
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
        <Text style={styles.title}>IPSwitch</Text>
        <Text style={styles.subtitle}>Connect to your ErsatzTV server</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Server Address</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.100"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="8409"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />

          <TouchableOpacity
            style={[styles.button, connecting && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={connecting}
          >
            <Text style={styles.buttonText}>
              {connecting ? 'Connecting...' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>
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
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    backgroundColor: colors.accentDim,
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
});
