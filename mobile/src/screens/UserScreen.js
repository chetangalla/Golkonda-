import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { MapPin, Navigation, Volume2, Music, Footprints, Play, ChevronRight, CornerUpRight, ArrowUpCircle } from 'lucide-react-native';
import { getTargets, getExhibits } from '../utils/dataStore';
import { calculateDistance } from '../utils/geo';

const AUTO_PLAY_DISTANCE = 15;   
const COOLDOWN_PERIOD    = 60000; 
const WALKING_THRESHOLD  = 0.3; // Accel magnitude difference from 1g
const WALKING_DURATION   = 5000; // 5 seconds of walking

export default function UserScreen({ navigation }) {
  const [mode, setMode] = useState('gps'); // 'gps' | 'indoor'

  // GPS State
  const [targets, setTargets] = useState([]);
  const [currentLoc, setCurrentLoc] = useState(null);
  const [currentFloor, setCurrentFloor] = useState(1);
  
  // Indoor State
  const [exhibits, setExhibits] = useState([]);
  const [indoorIndex, setIndoorIndex] = useState(0);

  // Common State
  const [errorMsg, setErrorMsg] = useState('');
  const [nowPlaying, setNowPlaying] = useState(null);

  // Refs
  const lastPlayedRef = useRef({});
  const clearedRef    = useRef({});
  const prevLocRef    = useRef(null);
  const soundRef      = useRef(null);
  
  // Indoor Refs
  const indoorIndexRef = useRef(0);
  const exhibitsRef   = useRef([]);
  const currentFloorRef = useRef(1);

  useEffect(() => {
    indoorIndexRef.current = indoorIndex;
  }, [indoorIndex]);

  useEffect(() => { exhibitsRef.current = exhibits; }, [exhibits]);
  useEffect(() => { currentFloorRef.current = currentFloor; }, [currentFloor]);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false, staysActiveInBackground: true });
    loadData();
    return () => stopAll();
  }, []);

  useEffect(() => {
    stopAll();
    if (mode === 'gps') {
      startTracking();
    } else {
      stopTracking();
    }
  }, [mode]);

  const loadData = async () => {
    const tData = await getTargets();
    setTargets(tData);
    const eData = await getExhibits();
    setExhibits(eData);
  };

  const stopAll = async () => {
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
    setNowPlaying(null);
  };

  const playAudio = async (url, name) => {
    await stopAll();
    setNowPlaying(name);
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.didJustFinish) setNowPlaying(null);
      });
    } catch (err) {
      console.warn('Audio play error:', err);
      setNowPlaying(null);
    }
  };

  // ==============================
  // GPS TOUR LOGIC
  // ==============================
  const locationSub = useRef(null);

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Permission to access location was denied');
      return;
    }

    try {
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 1, timeInterval: 1000 },
        (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          setCurrentLoc({ lat, lng });

          getTargets().then(latestTargets => {
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

  const stopTracking = () => {
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    setCurrentLoc(null);
  };

  const checkProximity = (lat, lng, latestTargets) => {
    const now = Date.now();
    latestTargets.forEach(target => {
      // Must match explicit current floor (coerce both to strings to prevent legacy data type mismatches)
      if (String(target.floor || 1) !== String(currentFloorRef.current)) return;

      const d = calculateDistance(lat, lng, target.lat, target.lng);
      let shouldTrigger = false;
      if (d <= AUTO_PLAY_DISTANCE) shouldTrigger = true;
      else if (prevLocRef.current) {
        const prevDist = calculateDistance(prevLocRef.current.lat, prevLocRef.current.lng, target.lat, target.lng);
        if (prevDist <= AUTO_PLAY_DISTANCE) shouldTrigger = true;
      }

      if (!shouldTrigger) {
        clearedRef.current[target.id] = true;
        return;
      }

      const lastPlayed = lastPlayedRef.current[target.id] || 0;
      if (now - lastPlayed < COOLDOWN_PERIOD) return;
      if (lastPlayed > 0 && !clearedRef.current[target.id]) return;

      lastPlayedRef.current[target.id] = now;
      clearedRef.current[target.id] = false;
      playAudio(target.audioUrl, target.name);
    });
  };

  // ==============================
  // INDOOR TOUR LOGIC
  // ==============================

  const handlePlayNext = () => {
    const currentFloorExhibits = exhibits.filter(e => String(e.floor || 1) === String(currentFloor));
    const exhibit = currentFloorExhibits[indoorIndex];
    if (exhibit) {
      playAudio(exhibit.audioUrl, exhibit.name);

      if (exhibit.nodeType === 'floor_change') {
        const target = exhibit.targetFloor || currentFloor + 1;
        setCurrentFloor(target);
        setIndoorIndex(0);
      } else {
        setIndoorIndex(indoorIndex + 1);
      }
    }
  };

  const handleFloorChange = (delta) => {
    setCurrentFloor(Math.max(1, currentFloor + delta));
    setIndoorIndex(0); // Reset sequence when changing floors
  };

  const renderIndoorItem = ({ item, index }) => {
    const isPast = index < indoorIndex;
    const isCurrent = index === indoorIndex;
    
    const getIcon = () => {
      if (item.nodeType === 'direction') return <CornerUpRight color={isCurrent ? '#3b82f6' : '#94a3b8'} size={20} />;
      if (item.nodeType === 'floor_change') return <ArrowUpCircle color={isCurrent ? '#8b5cf6' : '#94a3b8'} size={20} />;
      return <Music color={isCurrent ? '#10b981' : '#94a3b8'} size={20} />;
    };

    return (
      <TouchableOpacity 
        style={[styles.sequenceCard, isCurrent && styles.activeSequenceCard]} 
        onPress={() => setIndoorIndex(index)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
          <Text style={{ color: isCurrent ? '#f8fafc' : '#64748b', fontWeight: 'bold' }}>{index + 1}.</Text>
          {getIcon()}
          <View style={{ flex: 1 }}>
            <Text style={[styles.targetName, !isCurrent && !isPast && { color: '#94a3b8' }, isPast && { textDecorationLine: 'line-through', color: '#64748b' }]}>{item.name}</Text>
            {item.nodeType === 'floor_change' && <Text style={{ color: '#8b5cf6', fontSize: 12 }}>Jumps to Floor {item.targetFloor}</Text>}
          </View>
        </View>
        <TouchableOpacity onPress={() => playAudio(item.audioUrl, item.name)} style={[styles.miniPlayBtn, isCurrent && { backgroundColor: '#3b82f6' }]}>
          <Volume2 color="#fff" size={14} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ==============================
  // RENDERING
  // ==============================
  
  const renderGpsItem = ({ item }) => {
    const dist = currentLoc ? calculateDistance(currentLoc.lat, currentLoc.lng, item.lat, item.lng) : null;
    const isNear = dist !== null && dist <= AUTO_PLAY_DISTANCE;
    return (
      <View style={[styles.card, isNear && { borderColor: '#10b981', borderWidth: 1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.targetName}>{item.name}</Text>
          {dist !== null && <Text style={{ color: isNear ? '#10b981' : '#94a3b8', fontSize: 13 }}>{dist < 1000 ? `${dist.toFixed(1)} m away` : `${(dist/1000).toFixed(2)} km away`}</Text>}
        </View>
        <TouchableOpacity onPress={() => playAudio(item.audioUrl, item.name)} style={styles.playBtn}>
          <Volume2 color="#fff" size={16} />
        </TouchableOpacity>
      </View>
    );
  };

  const currentFloorExhibits = exhibits.filter(e => String(e.floor || 1) === String(currentFloor));
  const nextExhibit = currentFloorExhibits[indoorIndex];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Audio Tour</Text>
        <TouchableOpacity onPress={() => { stopAll(); navigation.replace('Login'); }}>
          <Text style={{ color: '#ef4444' }}>Exit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, mode === 'gps' && styles.activeTab]} onPress={() => setMode('gps')}>
          <Text style={styles.tabText}>GPS Tour</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'indoor' && styles.activeTab]} onPress={() => setMode('indoor')}>
          <Text style={styles.tabText}>Indoor Tour</Text>
        </TouchableOpacity>
      </View>

      {errorMsg ? <Text style={{ color: 'red', marginBottom: 10 }}>{errorMsg}</Text> : null}

      {nowPlaying && (
        <View style={styles.nowPlayingCard}>
          <Music color="#10b981" size={18} style={{marginRight: 8}}/>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#10b981', fontWeight: '600', fontSize: 12 }}>Now Playing</Text>
            <Text style={{ color: '#f8fafc', fontSize: 14 }}>{nowPlaying}</Text>
          </View>
          <TouchableOpacity onPress={stopAll} style={styles.stopBtn}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Stop</Text></TouchableOpacity>
        </View>
      )}

      {mode === 'gps' ? (
        <>
          <View style={styles.statusCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Navigation color={currentLoc ? '#10b981' : '#94a3b8'} size={20} />
              <Text style={styles.statusTitle}> GPS Status</Text>
            </View>
            <Text style={{ color: '#f8fafc' }}>{currentLoc ? `${currentLoc.lat.toFixed(5)}, ${currentLoc.lng.toFixed(5)}` : 'Searching for GPS...'}</Text>
            
            <View style={styles.floorRow}>
              <Text style={{color: '#94a3b8'}}>I am on Floor:</Text>
              <View style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
                 <TouchableOpacity onPress={() => handleFloorChange(-1)} style={styles.floorBtn}><Text style={{color: '#fff', fontWeight:'bold'}}>-</Text></TouchableOpacity>
                 <Text style={{color: '#fff', fontSize: 18, fontWeight: 'bold', width: 24, textAlign: 'center'}}>{currentFloor}</Text>
                 <TouchableOpacity onPress={() => handleFloorChange(1)} style={styles.floorBtn}><Text style={{color: '#fff', fontWeight:'bold'}}>+</Text></TouchableOpacity>
              </View>
            </View>
          </View>
          <Text style={styles.subtitle}>Nearby Tour Spots</Text>
          <FlatList
            data={targets.filter(t => String(t.floor || 1) === String(currentFloorRef.current)).sort((a,b) => {
              if(!currentLoc) return 0;
              return calculateDistance(currentLoc.lat, currentLoc.lng, a.lat, a.lng) - calculateDistance(currentLoc.lat, currentLoc.lng, b.lat, b.lng);
            })}
            keyExtractor={item => item.id}
            ListEmptyComponent={<Text style={{ color: '#94a3b8' }}>No targets available.</Text>}
            renderItem={renderGpsItem}
          />
        </>
      ) : (
        <>
          <View style={styles.indoorCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: '#f8fafc', fontSize: 18, fontWeight: 'bold' }}>Floor {currentFloor} Guide</Text>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                 <TouchableOpacity onPress={() => handleFloorChange(-1)} style={styles.floorBtn}><Text style={{color: '#fff', fontWeight:'bold'}}>-</Text></TouchableOpacity>
                 <TouchableOpacity onPress={() => handleFloorChange(1)} style={styles.floorBtn}><Text style={{color: '#fff', fontWeight:'bold'}}>+</Text></TouchableOpacity>
              </View>
            </View>

            <View style={{padding: 16, backgroundColor: '#0f172a', borderRadius: 8, borderColor: nextExhibit?.nodeType === 'direction' ? '#8b5cf6' : '#3b82f6', borderWidth: 1, marginBottom: 16}}>
              <Text style={{color: nextExhibit?.nodeType === 'direction' ? '#8b5cf6' : '#3b82f6', fontSize: 12, fontWeight: 'bold', marginBottom: 4}}>
                {nextExhibit?.nodeType === 'direction' ? 'NEXT DIRECTION' : nextExhibit?.nodeType === 'floor_change' ? 'PROCEED TO FLOOR' : 'NEXT EXHIBIT'}
              </Text>
              {nextExhibit ? (
                <>
                  <Text style={{color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginBottom: 16}}>{nextExhibit.name}</Text>
                  <TouchableOpacity style={styles.actionBtn} onPress={handlePlayNext}>
                    <Play color="#fff" size={16} style={{marginRight: 8}}/>
                    <Text style={{color: 'white', fontWeight: 'bold'}}>Play & Continue</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={{color: '#10b981', fontSize: 18, fontWeight: 'bold'}}>Floor Complete!</Text>
              )}
            </View>
            
            <Text style={{ color: '#94a3b8', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>Upcoming Itinerary</Text>
          </View>
          
          <FlatList
            data={currentFloorExhibits}
            keyExtractor={item => item.id}
            renderItem={renderIndoorItem}
            ListEmptyComponent={<Text style={{ color: '#ef4444', textAlign: 'center', marginTop: 20 }}>No guide data for Floor {currentFloor}.</Text>}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc' },
  tabContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#1e293b', borderRadius: 8, padding: 4 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: '#3b82f6' },
  tabText: { color: '#fff', fontWeight: '600' },
  statusCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 20 },
  statusTitle: { color: '#f8fafc', fontWeight: '600', fontSize: 16 },
  subtitle: { fontSize: 18, fontWeight: '600', color: '#f8fafc', marginBottom: 12 },
  card: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: 16, borderRadius: 8, marginBottom: 12, alignItems: 'center' },
  sequenceCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 8, alignItems: 'center' },
  activeSequenceCard: { borderColor: '#3b82f6', borderWidth: 2, backgroundColor: '#0f172a' },
  targetName: { color: '#f8fafc', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  playBtn: { backgroundColor: '#3b82f6', padding: 10, borderRadius: 8 },
  miniPlayBtn: { backgroundColor: '#475569', padding: 8, borderRadius: 6 },
  nowPlayingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#064e3b', borderWidth: 1, borderColor: '#10b981', padding: 12, borderRadius: 10, marginBottom: 16 },
  stopBtn: { backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  indoorCard: { backgroundColor: '#1e293b', padding: 20, borderRadius: 12 },
  actionBtn: { flexDirection: 'row', backgroundColor: '#10b981', padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#1e293b', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  btnPrimary: { flexDirection: 'row', backgroundColor: '#10b981', padding: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  floorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 16 },
  floorBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }
});
