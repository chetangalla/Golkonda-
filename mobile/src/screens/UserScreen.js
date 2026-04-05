import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { MapPin, Navigation, Volume2, Music } from 'lucide-react-native';
import { getTargets } from '../utils/dataStore';
import { calculateDistance } from '../utils/geo';

const AUTO_PLAY_DISTANCE = 15;   // metres – auto-trigger audio
const PRELOAD_DISTANCE   = 200;  // metres – start buffering audio
const COOLDOWN_PERIOD    = 60000; // 60 s   – don't re-trigger same location

export default function UserScreen({ navigation }) {
  const [targets, setTargets]       = useState([]);
  const [currentLoc, setCurrentLoc] = useState(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [nowPlaying, setNowPlaying] = useState(null);   // { name }
  const [queueNames, setQueueNames] = useState([]);     // display queue

  // ── Refs (survive re-renders, no stale closure issues) ──────────────────
  const lastPlayedRef  = useRef({});   // targetId → timestamp
  const clearedRef     = useRef({});   // targetId → bool (user left zone)
  const prevLocRef     = useRef(null); // previous GPS fix
  const targetsRef     = useRef([]);   // latest targets without re-sub
  const audioQueueRef  = useRef([]);   // { target, sound } queue
  const isPlayingRef   = useRef(false);
  const preloadedRef   = useRef({});   // targetId → Sound object (preloaded)

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
    });
    loadTargets();
    startTracking();

    return () => {
      // Unload all preloaded sounds on unmount
      Object.values(preloadedRef.current).forEach(s => {
        try { s.unloadAsync(); } catch (_) {}
      });
    };
  }, []);

  const loadTargets = async () => {
    const data = await getTargets();
    setTargets(data);
    targetsRef.current = data;
  };

  // ── Preload audio so it plays instantly ─────────────────────────────────
  const preloadSound = async (target) => {
    if (preloadedRef.current[target.id]) return; // already loaded
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: target.audioUrl },
        { shouldPlay: false }
      );
      preloadedRef.current[target.id] = sound;
    } catch (_) {}
  };

  // ── Sequential queue player ─────────────────────────────────────────────
  const playNext = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setNowPlaying(null);
      setQueueNames([]);
      return;
    }

    isPlayingRef.current = true;
    const { target } = audioQueueRef.current.shift();

    // Update display
    setNowPlaying(target.name);
    setQueueNames(audioQueueRef.current.map(i => i.target.name));

    let sound = preloadedRef.current[target.id];
    try {
      if (sound) {
        await sound.setPositionAsync(0);
      } else {
        const result = await Audio.Sound.createAsync(
          { uri: target.audioUrl },
          { shouldPlay: false }
        );
        sound = result.sound;
        preloadedRef.current[target.id] = sound;
      }

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.setOnPlaybackStatusUpdate(null);
          playNext();
        }
      });

      await sound.playAsync();
    } catch (err) {
      console.warn('Audio playback error:', err);
      playNext(); // skip broken clip, keep queue moving
    }
  };

  const enqueueTargets = (sortedTargets) => {
    const names = sortedTargets.map(t => t.name);
    audioQueueRef.current.push(...sortedTargets.map(t => ({ target: t })));
    setQueueNames(audioQueueRef.current.map(i => i.target.name));

    if (!isPlayingRef.current) {
      playNext();
    }
  };

  const stopAll = async () => {
    audioQueueRef.current = [];
    isPlayingRef.current  = false;
    setNowPlaying(null);
    setQueueNames([]);
    for (const [id, sound] of Object.entries(preloadedRef.current)) {
      try { await sound.stopAsync(); } catch (_) {}
    }
  };

  // ── Proximity check ─────────────────────────────────────────────────────
  const checkProximity = (lat, lng, latestTargets) => {
    const now = Date.now();

    // Preload audio for anything within PRELOAD_DISTANCE
    latestTargets.forEach(t => {
      const d = calculateDistance(lat, lng, t.lat, t.lng);
      if (d <= PRELOAD_DISTANCE) preloadSound(t);
    });

    const toTrigger = [];

    latestTargets.forEach(target => {
      const d = calculateDistance(lat, lng, target.lat, target.lng);

      // ── Fast-crossing detection ────────────────────────────────────────
      // If GPS updated after the user already passed through, check the
      // previous position was inside the zone.
      let shouldTrigger = false;
      if (d <= AUTO_PLAY_DISTANCE) {
        shouldTrigger = true;
      } else if (prevLocRef.current) {
        const prevDist = calculateDistance(
          prevLocRef.current.lat, prevLocRef.current.lng,
          target.lat, target.lng
        );
        if (prevDist <= AUTO_PLAY_DISTANCE) {
          shouldTrigger = true; // was inside on last fix → fast crossing
        }
      }

      if (!shouldTrigger) {
        // User has left the zone – reset the gate so re-entry triggers again
        clearedRef.current[target.id] = true;
        return;
      }

      // Respect cooldown
      const lastPlayed = lastPlayedRef.current[target.id] || 0;
      if (now - lastPlayed < COOLDOWN_PERIOD) return;

      // Must have left and re-entered (or first visit)
      if (lastPlayed > 0 && !clearedRef.current[target.id]) return;

      toTrigger.push({ target, d });
    });

    if (toTrigger.length === 0) return;

    // Sort nearest first
    toTrigger.sort((a, b) => a.d - b.d);

    // Mark all as triggered immediately to prevent double-fire
    toTrigger.forEach(({ target }) => {
      lastPlayedRef.current[target.id] = now;
      clearedRef.current[target.id]    = false;
    });

    enqueueTargets(toTrigger.map(({ target }) => target));
  };

  // ── GPS watcher ─────────────────────────────────────────────────────────
  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Permission to access location was denied');
      return;
    }

    try {
      await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 1,    // update every 1 metre moved
          timeInterval: 1000,     // or every 1 second, whichever comes first
        },
        (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          setCurrentLoc({ lat, lng });

          // Fetch latest targets each update so admin changes are reflected
          getTargets().then((latestTargets) => {
            targetsRef.current = latestTargets;
            setTargets(latestTargets);
            checkProximity(lat, lng, latestTargets);
            prevLocRef.current = { lat, lng };
          });
        }
      );
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // ── Manual play ─────────────────────────────────────────────────────────
  const triggerManual = async (target) => {
    try {
      let sound = preloadedRef.current[target.id];
      if (sound) {
        await sound.setPositionAsync(0);
        await sound.playAsync();
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: target.audioUrl },
          { shouldPlay: true }
        );
        preloadedRef.current[target.id] = newSound;
      }
    } catch (err) {
      console.warn('Manual play error:', err);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  // Sort targets by distance for display (nearest first)
  const sortedTargets = [...targets].map(t => ({
    ...t,
    dist: currentLoc ? calculateDistance(currentLoc.lat, currentLoc.lng, t.lat, t.lng) : null,
  })).sort((a, b) => {
    if (a.dist === null) return 1;
    if (b.dist === null) return -1;
    return a.dist - b.dist;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Audio Tour</Text>
        <TouchableOpacity onPress={() => { stopAll(); navigation.replace('Login'); }}>
          <Text style={{ color: '#ef4444' }}>Exit</Text>
        </TouchableOpacity>
      </View>

      {errorMsg ? <Text style={{ color: 'red', marginBottom: 10 }}>{errorMsg}</Text> : null}

      {/* Now Playing Banner */}
      {nowPlaying && (
        <View style={styles.nowPlayingCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Music color="#10b981" size={18} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#10b981', fontWeight: '600', fontSize: 14 }}>Now Playing</Text>
              <Text style={{ color: '#f8fafc', fontSize: 13 }}>{nowPlaying}</Text>
              {queueNames.length > 0 && (
                <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                  Next: {queueNames.join(' → ')}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={stopAll} style={styles.stopBtn}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* GPS Status */}
      <View style={styles.statusCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Navigation color={currentLoc ? '#10b981' : '#94a3b8'} size={20} />
          <Text style={styles.statusTitle}> GPS Status</Text>
          {currentLoc && <Text style={{ color: '#10b981', fontSize: 12, marginLeft: 8 }}>● Live</Text>}
        </View>
        <Text style={{ color: '#f8fafc' }}>
          {currentLoc
            ? `${currentLoc.lat.toFixed(5)}, ${currentLoc.lng.toFixed(5)}`
            : 'Searching for GPS...'}
        </Text>
      </View>

      {/* Targets list – sorted nearest first */}
      <Text style={styles.subtitle}>Nearby Tour Spots</Text>
      <FlatList
        data={sortedTargets}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={{ color: '#94a3b8' }}>No targets available.</Text>}
        renderItem={({ item, index }) => {
          const isNear = item.dist !== null && item.dist <= AUTO_PLAY_DISTANCE * 2;
          const isNearest = index === 0 && item.dist !== null;

          return (
            <View style={[
              styles.targetCard,
              isNear && { borderColor: '#10b981', borderWidth: 1 },
            ]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin color={isNear ? '#10b981' : '#94a3b8'} size={14} />
                  <Text style={styles.targetName}>{item.name}</Text>
                  {isNearest && (
                    <Text style={{ color: '#3b82f6', fontSize: 10, fontWeight: '600' }}>NEAREST</Text>
                  )}
                </View>
                {item.dist !== null && (
                  <Text style={{ color: isNear ? '#10b981' : '#94a3b8', fontSize: 13, marginTop: 2 }}>
                    {item.dist < 1000
                      ? `${item.dist.toFixed(1)} m away`
                      : `${(item.dist / 1000).toFixed(2)} km away`}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => triggerManual(item)} style={styles.playBtn}>
                <Volume2 color="#fff" size={16} />
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 40 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:          { fontSize: 24, fontWeight: 'bold', color: '#f8fafc' },
  statusCard:     { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 24 },
  statusTitle:    { color: '#f8fafc', fontWeight: '600', fontSize: 16 },
  subtitle:       { fontSize: 18, fontWeight: '600', color: '#f8fafc', marginBottom: 16 },
  targetCard:     { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: 16, borderRadius: 8, marginBottom: 12, alignItems: 'center' },
  targetName:     { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  playBtn:        { backgroundColor: '#3b82f6', padding: 10, borderRadius: 8 },
  nowPlayingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#064e3b', borderWidth: 1, borderColor: '#10b981', padding: 12, borderRadius: 10, marginBottom: 16 },
  stopBtn:        { backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
});
