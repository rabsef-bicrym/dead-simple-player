import { useState, useCallback } from 'react';
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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { verifyServerConnection } from '../src/services/iptv';
import { colors, spacing, fontSize } from '../src/constants/theme';
import type { SavedServer } from '../src/types';

/**
 * Server setup screen — add a new ErsatzTV server or select an existing one.
 *
 * Shows a form for adding a new server. If there are already saved servers,
 * they appear above the form so the user can quickly pick one instead.
 */
export default function SetupScreen() {
  const {
    servers,
    loading: configLoading,
    addServer,
    setActiveServer,
  } = useServerConfig();

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8409');
  const [connecting, setConnecting] = useState(false);

  /**
   * Validate the server address, test the connection, and persist the config.
   * On success, navigates to the channels screen.
   */
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

    // Default name to host:port if the user left it blank
    const serverName = name.trim() || `${trimmedHost}:${portNum}`;
    const nextConfig = { host: trimmedHost, port: portNum };

    setConnecting(true);

    try {
      await verifyServerConnection(nextConfig);
      await addServer(serverName, trimmedHost, portNum);
      router.replace('/watch');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Could not reach the server. Check the address and ensure you are on the same network.';
      Alert.alert(
        'Connection failed',
        message,
      );
    } finally {
      setConnecting(false);
    }
  };

  /** Select an existing saved server and navigate to channels. */
  const handleSelectServer = useCallback(
    async (server: SavedServer) => {
      await setActiveServer(server.id);
      router.replace('/watch');
    },
    [setActiveServer],
  );

  if (configLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button — only if there's a previous screen (e.g. came from settings) */}
        {router.canGoBack() && (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.accent} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}

        {/* Branding */}
        <Text style={styles.title}>(×▶×) DS,P</Text>
        <Text style={styles.subtitle}>Connect to your ErsatzTV server</Text>

        {/* Existing saved servers (if any) */}
        {servers.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.sectionLabel}>Saved Servers</Text>
            {servers.map((server) => (
              <TouchableOpacity
                key={server.id}
                style={styles.savedRow}
                onPress={() => handleSelectServer(server)}
                activeOpacity={0.7}
              >
                <View style={styles.savedInfo}>
                  <Text style={styles.savedName}>{server.name}</Text>
                  <Text style={styles.savedHost}>
                    {server.host}:{server.port}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}

            {/* Divider between saved servers and new-server form */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or add a new server</Text>
              <View style={styles.dividerLine} />
            </View>
          </View>
        )}

        {/* New server form */}
        <View style={styles.form}>
          <Text style={styles.label}>Server Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Living Room ETV (optional)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />

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
        <Text style={styles.hint}>ErsatzTV default port is 8409</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.xl,
  },
  backText: {
    fontSize: fontSize.sm,
    color: colors.accent,
    marginLeft: 2,
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

  // Saved servers section
  savedSection: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savedInfo: {
    flex: 1,
  },
  savedName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  savedHost: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
  },

  // Form
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
