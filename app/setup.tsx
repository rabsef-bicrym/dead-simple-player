import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useServerConfig } from '../src/hooks/useServerConfig';
import { verifyServerConnection } from '../src/services/iptv';
import { walnut, brass, amber, cream, fonts } from '../src/constants/ds6';
import { ServiceLabel, TerminalInput, PlateButton, Lamp } from '../src/components/ds6/Service';
import type { SavedServer } from '../src/types';

/**
 * Setup — the antenna terminals (8a).
 *
 * Before the picture, the aerial. The rear connection panel of the
 * DS-6: name the set if you like, give the signal origin, and the
 * pilot lamp warms when the set finds it. Aerials already wired are
 * offered first.
 */
export default function SetupScreen() {
  const { servers, loading: configLoading, addServer, setActiveServer } = useServerConfig();

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8409');
  const [connecting, setConnecting] = useState(false);
  const [lampLit, setLampLit] = useState(false);
  const [difficulty, setDifficulty] = useState<string | null>(null);

  const handleConnect = async () => {
    const trimmedHost = host.trim();
    const portNum = parseInt(port.trim(), 10);
    if (!trimmedHost) {
      setDifficulty('The set needs an address for the signal origin.');
      return;
    }
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setDifficulty('That port is not one the set recognises (1–65535).');
      return;
    }
    const serverName = name.trim() || `${trimmedHost}:${portNum}`;
    setConnecting(true);
    setDifficulty(null);
    try {
      await verifyServerConnection({ host: trimmedHost, port: portNum });
      await addServer(serverName, trimmedHost, portNum);
      // The lamp warms when the set finds it — let it be seen warming.
      setLampLit(true);
      setTimeout(() => router.replace('/watch'), 700);
    } catch (error) {
      setDifficulty(
        error instanceof Error
          ? error.message
          : 'The set cannot find the signal. Check the address, and that you share a network.',
      );
      setConnecting(false);
    }
  };

  const handleSelectServer = useCallback(
    async (server: SavedServer) => {
      await setActiveServer(server.id);
      router.replace('/watch');
    },
    [setActiveServer],
  );

  if (configLoading) {
    return <View style={styles.cabinet} />;
  }

  return (
    <KeyboardAvoidingView style={styles.cabinet} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {router.canGoBack() && (
            <Pressable onPress={() => router.back()} style={styles.back}>
              <Text style={styles.backText}>◀ BACK TO THE PANEL</Text>
            </Pressable>
          )}

          {/* Masthead */}
          <View style={styles.masthead}>
            <View style={styles.markShell}>
              <LinearGradient colors={[walnut.grain, '#231507']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.markFace}>
                <Text style={styles.markText}>D S , P</Text>
              </LinearGradient>
            </View>
            <Text style={styles.signature}>dead simple, player</Text>
            <Text style={styles.lede}>
              Before the picture, the aerial. Tell the set where your ErsatzTV signal originates.
            </Text>
          </View>

          {/* Aerials already wired */}
          {servers.length > 0 && (
            <View style={styles.wired}>
              <Text style={styles.sectionHead}>AERIALS ALREADY WIRED</Text>
              {servers.map((server) => (
                <Pressable key={server.id} onPress={() => handleSelectServer(server)}>
                  <LinearGradient colors={['#2b1d10', '#1c1108']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.wiredRow}>
                    <Lamp lit={false} size={8} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.wiredName}>{server.name.toUpperCase()}</Text>
                      <Text style={styles.wiredHost}>{server.host}:{server.port}</Text>
                    </View>
                    <Text style={styles.wiredGo}>⏎ USE THIS ONE</Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          )}

          {/* The terminals */}
          <LinearGradient colors={['#2b1d10', '#1c1108']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.terminals}>
            <View style={[styles.screw, { left: 9, top: 9 }]} />
            <View style={[styles.screw, { right: 9, top: 9 }]} />
            <View style={[styles.screw, { left: 9, bottom: 9 }]} />
            <View style={[styles.screw, { right: 9, bottom: 9 }]} />
            <Text style={styles.terminalsHead}>ANTENNA — CONNECTION TERMINALS</Text>

            <View style={{ marginTop: 20 }}>
              <ServiceLabel>NAME OF SET — OPTIONAL</ServiceLabel>
              <TerminalInput value={name} onChangeText={setName} placeholder="Living Room" autoCapitalize="words" returnKeyType="next" />
            </View>
            <View style={{ marginTop: 16 }}>
              <ServiceLabel>SIGNAL ORIGIN — ADDRESS</ServiceLabel>
              <TerminalInput mono value={host} onChangeText={setHost} placeholder="192.168.1.100" autoCapitalize="none" keyboardType="url" returnKeyType="next" />
            </View>
            <View style={styles.portRow}>
              <View style={{ width: 150 }}>
                <ServiceLabel>PORT</ServiceLabel>
                <TerminalInput mono value={port} onChangeText={setPort} placeholder="8409" keyboardType="number-pad" returnKeyType="done" onSubmitEditing={handleConnect} />
              </View>
              <Text style={styles.portNote}>the factory setting; rarely otherwise</Text>
            </View>
          </LinearGradient>

          <View style={styles.connectRow}>
            <PlateButton label={connecting ? 'CONNECTING…' : '⏎  CONNECT'} onPress={handleConnect} lit disabled={connecting} />
          </View>

          <View style={styles.lampRow}>
            <Lamp lit={lampLit} size={7} />
            <Text style={styles.lampText}>SIGNAL — THE LAMP WARMS WHEN THE SET FINDS IT</Text>
          </View>

          {difficulty && <Text style={styles.difficulty}>{difficulty}</Text>}

          <Text style={styles.foot}>MODEL DS-6 · MADE FOR ONE HOUSEHOLD</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingVertical: 54,
    paddingHorizontal: 24,
  },
  column: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: 18,
  },
  backText: {
    fontFamily: fonts.plate,
    fontSize: 9.5,
    letterSpacing: 2.6,
    color: brass.mid,
  },
  masthead: {
    alignItems: 'center',
  },
  markShell: {
    borderRadius: 3,
    borderWidth: 1,
    borderColor: walnut.void,
  },
  markFace: {
    borderRadius: 2,
    paddingVertical: 8,
    paddingHorizontal: 28,
  },
  markText: {
    fontFamily: fonts.plate,
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 4.8,
    color: brass.bright,
  },
  signature: {
    fontFamily: fonts.signature,
    fontSize: 24,
    color: amber.needle,
    transform: [{ rotate: '-2deg' }],
    marginTop: 10,
    textShadowColor: 'rgba(223,161,79,0.35)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  lede: {
    fontFamily: fonts.speech,
    fontSize: 15,
    color: brass.muted,
    marginTop: 22,
    textAlign: 'center',
    maxWidth: 400,
  },
  wired: {
    width: '100%',
    marginTop: 26,
  },
  sectionHead: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 3,
    color: brass.mid,
    marginBottom: 10,
  },
  wiredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  wiredName: {
    fontFamily: fonts.plate,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 1.6,
    color: cream,
  },
  wiredHost: {
    fontFamily: fonts.flapBold,
    fontSize: 11,
    color: brass.muted,
    marginTop: 2,
  },
  wiredGo: {
    fontFamily: fonts.plate,
    fontSize: 8,
    letterSpacing: 2,
    color: '#6e5f4b',
  },
  terminals: {
    width: '100%',
    marginTop: 26,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: walnut.void,
    paddingVertical: 26,
    paddingHorizontal: 30,
  },
  screw: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brass.shadow,
    borderWidth: 0.5,
    borderColor: brass.light,
  },
  terminalsHead: {
    fontFamily: fonts.plate,
    fontSize: 9,
    letterSpacing: 3,
    color: brass.mid,
    textAlign: 'center',
  },
  portRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
    marginTop: 16,
  },
  portNote: {
    fontFamily: fonts.speech,
    fontSize: 12.5,
    color: '#6e5f4b',
    paddingBottom: 12,
  },
  connectRow: {
    marginTop: 30,
  },
  lampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
  },
  lampText: {
    fontFamily: fonts.plate,
    fontSize: 8.5,
    letterSpacing: 2.6,
    color: '#6e5f4b',
  },
  difficulty: {
    fontFamily: fonts.speech,
    fontSize: 13.5,
    color: '#cbba99',
    marginTop: 16,
    textAlign: 'center',
    maxWidth: 400,
  },
  foot: {
    fontFamily: fonts.plate,
    fontSize: 8.5,
    letterSpacing: 2.4,
    color: '#6e5f4b',
    marginTop: 40,
  },
});
