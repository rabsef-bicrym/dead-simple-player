import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { colors, spacing, fontSize } from '../src/constants/theme';
import type { SavedServer } from '../src/types';

/**
 * Settings screen — manage saved ErsatzTV server configurations.
 *
 * Shows all saved servers with the active one highlighted. Allows:
 * - Tapping a server row to set it as active
 * - Editing server details inline (pencil icon)
 * - Deleting servers with confirmation (trash icon)
 * - Adding new servers (navigates to setup)
 */
export default function SettingsScreen() {
  const {
    activeServer,
    servers,
    loading,
    setActiveServer,
    updateServer,
    deleteServer,
  } = useServerConfig();

  // Inline editing state — only one server can be edited at a time
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHost, setEditHost] = useState('');
  const [editPort, setEditPort] = useState('');

  /** Populate the inline form with a server's current values. */
  const startEditing = useCallback((server: SavedServer) => {
    setEditingId(server.id);
    setEditName(server.name);
    setEditHost(server.host);
    setEditPort(server.port.toString());
  }, []);

  /** Validate and persist inline edits. */
  const saveEditing = useCallback(async () => {
    if (!editingId) return;

    const trimmedHost = editHost.trim();
    if (!trimmedHost) {
      Alert.alert('Missing host', 'Server address is required.');
      return;
    }

    const portNum = parseInt(editPort.trim(), 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      Alert.alert('Invalid port', 'Enter a valid port (1-65535).');
      return;
    }

    await updateServer(editingId, {
      name: editName.trim() || `${trimmedHost}:${portNum}`,
      host: trimmedHost,
      port: portNum,
    });
    setEditingId(null);
  }, [editingId, editName, editHost, editPort, updateServer]);

  /** Discard inline edits. */
  const cancelEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  /** Confirm and delete a server. Navigates to setup if none remain. */
  const handleDelete = useCallback(
    (server: SavedServer) => {
      Alert.alert(
        'Delete Server',
        `Remove "${server.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deleteServer(server.id);
              // If this was the last server, send user to setup
              if (servers.length <= 1) {
                router.replace('/setup');
              }
            },
          },
        ],
      );
    },
    [deleteServer, servers.length],
  );

  /** Tap a non-editing server row to make it active. */
  const handleSelect = useCallback(
    async (server: SavedServer) => {
      if (server.id === activeServer?.id) return;
      await setActiveServer(server.id);
    },
    [activeServer?.id, setActiveServer],
  );

  /** Navigate to setup screen to add a new server. */
  const handleAddServer = useCallback(() => {
    router.push('/setup');
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Servers</Text>

        {servers.map((server) => {
          const isActive = server.id === activeServer?.id;
          const isEditing = server.id === editingId;

          // Inline edit form for this server
          if (isEditing) {
            return (
              <View key={server.id} style={[styles.serverRow, styles.serverRowEditing]}>
                <Text style={styles.editLabel}>Name</Text>
                <TextInput
                  style={styles.editInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Server name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                />
                <Text style={styles.editLabel}>Host</Text>
                <TextInput
                  style={styles.editInput}
                  value={editHost}
                  onChangeText={setEditHost}
                  placeholder="Host address"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Text style={styles.editLabel}>Port</Text>
                <TextInput
                  style={styles.editInput}
                  value={editPort}
                  onChangeText={setEditPort}
                  placeholder="Port"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                />
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.editSave} onPress={saveEditing}>
                    <Text style={styles.editSaveText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editCancel} onPress={cancelEditing}>
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          // Normal server row — tap to select, icons to edit/delete
          return (
            <TouchableOpacity
              key={server.id}
              style={[styles.serverRow, isActive && styles.serverRowActive]}
              onPress={() => handleSelect(server)}
              activeOpacity={0.7}
            >
              <View style={styles.serverInfo}>
                <View style={styles.serverNameRow}>
                  {isActive && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.nowPlaying}
                      style={styles.activeIcon}
                    />
                  )}
                  <Text style={[styles.serverName, isActive && styles.serverNameActive]}>
                    {server.name}
                  </Text>
                </View>
                <Text style={styles.serverHost}>
                  {server.host}:{server.port}
                </Text>
              </View>
              <View style={styles.serverActions}>
                <TouchableOpacity
                  onPress={() => startEditing(server)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.actionButton}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(server)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.actionButton}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        {servers.length === 0 && (
          <Text style={styles.emptyText}>No saved servers</Text>
        )}

        {/* Add server button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddServer}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
          <Text style={styles.addButtonText}>Add Server</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },
  backText: {
    fontSize: fontSize.sm,
    color: colors.accent,
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    minWidth: 80,
  },

  // Scroll content
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },

  // Server rows
  serverRow: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  serverRowActive: {
    borderColor: colors.nowPlaying + '55',
    backgroundColor: colors.nowPlayingDim,
  },
  serverRowEditing: {
    flexDirection: 'column',
    alignItems: 'stretch',
    borderColor: colors.accent + '55',
  },
  serverInfo: {
    flex: 1,
  },
  serverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeIcon: {
    marginRight: spacing.xs,
  },
  serverName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  serverNameActive: {
    color: colors.nowPlaying,
  },
  serverHost: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  serverActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginLeft: spacing.md,
  },
  actionButton: {
    padding: spacing.xs,
  },

  // Inline editing
  editLabel: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  editInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  editSave: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  editSaveText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  editCancel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  editCancelText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Empty state
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },

  // Add button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    marginTop: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent + '44',
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: fontSize.md,
    fontWeight: '500',
    color: colors.accent,
  },
});
