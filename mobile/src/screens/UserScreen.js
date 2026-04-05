import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal } from 'react-native';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { Accelerometer } from 'expo-sensors';
import { Camera, CameraView } from 'expo-camera';
import { MapPin, Navigation, Volume2, Music, Camera as CameraIcon, Check, Footprints, Play } from 'lucide-react-native';
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
  
  // Indoor State
  const [exhibits, setExhibits] = useState([]);
  const [indoorIndex, setIndoorIndex] = useState(0); // Which exhibit are we trying to reach next
  const [isWalking, setIsWalking] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);

  // Common State
  const [errorMsg, setErrorMsg] = useState('');
  const [nowPlaying, setNowPlaying] = useState(null);

  // Refs
  const lastPlayedRef = useRef({});
  const clearedRef    = useRef({});
  const prevLocRef    = useRef(null);
  const soundRef      = useRef(null);
  
  // Indoor Refs
  const accelSub      = useRef(null);
  const walkingTime   = useRef(0);
  const lastAccelTime = useRef(Date.now());
  const indoorIndexRef = useRef(0);
  const exhibitsRef   = useRef([]);
  const showPromptRef = useRef(false);
  const showCameraRef = useRef(false);

  useEffect(() => {
    indoorIndexRef.current = indoorIndex;
  }, [indoorIndex]);

  useEffect(() => { exhibitsRef.current = exhibits; }, [exhibits]);
  useEffect(() => { showPromptRef.current = showPrompt; }, [showPrompt]);
  useEffect(() => { showCameraRef.current = showCamera; }, [showCamera]);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false, staysActiveInBackground: true });
    
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasCameraPermission(status === 'granted');
    })();
    
    loadData();

    return () => stopAll();
  }, []);

  useEffect(() => {
    stopAll();
    if (mode === 'gps') {
      startTracking();
      stopAccelerometer();
    } else {
      stopTracking();
      startAccelerometer();
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
  const startAccelerometer = () => {
    Accelerometer.setUpdateInterval(250); 
    accelSub.current = Accelerometer.addListener(data => {
      // Math.abs(gForce - 1g) to find acceleration beyond gravity
      const gForce = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      const isMotion = Math.abs(gForce - 1.0) > 0.15; // Subtle walking threshold
      const now = Date.now();

      if (isMotion) lastAccelTime.current = now;

      // 1.5 second leeway between steps to keep walking state active
      const activeWalking = (now - lastAccelTime.current) < 1500;

      if (activeWalking) {
        if (walkingTime.current === 0) {
          walkingTime.current = now; // Mark start of continuous walk
          setIsWalking(true);
        } else if (now - walkingTime.current > WALKING_DURATION) {
          triggerSmartPrompt();
          walkingTime.current = now; // Reset trigger window to prevent infinite firing
        }
      } else {
        if (walkingTime.current > 0) {
          walkingTime.current = 0;
          setIsWalking(false);
        }
      }
    });
  };

  const stopAccelerometer = () => {
    if (accelSub.current) {
      accelSub.current.remove();
      accelSub.current = null;
    }
  };

  const triggerSmartPrompt = () => {
    // Only trigger if we aren't already prompting and have a next exhibit
    if (
      exhibitsRef.current && 
      exhibitsRef.current.length > indoorIndexRef.current && 
      !showPromptRef.current && 
      !showCameraRef.current
    ) {
      setShowPrompt(true);
    }
  };

  const confirmExhibit = () => {
    setShowPrompt(false);
    setShowCamera(false);
    const exhibit = exhibits[indoorIndex];
    if (exhibit) {
      playAudio(exhibit.audioUrl, exhibit.name);
      setIndoorIndex(indoorIndex + 1);
    }
  };

  // ==============================
  // RENDERING
  // ==============================
  
  const renderGpsItem = ({ item }) => {
    const dist = currentLoc ? calculateDistance(currentLoc.lat, currentLoc.lng, item.lat, item.lng) : null;
    const isNear = dist !== null && dist <= AUTO_PLAY_DISTANCE * 2;
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

  const nextExhibit = exhibits[indoorIndex];
  const previousExhibit = indoorIndex > 0 ? exhibits[indoorIndex - 1] : null;

  if (showCamera) {
    if (!hasCameraPermission) {
      return <View style={styles.container}><Text style={{color:'white'}}>No access to camera</Text></View>;
    }
    return (
      <View style={{flex: 1, backgroundColor: 'black'}}>
        <CameraView style={{flex: 1}} facing="back">
          <View style={{flex: 1, justifyContent: 'flex-end', padding: 20, paddingBottom: 50}}>
            <Text style={{color: 'white', textAlign: 'center', marginBottom: 20, fontSize: 18, fontWeight: 'bold', textShadowColor: 'black', textShadowRadius: 10}}>Point at {nextExhibit?.name}</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={confirmExhibit}>
              <Check color="#fff" size={20} style={{marginRight: 8}}/>
              <Text style={styles.btnText}>Confirm Exhibit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{marginTop: 16, alignItems: 'center'}} onPress={() => setShowCamera(false)}>
              <Text style={{color: '#f8fafc', fontSize: 16}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

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
          </View>
          <Text style={styles.subtitle}>Nearby Tour Spots</Text>
          <FlatList
            data={targets.sort((a,b) => {
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
          <View style={styles.statusCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Footprints color={isWalking ? '#10b981' : '#94a3b8'} size={20} />
              <Text style={styles.statusTitle}> Motion Sensor Tracking</Text>
            </View>
            <Text style={{ color: isWalking ? '#10b981' : '#f8fafc' }}>{isWalking ? 'Walking detected...' : 'Standing still.'}</Text>
          </View>

          <View style={styles.indoorCard}>
            {previousExhibit && (
              <View style={{marginBottom: 16}}>
                <Text style={{color: '#94a3b8', fontSize: 12}}>Previous Exhibit:</Text>
                <Text style={{color: '#cbd5e1', fontSize: 14}}>{previousExhibit.name}</Text>
              </View>
            )}

            <View style={{padding: 16, backgroundColor: '#0f172a', borderRadius: 8, borderColor: '#3b82f6', borderWidth: 1}}>
              <Text style={{color: '#3b82f6', fontSize: 12, fontWeight: 'bold', marginBottom: 4}}>NEXT STOP</Text>
              {nextExhibit ? (
                <>
                  <Text style={{color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginBottom: 16}}>{nextExhibit.name}</Text>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => confirmExhibit()}>
                    <Play color="#fff" size={16} style={{marginRight: 8}}/>
                    <Text style={{color: 'white', fontWeight: 'bold'}}>Manual Play Next</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={{color: '#10b981', fontSize: 18, fontWeight: 'bold'}}>Tour Complete! 🎉</Text>
              )}
            </View>
            
            {indoorIndex > 0 && (
              <TouchableOpacity style={{marginTop: 16, alignSelf: 'center'}} onPress={() => setIndoorIndex(indoorIndex - 1)}>
                <Text style={{color: '#94a3b8'}}>Go Back to Previous</Text>
              </TouchableOpacity>
            )}
            {indoorIndex === 0 && exhibits.length > 0 && (
               <Text style={{color: '#94a3b8', marginTop: 16, textAlign: 'center'}}>Start walking to trigger the first exhibit, or press Manual Play.</Text>
            )}
          </View>
        </>
      )}

      {/* Smart Prompt Modal */}
      <Modal visible={showPrompt} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={{color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginBottom: 8, textAlign: 'center'}}>Are you at {nextExhibit?.name}?</Text>
            <Text style={{color: '#94a3b8', marginBottom: 24, textAlign: 'center'}}>We detected you stopped walking.</Text>
            
            <TouchableOpacity style={styles.btnPrimary} onPress={confirmExhibit}>
              <Play color="#fff" size={18} style={{marginRight: 8}}/>
              <Text style={styles.btnText}>Yes, Play Audio</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btnPrimary, {backgroundColor: '#8b5cf6', marginTop: 12}]} onPress={() => { setShowPrompt(false); setShowCamera(true); }}>
              <CameraIcon color="#fff" size={18} style={{marginRight: 8}}/>
              <Text style={styles.btnText}>Use Camera to Confirm</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{marginTop: 20, padding: 10}} onPress={() => setShowPrompt(false)}>
              <Text style={{color: '#94a3b8', fontSize: 16, textAlign: 'center'}}>Not yet, keep walking</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  targetName: { color: '#f8fafc', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  playBtn: { backgroundColor: '#3b82f6', padding: 10, borderRadius: 8 },
  nowPlayingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#064e3b', borderWidth: 1, borderColor: '#10b981', padding: 12, borderRadius: 10, marginBottom: 16 },
  stopBtn: { backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  indoorCard: { backgroundColor: '#1e293b', padding: 20, borderRadius: 12 },
  actionBtn: { flexDirection: 'row', backgroundColor: '#10b981', padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#1e293b', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  btnPrimary: { flexDirection: 'row', backgroundColor: '#10b981', padding: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
