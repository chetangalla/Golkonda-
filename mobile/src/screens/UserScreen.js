import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { MapPin, Navigation, Volume2, Music, Footprints, Play, ChevronRight, CornerUpRight, ArrowUpCircle, Mic } from 'lucide-react-native';
import { getTargets, getExhibits, getGpsDirections, logout } from '../utils/dataStore';
import { calculateDistance } from '../utils/geo';
import { resolvePlayableUri } from '../utils/audioSource';
import { colors, radius, shadow } from '../theme';

const AUTO_PLAY_DISTANCE = 7;
const COOLDOWN_PERIOD    = 60000;
const WALKING_THRESHOLD  = 0.3; // Accel magnitude difference from 1g
const WALKING_DURATION   = 5000; // 5 seconds of walking

export default function UserScreen({ route, navigation }) {
  const { monumentId } = route.params || {};
  const [mode, setMode] = useState('gps'); // 'gps' | 'indoor'

  // GPS State
  const [targets, setTargets] = useState([]);
  const [currentLoc, setCurrentLoc] = useState(null);
  const [currentFloor, setCurrentFloor] = useState(1);

  // Indoor State
  const [exhibits, setExhibits] = useState([]);
  const [indoorIndex, setIndoorIndex] = useState(0);
  const [activeGpsId, setActiveGpsId] = useState(null);
  const [gpsDirections, setGpsDirections] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Common State
  const [errorMsg, setErrorMsg] = useState('');
  const [nowPlaying, setNowPlaying] = useState(null);

  // Verification State
  const [verificationState, setVerificationState] = useState('idle'); // 'idle' | 'delaying' | 'speaking' | 'listening'
  const [delayCountdown, setDelayCountdown] = useState(0);

  // Refs
  const lastPlayedRef = useRef({});
  const clearedRef    = useRef({});
  const playedOnceRef = useRef({});
  const prevLocRef    = useRef(null);
  const soundRef      = useRef(null);

  // Indoor Refs
  const indoorIndexRef = useRef(0);
  const exhibitsRef   = useRef([]);
  const currentFloorRef = useRef(1);
  const countdownIntervalRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAudioTypeRef = useRef(null);
  const directionTimeoutsRef = useRef([]);
  const gpsDirectionsRef = useRef([]);

  const modeRef = useRef('gps');
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { gpsDirectionsRef.current = gpsDirections; }, [gpsDirections]);

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
    if (!dataLoaded) return;
    if (mode === 'gps') {
      startTracking();
    } else {
      stopTracking();
    }
  }, [mode, dataLoaded]);

  const loadData = async () => {
    const tData = await getTargets();
    // Filter GPS targets strictly by the physical Monument they selected
    const filteredTargets = monumentId ? tData.filter(t => t.parentMonumentId === monumentId) : tData;
    setTargets(filteredTargets);

    const eData = await getExhibits();
    setExhibits(eData);

    const dirData = await getGpsDirections();
    setGpsDirections(dirData);
    setDataLoaded(true);
  };

  const stopAll = async () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    directionTimeoutsRef.current.forEach(clearTimeout);
    directionTimeoutsRef.current = [];
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    currentAudioTypeRef.current = null;

    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
    setNowPlaying(null);
    Speech.stop();
  };

  const playAudio = (url, name, onFinish = null, delaySeconds = 0, type = 'general') => {
    audioQueueRef.current.push({ url, name, onFinish, delaySeconds, type });
    processQueue();
  };

  const processQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const { url, name, onFinish, delaySeconds, type } = audioQueueRef.current.shift();
    currentAudioTypeRef.current = type;

    const finishItem = () => {
       isPlayingRef.current = false;
       if (onFinish) onFinish();
       processQueue();
    };

    const play = async () => {
      if (!url) {
        if (delaySeconds > 0) {
          setVerificationState('delaying');
          setDelayCountdown(delaySeconds);
          let timeLeft = delaySeconds;
          countdownIntervalRef.current = setInterval(() => {
            timeLeft -= 1;
            setDelayCountdown(timeLeft);
            if (timeLeft <= 0) {
              clearInterval(countdownIntervalRef.current);
              setVerificationState('idle');
              finishItem();
            }
          }, 1000);
        } else {
          finishItem();
        }
        return;
      }

      setNowPlaying(name);
      try {
        const playableUri = await resolvePlayableUri(url);
        const { sound } = await Audio.Sound.createAsync({ uri: playableUri }, { shouldPlay: true });

        // If stopAll was called while audio was loading, isPlayingRef will be false
        if (!isPlayingRef.current) {
           try { await sound.unloadAsync(); } catch(e) {}
           return;
        }

        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(async status => {
          if (status.didJustFinish) {
            try { await sound.unloadAsync(); } catch(e) {}
            setNowPlaying(null);

            if (delaySeconds > 0) {
              setVerificationState('delaying');
              setDelayCountdown(delaySeconds);
              let timeLeft = delaySeconds;
              countdownIntervalRef.current = setInterval(() => {
                timeLeft -= 1;
                setDelayCountdown(timeLeft);
                if (timeLeft <= 0) {
                  clearInterval(countdownIntervalRef.current);
                  setVerificationState('idle');
                  finishItem();
                }
              }, 1000);
            } else {
              finishItem();
            }
          }
        });
      } catch (err) {
        console.warn('Audio play error:', err);
        setNowPlaying(null);
        finishItem();
      }
    };

    play();
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
            const filteredTargets = monumentId ? latestTargets.filter(t => t.parentMonumentId === monumentId) : latestTargets;
            setTargets(filteredTargets);
            checkProximity(lat, lng, filteredTargets);
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
    const sortedTargets = [...latestTargets].sort((a,b) => {
      const orderA = a.orderIndex || 0;
      const orderB = b.orderIndex || 0;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.id).localeCompare(String(b.id));
    });

    sortedTargets.forEach(async target => {
      // Must match explicit current floor (coerce both to strings to prevent legacy data type mismatches)
      if (String(target.floor || 1) !== String(currentFloorRef.current)) return;

      const targetRadius = target.triggerRadius ? Number(target.triggerRadius) : AUTO_PLAY_DISTANCE;
      const d = calculateDistance(lat, lng, target.lat, target.lng);
      let shouldTrigger = false;
      if (d <= targetRadius) shouldTrigger = true;
      else if (prevLocRef.current) {
        const prevDist = calculateDistance(prevLocRef.current.lat, prevLocRef.current.lng, target.lat, target.lng);
        if (prevDist <= targetRadius) shouldTrigger = true;
      }

      if (!shouldTrigger) return;

      if (playedOnceRef.current[target.id]) return;
      playedOnceRef.current[target.id] = true;

      // Preempt any currently queued or playing directions because a new target took priority
      audioQueueRef.current = audioQueueRef.current.filter(item => item.type !== 'direction');
      if (currentAudioTypeRef.current === 'direction') {
        if (countdownIntervalRef.current) {
           clearInterval(countdownIntervalRef.current);
           setVerificationState('idle');
        }
        if (soundRef.current) {
           try { await soundRef.current.unloadAsync(); soundRef.current = null; } catch(e) {}
        }
        setNowPlaying(null);
        isPlayingRef.current = false;
        currentAudioTypeRef.current = null;
      }

      // Check if this GPS target contains any inside indoor exhibits
      const hasIndoorTour = exhibitsRef.current.some(e => e.parentGpsId === target.id);
      const targetDirections = gpsDirectionsRef.current.filter(d => d.parentGpsId === target.id);

      playAudio(null, 'Settle GPS...', null, 2, 'target');

      playAudio(target.audioUrl, target.name, () => {
        if (hasIndoorTour) {
          setMode('indoor');
          setActiveGpsId(target.id);
          const f = Number(target.floor || 1);
          setCurrentFloor(f);
          currentFloorRef.current = f;
          setIndoorIndex(0);
          indoorIndexRef.current = 0;
          Speech.speak("Please go inside to start your indoor tour.", {
            onDone: () => {
              const currentFloorExhibits = exhibitsRef.current.filter(e => String(e.floor || 1) === String(f) && e.parentGpsId === target.id);
              if (currentFloorExhibits.length > 0) {
                startExhibitFlow(currentFloorExhibits[0]);
              }
            }
          });
        }
      });

      targetDirections.forEach(dir => {
        playAudio(null, 'Lagging...', null, 2, 'direction');
        playAudio(dir.audioUrl, dir.name, null, Number(dir.delaySeconds) || 0, 'direction');
      });
    });
  };

  // ==============================
  // INDOOR TOUR LOGIC
  // ==============================

  const autoPlayNext = () => {
    if (modeRef.current !== 'indoor') return;
    const currentFloorExhibits = exhibitsRef.current.filter(e => String(e.floor || 1) === String(currentFloorRef.current) && e.parentGpsId === activeGpsId);

    if (indoorIndexRef.current >= currentFloorExhibits.length) return;

    const nextExhibit = currentFloorExhibits[indoorIndexRef.current];
    if (nextExhibit) {
      startExhibitFlow(nextExhibit);
    }
  };

  const triggerPlayback = (exhibit) => {
    // The pause belongs after the audio, not before it — same rule as GPS
    // Directions. Passing it as playAudio's delaySeconds means it runs once
    // this exhibit's own narration finishes, right before advancing.
    const delay = Number(exhibit.delaySeconds || 0);
    playAudio(exhibit.audioUrl, exhibit.name, () => {
       autoPlayNext(); // Auto play next item once audio (and any post-audio delay) finishes
    }, delay);

    if (exhibit.nodeType === 'floor_change') {
      const target = exhibit.targetFloor || currentFloorRef.current + 1;
      setCurrentFloor(target);
      currentFloorRef.current = target;
      setIndoorIndex(0);
      indoorIndexRef.current = 0;
    } else {
      setIndoorIndex(indoorIndexRef.current + 1);
      indoorIndexRef.current = indoorIndexRef.current + 1;
    }
  };

  const startVerificationPrompt = (exhibit) => {
    setVerificationState('speaking');
    Speech.speak(exhibit.verificationPrompt, {
      onDone: () => startListeningSimulation(exhibit)
    });
  };

  const startExhibitFlow = (exhibit) => {
    if (!exhibit) return;
    // Verification ("have you arrived?") still gates playback, since its
    // whole purpose is confirming the visitor is in place before the audio
    // starts. The numeric delay no longer does — see triggerPlayback.
    if (exhibit.verificationPrompt) {
      startVerificationPrompt(exhibit);
    } else {
      triggerPlayback(exhibit);
    }
  };

  const handlePlayNext = () => {
    const currentFloorExhibits = exhibits.filter(e => String(e.floor || 1) === String(currentFloor) && e.parentGpsId === activeGpsId);
    const exhibit = currentFloorExhibits[indoorIndex];
    startExhibitFlow(exhibit);
  };

  const startListeningSimulation = async (exhibit) => {
    setVerificationState('listening');
    // Simulate recording for 3 seconds, then naturally detecting "yes"
    setTimeout(() => {
      // Must check if user hasn't cancelled out
      setVerificationState(prev => {
        if (prev === 'listening') {
          triggerPlayback(exhibit);
          return 'idle';
        }
        return prev;
      });
    }, 3000);
  };

  const manualConfirm = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setVerificationState('idle');
    const currentFloorExhibits = exhibits.filter(e => String(e.floor || 1) === String(currentFloor) && e.parentGpsId === activeGpsId);
    const exhibit = currentFloorExhibits[indoorIndex];
    if (exhibit) {
      Speech.stop();
      triggerPlayback(exhibit);
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
      if (item.nodeType === 'direction') return <CornerUpRight color={isCurrent ? colors.accent : colors.inkMuted} size={20} />;
      if (item.nodeType === 'floor_change') return <ArrowUpCircle color={isCurrent ? colors.violet : colors.inkMuted} size={20} />;
      return <Music color={isCurrent ? colors.success : colors.inkMuted} size={20} />;
    };

    return (
      <TouchableOpacity
        style={[styles.sequenceCard, isCurrent && styles.activeSequenceCard]}
        onPress={() => setIndoorIndex(index)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
          <Text style={{ color: isCurrent ? colors.ink : colors.inkFaint, fontWeight: 'bold' }}>{index + 1}.</Text>
          {getIcon()}
          <View style={{ flex: 1 }}>
            <Text style={[styles.targetName, !isCurrent && !isPast && { color: colors.inkMuted }, isPast && { textDecorationLine: 'line-through', color: colors.inkFaint }]}>{item.name}</Text>
            {item.nodeType === 'floor_change' && <Text style={{ color: colors.violet, fontSize: 12 }}>Jumps to Floor {item.targetFloor}</Text>}
          </View>
        </View>
        <TouchableOpacity onPress={() => playAudio(item.audioUrl, item.name)} style={[styles.miniPlayBtn, isCurrent && { backgroundColor: colors.accent }]}>
          <Volume2 color={isCurrent ? colors.accentInk : colors.ink} size={14} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // ==============================
  // RENDERING
  // ==============================

  const renderGpsItem = ({ item }) => {
    const targetRadius = item.triggerRadius ? Number(item.triggerRadius) : AUTO_PLAY_DISTANCE;
    const dist = currentLoc ? calculateDistance(currentLoc.lat, currentLoc.lng, item.lat, item.lng) : null;
    const isNear = dist !== null && dist <= targetRadius;

    const handleManualPlay = () => {
      const targetDirections = gpsDirectionsRef.current.filter(d => d.parentGpsId === item.id);
      playAudio(item.audioUrl, item.name);
      targetDirections.forEach(dir => {
        playAudio(dir.audioUrl, dir.name, null, Number(dir.delaySeconds) || 0);
      });
    };

    return (
      <View style={[styles.card, isNear && { borderColor: colors.success, borderWidth: 1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.targetName}>{item.name}</Text>
          {dist !== null && <Text style={{ color: isNear ? colors.success : colors.inkMuted, fontSize: 13 }}>{dist < 1000 ? `${dist.toFixed(1)} m away` : `${(dist/1000).toFixed(2)} km away`}</Text>}
        </View>
        <TouchableOpacity onPress={handleManualPlay} style={styles.playBtn}>
          <Volume2 color={colors.accentInk} size={16} />
        </TouchableOpacity>
      </View>
    );
  };

  const currentFloorExhibits = exhibits.filter(e => String(e.floor || 1) === String(currentFloor) && e.parentGpsId === activeGpsId);
  const nextExhibit = currentFloorExhibits[indoorIndex];

  const renderSharedHeader = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>Audio Tour</Text>
        <TouchableOpacity onPress={async () => { stopAll(); setVerificationState('idle'); try { await logout(); } catch (_) {} navigation.replace('Login'); }}>
          <Text style={{ color: colors.danger }}>Exit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, mode === 'gps' && styles.activeTab]} onPress={() => setMode('gps')}>
          <Text style={[styles.tabText, mode === 'gps' && styles.activeTabText]}>GPS Tour</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'indoor' && styles.activeTab]} onPress={() => setMode('indoor')}>
          <Text style={[styles.tabText, mode === 'indoor' && styles.activeTabText]}>Indoor Tour</Text>
        </TouchableOpacity>
      </View>

      {errorMsg ? <Text style={{ color: colors.danger, marginBottom: 10 }}>{errorMsg}</Text> : null}

      {nowPlaying && verificationState === 'idle' && (
        <View style={styles.nowPlayingCard}>
          <Music color={colors.success} size={18} style={{marginRight: 8}}/>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.success, fontWeight: '600', fontSize: 12 }}>Now Playing</Text>
            <Text style={{ color: colors.ink, fontSize: 14 }}>{nowPlaying}</Text>
          </View>
          <TouchableOpacity onPress={stopAll} style={styles.stopBtn}><Text style={{ color: colors.ink, fontSize: 12, fontWeight: '600' }}>Stop</Text></TouchableOpacity>
        </View>
      )}

      {verificationState !== 'idle' && (
        <View style={styles.verificationCard}>
          <View style={styles.pulseDot} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.violet, fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>
              {verificationState === 'delaying' ? 'PAUSED...' : verificationState === 'speaking' ? 'ASKING...' : 'LISTENING...'}
            </Text>
            <Text style={{ color: colors.ink, fontSize: 16 }}>
              {verificationState === 'delaying' ? `Continuing in ${delayCountdown} seconds` :
               verificationState === 'speaking' ? `"${nextExhibit?.verificationPrompt}"` :
               'Say "Yes" to confirm location'}
            </Text>
          </View>
          {verificationState === 'listening' ? (
            <Mic color={colors.violet} size={28} />
          ) : verificationState === 'delaying' ? (
            <Footprints color={colors.violet} size={24} />
          ) : (
            <Volume2 color={colors.violet} size={24} />
          )}
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {mode === 'gps' ? (
        <FlatList
          style={{ flex: 1 }}
          ListHeaderComponent={() => (
            <>
              {renderSharedHeader()}
              <View style={styles.statusCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Navigation color={currentLoc ? colors.success : colors.inkMuted} size={20} />
                  <Text style={styles.statusTitle}> GPS Status</Text>
                </View>
                <Text style={{ color: colors.ink }}>{currentLoc ? `${currentLoc.lat.toFixed(5)}, ${currentLoc.lng.toFixed(5)}` : 'Searching for GPS...'}</Text>

                <View style={styles.floorRow}>
                  <Text style={{color: colors.inkMuted}}>I am on Floor:</Text>
                  <View style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
                     <TouchableOpacity onPress={() => handleFloorChange(-1)} style={styles.floorBtn}><Text style={{color: colors.accentInk, fontWeight:'bold'}}>-</Text></TouchableOpacity>
                     <Text style={{color: colors.ink, fontSize: 18, fontWeight: 'bold', width: 24, textAlign: 'center'}}>{currentFloor}</Text>
                     <TouchableOpacity onPress={() => handleFloorChange(1)} style={styles.floorBtn}><Text style={{color: colors.accentInk, fontWeight:'bold'}}>+</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
              <Text style={styles.subtitle}>Nearby Tour Spots</Text>
            </>
          )}
          data={targets.filter(t => String(t.floor || 1) === String(currentFloorRef.current)).sort((a,b) => {
            if(!currentLoc) return 0;
            return calculateDistance(currentLoc.lat, currentLoc.lng, a.lat, a.lng) - calculateDistance(currentLoc.lat, currentLoc.lng, b.lat, b.lng);
          })}
          keyExtractor={item => item.id}
          ListEmptyComponent={<Text style={{ color: colors.inkMuted }}>No targets available.</Text>}
          renderItem={renderGpsItem}
        />
      ) : !activeGpsId ? (
        <FlatList
          style={{ flex: 1 }}
          ListHeaderComponent={() => (
            <>
              {renderSharedHeader()}
              <View style={styles.indoorCard}>
                <Text style={{ color: colors.ink, fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Select Your Building</Text>
                <Text style={{ color: colors.inkMuted, marginBottom: 16 }}>Which GPS Location are you inside of right now?</Text>
              </View>
            </>
          )}
          data={targets}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => { setActiveGpsId(item.id); setCurrentFloor(Number(item.floor || 1)); setIndoorIndex(0); }}>
              <Text style={styles.targetName}>{item.name}</Text>
              <ChevronRight color={colors.accent} size={20} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ color: colors.danger }}>No buildings available in this monument.</Text>}
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          ListHeaderComponent={() => (
            <>
              {renderSharedHeader()}
              <View style={styles.indoorCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ color: colors.ink, fontSize: 18, fontWeight: 'bold' }}>Floor {currentFloor} Guide</Text>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                     <TouchableOpacity onPress={() => handleFloorChange(-1)} style={styles.floorBtn}><Text style={{color: colors.accentInk, fontWeight:'bold'}}>-</Text></TouchableOpacity>
                     <TouchableOpacity onPress={() => handleFloorChange(1)} style={styles.floorBtn}><Text style={{color: colors.accentInk, fontWeight:'bold'}}>+</Text></TouchableOpacity>
                  </View>
                </View>

                <View style={{padding: 16, backgroundColor: colors.bg, borderRadius: 8, borderColor: nextExhibit?.nodeType === 'direction' ? colors.violet : colors.accent, borderWidth: 1, marginBottom: 16}}>
                  <Text style={{color: nextExhibit?.nodeType === 'direction' ? colors.violet : colors.accent, fontSize: 12, fontWeight: 'bold', marginBottom: 4}}>
                    {nextExhibit?.nodeType === 'direction' ? 'NEXT DIRECTION' : nextExhibit?.nodeType === 'floor_change' ? 'PROCEED TO FLOOR' : 'NEXT EXHIBIT'}
                  </Text>
                  {nextExhibit ? (
                    <>
                      <Text style={{color: colors.ink, fontSize: 20, fontWeight: 'bold', marginBottom: 16}}>{nextExhibit.name}</Text>
                      {verificationState === 'idle' ? (
                        <TouchableOpacity style={styles.actionBtn} onPress={handlePlayNext}>
                          <Play color={colors.ink} size={16} style={{marginRight: 8}}/>
                          <Text style={{color: colors.ink, fontWeight: 'bold'}}>Play & Continue</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.neutral }]} onPress={manualConfirm}>
                          <Text style={{color: colors.ink, fontWeight: 'bold'}}>Click here to confirm</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (
                    <Text style={{color: colors.success, fontSize: 18, fontWeight: 'bold'}}>Floor Complete!</Text>
                  )}
                </View>

                <Text style={{ color: colors.inkMuted, fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>Upcoming Itinerary</Text>
                <TouchableOpacity onPress={() => setActiveGpsId(null)} style={{ marginTop: 12, marginBottom: 12 }}>
                  <Text style={{ color: colors.danger, textDecorationLine: 'underline' }}>Leave this building</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          data={currentFloorExhibits}
          keyExtractor={item => item.id}
          renderItem={renderIndoorItem}
          ListEmptyComponent={<Text style={{ color: colors.danger, textAlign: 'center', marginTop: 20 }}>No guide data for Floor {currentFloor}.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: 0.5 },
  tabContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: colors.cardStrong, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, padding: 12, alignItems: 'center', borderRadius: radius.sm },
  activeTab: { backgroundColor: colors.accent, ...shadow(colors.accent, 0.35) },
  tabText: { color: colors.inkMuted, fontWeight: 'bold', letterSpacing: 0.5 },
  activeTabText: { color: colors.accentInk },
  statusCard: { backgroundColor: colors.card, padding: 20, borderRadius: radius.lg, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  statusTitle: { color: colors.ink, fontWeight: 'bold', fontSize: 16 },
  subtitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  card: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 16, borderRadius: radius.md, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  sequenceCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 16, borderRadius: radius.md, marginBottom: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  activeSequenceCard: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.cardStrong },
  targetName: { color: colors.ink, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  playBtn: { backgroundColor: colors.accent, padding: 12, borderRadius: radius.sm + 2 },
  miniPlayBtn: { backgroundColor: colors.neutral, padding: 10, borderRadius: radius.sm },
  nowPlayingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(62, 139, 103, 0.22)', borderWidth: 1, borderColor: colors.success, padding: 16, borderRadius: radius.md, marginBottom: 16 },
  stopBtn: { backgroundColor: colors.danger, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.sm },
  indoorCard: { backgroundColor: colors.card, padding: 20, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  actionBtn: { flexDirection: 'row', backgroundColor: colors.successStrong, padding: 16, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  floorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  floorBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.sm },
  verificationCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardStrong, borderWidth: 1, borderColor: colors.violet, padding: 16, borderRadius: radius.md, marginBottom: 16, ...shadow(colors.violet, 0.3) },
  pulseDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.violet, marginRight: 12 }
});
