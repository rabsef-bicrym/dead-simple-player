import { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { walnut, brass, amber, cream, fonts } from '../src/constants/ds6';
import { STORAGE_KEYS } from '../src/constants/storage';
import { ServiceLabel, TerminalInput, PlateButton, Lamp } from '../src/components/ds6/Service';
import { setSoundMuted, isSoundMuted, setSignoffTone, getSignoffTone } from '../src/utils/sound';
import { timeToProse } from '../src/utils/prose';
import { useCabinet } from '../src/hooks/useCabinet';
import type { SavedServer } from '../src/types';

/**
 * Settings — the service panel (8b).
 *
 * The little door on the back of the set. The set remembers every
 * aerial it has known; one carries the signal at a time, under the lit
 * jewel. Standbys wait below, and a dashed bay stands ready to wire a
 * new aerial. THE SET ITSELF holds the owner's few adjustments.
 */
export default function SettingsScreen() {
  const { activeServer, servers, loading, setActiveServer, updateServer, deleteServer } = useServerConfig();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHost, setEditHost] = useState('');
  const [editPort, setEditPort] = useState('');
  const [editDifficulty, setEditDifficulty] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [flashStyle, setFlashStyle] = useState<'brief' | 'six'>('brief');
  const [silent, setSilent] = useState(isSoundMuted());
  const [signoff, setSignoff] = useState<'soft' | 'silent'>(getSignoffTone());
  const { isPhone } = useCabinet();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.FLASH_STYLE)
      .then((v) => { if (v === 'six') setFlashStyle('six'); })
      .catch(() => {});
  }, []);

  const startEditing = useCallback((server: SavedServer) => {
    setEditingId(server.id);
    setEditName(server.name);
    setEditHost(server.host);
    setEditPort(server.port.toString());
    setEditDifficulty(null);
    setConfirmRemoveId(null);
  }, []);

  const saveEditing = useCallback(async () => {
    if (!editingId) return;
    const trimmedHost = editHost.trim();
    if (!trimmedHost) {
      setEditDifficulty('The aerial needs an address.');
      return;
    }
    const portNum = parseInt(editPort.trim(), 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setEditDifficulty('That port is not one the set recognises (1–65535).');
      return;
    }
    await updateServer(editingId, {
      name: editName.trim() || `${trimmedHost}:${portNum}`,
      host: trimmedHost,
      port: portNum,
    });
    setEditingId(null);
  }, [editingId, editName, editHost, editPort, updateServer]);

  /** Removal takes two presses — the first asks if you're certain. */
  const handleRemove = useCallback(
    async (server: SavedServer) => {
      if (confirmRemoveId !== server.id) {
        setConfirmRemoveId(server.id);
        return;
      }
      setConfirmRemoveId(null);
      await deleteServer(server.id);
      if (servers.length <= 1) router.replace('/setup');
    },
    [confirmRemoveId, deleteServer, servers.length],
  );

  const handleSwitchOver = useCallback(
    async (server: SavedServer) => {
      if (server.id === activeServer?.id) return;
      await setActiveServer(server.id);
    },
    [activeServer?.id, setActiveServer],
  );

  const toggleFlashStyle = useCallback(() => {
    const next = flashStyle === 'brief' ? 'six' : 'brief';
    setFlashStyle(next);
    AsyncStorage.setItem(STORAGE_KEYS.FLASH_STYLE, next).catch(() => {});
  }, [flashStyle]);

  const toggleSilent = useCallback(() => {
    const next = !silent;
    setSilent(next);
    setSoundMuted(next);
  }, [silent]);

  const toggleSignoff = useCallback(() => {
    const next = signoff === 'soft' ? 'silent' : 'soft';
    setSignoff(next);
    setSignoffTone(next);
  }, [signoff]);

  if (loading) {
    return <View style={styles.cabinet} />;
  }

  const ordered = [...servers].sort((a, b) =>
    a.id === activeServer?.id ? -1 : b.id === activeServer?.id ? 1 : 0,
  );

  return (
    <SafeAreaView style={styles.cabinet} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backRow}>
              <Text style={styles.backKey}>◀</Text>
              <Text style={styles.backText}>BACK TO THE DIAL</Text>
            </Pressable>
            <View style={styles.titleShell}>
              <LinearGradient colors={[walnut.grain, '#231507']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.titleFace}>
                <Text style={styles.titleText}>SERVICE PANEL</Text>
              </LinearGradient>
            </View>
          </View>

          <Text style={styles.lede}>
            The set remembers every aerial it has known. One carries the signal at a time.
          </Text>

          {/* Signal sources */}
          <Text style={styles.sectionHead}>SIGNAL SOURCES</Text>
          {ordered.map((server) => {
            const active = server.id === activeServer?.id;
            const editing = server.id === editingId;

            if (editing) {
              return (
                <LinearGradient key={server.id} colors={['#2b1d10', '#1c1108']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sourceCard}>
                  <ServiceLabel>NAME OF SET</ServiceLabel>
                  <TerminalInput value={editName} onChangeText={setEditName} placeholder="Living Room" autoCapitalize="words" />
                  <View style={{ marginTop: 12 }}>
                    <ServiceLabel>SIGNAL ORIGIN — ADDRESS</ServiceLabel>
                    <TerminalInput mono value={editHost} onChangeText={setEditHost} autoCapitalize="none" keyboardType="url" />
                  </View>
                  <View style={{ marginTop: 12, width: 150 }}>
                    <ServiceLabel>PORT</ServiceLabel>
                    <TerminalInput mono value={editPort} onChangeText={setEditPort} keyboardType="number-pad" />
                  </View>
                  {editDifficulty && <Text style={styles.difficulty}>{editDifficulty}</Text>}
                  <View style={styles.editActions}>
                    <PlateButton label="SAVE" onPress={saveEditing} lit compact />
                    <PlateButton label="LEAVE IT" onPress={() => setEditingId(null)} compact />
                  </View>
                </LinearGradient>
              );
            }

            return (
              <LinearGradient
                key={server.id}
                colors={active ? ['#2b1d10', '#1c1108'] : ['#241708', '#180f07']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.sourceCard}
              >
                <Pressable onPress={() => handleSwitchOver(server)} disabled={active}>
                  <View style={styles.sourceRow}>
                    <Lamp lit={active} size={10} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sourceName, !active && { color: brass.muted }]}>
                        {server.name.toUpperCase()}
                      </Text>
                      <Text style={[styles.sourceHost, !active && { color: '#6e5f4b' }]}>
                        {server.host}:{server.port}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {active ? (
                        <>
                          <Text style={styles.onAir}>ON THE AIR</Text>
                          <Text style={styles.since}>since {timeToProse(new Date(server.lastUsed))}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.standby}>STANDBY</Text>
                          <Text style={styles.switchOver}>⏎ SWITCH OVER</Text>
                        </>
                      )}
                    </View>
                  </View>
                </Pressable>
                <View style={styles.sourceActions}>
                  <Pressable onPress={() => startEditing(server)}>
                    <Text style={styles.actionText}>RELABEL</Text>
                  </Pressable>
                  <Pressable onPress={() => handleRemove(server)}>
                    <Text style={[styles.actionText, styles.actionDim, confirmRemoveId === server.id && styles.actionWarn]}>
                      {confirmRemoveId === server.id ? 'REMOVE — CERTAIN?' : 'REMOVE'}
                    </Text>
                  </Pressable>
                  <Text style={[styles.actionText, styles.actionDim, { marginLeft: 'auto' }]}>
                    {active ? 'IN SERVICE' : ''}
                  </Text>
                </View>
              </LinearGradient>
            );
          })}

          {/* Wire a new aerial */}
          <Pressable onPress={() => router.push('/setup')} style={styles.wireBay}>
            <Text style={styles.wireKey}>+</Text>
            <Text style={styles.wireText}>WIRE A NEW AERIAL</Text>
          </Pressable>

          {/* The set itself */}
          <Text style={styles.sectionHead}>THE SET ITSELF</Text>
          <View style={styles.setRow}>
            <Pressable style={{ flex: 1 }} onPress={toggleFlashStyle}>
              <LinearGradient colors={['#2b1d10', '#1c1108']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.setCard}>
                <Text style={styles.setLabel}>TUNE-IN PLATE</Text>
                <Text style={styles.setValue}>{flashStyle === 'six' ? 'shows for six seconds' : 'shows briefly'}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={toggleSilent}>
              <LinearGradient colors={['#2b1d10', '#1c1108']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.setCard}>
                <Text style={styles.setLabel}>SOUND</Text>
                <Text style={styles.setValue}>{silent ? 'the set is silent' : 'detent & clatter, under the room'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
          <View style={[styles.setRow, { marginTop: 12 }]}>
            <Pressable style={{ flex: 1 }} onPress={toggleSignoff}>
              <LinearGradient colors={['#2b1d10', '#1c1108']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.setCard}>
                <Text style={styles.setLabel}>SIGN-OFF TONE</Text>
                <Text style={styles.setValue}>{signoff === 'soft' ? 'softly, 1 kHz' : 'the night ends silently'}</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <Text style={styles.foot}>
            {isPhone
              ? 'MODEL DS-8/M · SERIAL № 000002 · SERVICED BY ITS OWNER'
              : 'MODEL DS-8 · SERIAL № 000001 · SERVICED BY ITS OWNER'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cabinet: {
    flex: 1,
    backgroundColor: walnut.deep,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  column: {
    width: '100%',
    maxWidth: 560,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backKey: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 11,
    color: brass.bright,
    backgroundColor: walnut.raised,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    overflow: 'hidden',
  },
  backText: {
    fontFamily: fonts.plate,
    fontSize: 9.5,
    letterSpacing: 2.6,
    color: brass.mid,
  },
  titleShell: {
    marginLeft: 'auto',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
  },
  titleFace: {
    borderRadius: 2,
    paddingVertical: 7,
    paddingHorizontal: 22,
  },
  titleText: {
    fontFamily: fonts.plate,
    fontSize: 10,
    letterSpacing: 2.8,
    color: brass.bright,
  },
  lede: {
    fontFamily: fonts.speech,
    fontSize: 14.5,
    color: brass.muted,
    marginTop: 20,
  },
  sectionHead: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 3,
    color: brass.mid,
    marginTop: 26,
    marginBottom: 12,
  },
  sourceCard: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sourceName: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1.8,
    color: cream,
  },
  sourceHost: {
    fontFamily: fonts.flapBold,
    fontSize: 12,
    color: brass.muted,
    marginTop: 3,
  },
  onAir: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 2,
    color: amber.needle,
  },
  since: {
    fontFamily: fonts.speech,
    fontSize: 12,
    color: '#6e5f4b',
    marginTop: 2,
  },
  standby: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 2,
    color: '#6e5f4b',
    textAlign: 'right',
  },
  switchOver: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 1.6,
    color: '#6e5f4b',
    marginTop: 3,
  },
  sourceActions: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.6)',
  },
  actionText: {
    fontFamily: fonts.plate,
    fontSize: 8.5,
    letterSpacing: 2,
    color: brass.mid,
  },
  actionDim: {
    color: '#6e5f4b',
  },
  actionWarn: {
    color: amber.needle,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  difficulty: {
    fontFamily: fonts.speech,
    fontSize: 13,
    color: '#cbba99',
    marginTop: 12,
  },
  wireBay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(223,161,79,0.4)',
    borderRadius: 5,
    paddingVertical: 14,
  },
  wireKey: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 12,
    color: amber.needle,
    backgroundColor: walnut.raised,
    borderWidth: 1,
    borderColor: walnut.void,
    borderRadius: 4,
    width: 20,
    height: 20,
    textAlign: 'center',
    overflow: 'hidden',
  },
  wireText: {
    fontFamily: fonts.plate,
    fontSize: 9.5,
    letterSpacing: 2.6,
    color: amber.needle,
  },
  setRow: {
    flexDirection: 'row',
    gap: 12,
  },
  setCard: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  setLabel: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 2,
    color: brass.mid,
  },
  setValue: {
    fontFamily: fonts.speech,
    fontSize: 13.5,
    color: cream,
    marginTop: 5,
  },
  foot: {
    fontFamily: fonts.plate,
    fontSize: 8.5,
    letterSpacing: 2.4,
    color: '#6e5f4b',
    marginTop: 36,
    textAlign: 'center',
  },
});
