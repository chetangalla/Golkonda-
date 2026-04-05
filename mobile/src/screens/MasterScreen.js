import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { MapPin, Mic, Square, Trash2, Volume2, Footprints } from 'lucide-react-native';
import { getTargets, addTarget, deleteTarget, getExhibits, addExhibit, deleteExhibit } from '../utils/dataStore';

export default function MasterScreen({ navigation }) {
  const [mode, setMode] = useState('gps'); // 'gps' | 'indoor'

  // GPS State
  const [targets, setTargets] = useState([]);
  const [fetchingLoc, setFetchingLoc] = useState(false);
  const [locData, setLocData] = useState(null);

  // Indoor State
  const [exhibits, setExhibits] = useState([]);

  // Shared Form State
  const [name, setName] = useState('');
  const [recording, setRecording] = useState(null);
  const [audioUri, setAudioUri] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
    requestPermissions();
  }, [mode]);

  const requestPermissions = async () => {
    await Audio.requestPermissionsAsync();
    await Location.requestForegroundPermissionsAsync();
  };

  const loadData = async () => {
    if (mode === 'gps') {
      const data = await getTargets();
      setTargets(data);
    } else {
      const data = await getExhibits();
      setExhibits(data);
    }
  };

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {
      Alert.alert('Error', 'Failed to start recording.');
    }
  };

  const stopRecording = async () => {
    setRecording(undefined);
    await recording.stopAndUnloadAsync();
    setAudioUri(recording.getURI());
  };

  const fetchCurrentLocation = async () => {
    setFetchingLoc(true);
    let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocData({ lat: location.coords.latitude, lng: location.coords.longitude });
    setFetchingLoc(false);
  };

  const handleSave = async () => {
    if (!name || !audioUri) {
      Alert.alert('Missing Info', 'Please set name and record audio.');
      return;
    }
    
    if (mode === 'gps' && !locData) {
      Alert.alert('Missing GPS', 'Please get the GPS position.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'gps') {
        const newTarget = await addTarget(name, locData.lat, locData.lng, audioUri);
        setTargets([...targets, newTarget]);
      } else {
        const orderIndex = exhibits.length > 0 ? exhibits[exhibits.length - 1].orderIndex + 1 : 1;
        const newExhibit = await addExhibit(name, audioUri, orderIndex);
        setExhibits([...exhibits, newExhibit]);
      }
      setName('');
      setLocData(null);
      setAudioUri(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to save.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (mode === 'gps') {
      await deleteTarget(id);
      setTargets(targets.filter(t => t.id !== id));
    } else {
      await deleteExhibit(id);
      setExhibits(exhibits.filter(e => e.id !== id));
    }
  };

  const playTestAudio = async (url) => {
    try {
      await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
    } catch (err) {
      Alert.alert('Playback Error', 'Cannot play this audio file.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Panel</Text>
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={{ color: '#ef4444' }}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, mode === 'gps' && styles.activeTab]} onPress={() => setMode('gps')}>
          <Text style={styles.tabText}>GPS Targets</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'indoor' && styles.activeTab]} onPress={() => setMode('indoor')}>
          <Text style={styles.tabText}>Indoor Sequence</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.subtitle}>{mode === 'gps' ? 'New GPS Target' : 'New Indoor Exhibit'}</Text>
        <TextInput style={styles.input} placeholder={mode === 'gps' ? "Location Name" : "Exhibit Name"} placeholderTextColor="#94a3b8" value={name} onChangeText={setName} />

        {mode === 'gps' && (
          <View style={styles.row}>
            <TouchableOpacity style={styles.actionBtn} onPress={fetchCurrentLocation}>
              <MapPin color="#fff" size={16} />
              <Text style={styles.actionBtnText}>
                {fetchingLoc ? "Getting..." : locData ? `GPS: ${locData.lat.toFixed(4)}, ${locData.lng.toFixed(4)}` : "Get Phone GPS"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.row}>
          <TouchableOpacity style={[styles.recordBtn, recording ? styles.recording : null]} onPress={recording ? stopRecording : startRecording}>
            {recording ? <Square color="#fff" size={16} /> : <Mic color="#fff" size={16} />}
            <Text style={styles.actionBtnText}>{recording ? "Stop Recording" : audioUri ? "Re-record Audio" : "Record Audio Voice"}</Text>
          </TouchableOpacity>
          {audioUri && !recording && <Text style={{ color: '#10b981', fontSize: 12 }}>✓ Saved</Text>}
        </View>

        <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save Item</Text>}
        </TouchableOpacity>
      </View>

      <Text style={[styles.subtitle, { marginBottom: 12 }]}>{mode === 'gps' ? 'Database Targets' : 'Indoor Tour Sequence'}</Text>
      <FlatList
        data={mode === 'gps' ? targets : exhibits}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <View style={styles.targetCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {mode === 'indoor' && <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>{index + 1}.</Text>}
                <Text style={styles.targetName}>{item.name}</Text>
              </View>
              {mode === 'gps' && <Text style={{ color: '#94a3b8', fontSize: 12 }}>{item.lat.toFixed(5)}, {item.lng.toFixed(5)}</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity onPress={() => playTestAudio(item.audioUrl)}><Volume2 color="#3b82f6" size={20} /></TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)}><Trash2 color="#ef4444" size={20} /></TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc' },
  subtitle: { fontSize: 18, fontWeight: '600', color: '#f8fafc', marginBottom: 16 },
  tabContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#1e293b', borderRadius: 8, padding: 4 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: '#3b82f6' },
  tabText: { color: '#fff', fontWeight: '600' },
  formCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 24 },
  input: { backgroundColor: '#0f172a', color: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  actionBtn: { flexDirection: 'row', backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, flex: 1, alignItems: 'center', gap: 8 },
  recordBtn: { flexDirection: 'row', backgroundColor: '#8b5cf6', padding: 12, borderRadius: 8, flex: 1, alignItems: 'center', gap: 8 },
  recording: { backgroundColor: '#ef4444' },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  btnPrimary: { backgroundColor: '#10b981', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  targetCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: 16, borderRadius: 8, marginBottom: 12, alignItems: 'center' },
  targetName: { color: '#f8fafc', fontSize: 16, fontWeight: '600' }
});
