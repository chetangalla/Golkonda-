import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, FlatList, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import { MapPin, Mic, Square, Trash2, Volume2, Footprints, Upload, Edit3 } from 'lucide-react-native';
import { getTargets, addTarget, updateTarget, deleteTarget, getExhibits, addExhibit, deleteExhibit, getMonuments, addMonument, deleteMonument, getGpsDirections, addGpsDirection, deleteGpsDirection } from '../utils/dataStore';

export default function MasterScreen({ navigation }) {
  const [mode, setMode] = useState('monument'); // 'monument' | 'gps' | 'indoor'

  // Monument State
  const [monuments, setMonuments] = useState([]);
  const [activeMonumentId, setActiveMonumentId] = useState('');

  // GPS State
  const [targets, setTargets] = useState([]);
  const [fetchingLoc, setFetchingLoc] = useState(false);
  const [locData, setLocData] = useState(null);

  // Indoor State
  const [exhibits, setExhibits] = useState([]);

  // GPS Directions State
  const [gpsDirections, setGpsDirections] = useState([]);

  // Shared Form State
  const [name, setName] = useState('');
  const [floor, setFloor] = useState('1');
  const [nodeType, setNodeType] = useState('exhibit'); // 'exhibit' | 'direction' | 'floor_change'
  const [targetFloor, setTargetFloor] = useState('2');
  const [parentGpsId, setParentGpsId] = useState('');
  const [verificationPrompt, setVerificationPrompt] = useState('');
  const [delaySeconds, setDelaySeconds] = useState('0');
  const [triggerRadius, setTriggerRadius] = useState('7');
  const [targetOrder, setTargetOrder] = useState('0');
  const [recording, setRecording] = useState(null);
  const [audioUri, setAudioUri] = useState(null);
  const [audioName, setAudioName] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadData();
    requestPermissions();
    setEditingId(null);
    setName('');
    setAudioUri(null);
    setAudioName('');
    setTargetOrder('0');
    setLocData(null);
  }, [mode]);

  const requestPermissions = async () => {
    await Audio.requestPermissionsAsync();
    await Location.requestForegroundPermissionsAsync();
  };

  const loadData = async () => {
    const mData = await getMonuments();
    setMonuments(mData);
    if (mData.length > 0) setActiveMonumentId(mData[0].id);

    const tData = await getTargets();
    setTargets(tData);
    if (tData.length > 0) setParentGpsId(tData[0].id);
    
    const eData = await getExhibits();
    setExhibits(eData);

    const dirData = await getGpsDirections();
    setGpsDirections(dirData);
  };

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAudioUri(result.assets[0].uri);
        setAudioName(result.assets[0].name || 'File Selected');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick audio file.');
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
    setAudioName('Recorded Audio');
  };

  const fetchCurrentLocation = async () => {
    setFetchingLoc(true);
    let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocData({ lat: location.coords.latitude, lng: location.coords.longitude });
    setFetchingLoc(false);
  };

  const handleSave = async () => {
    if (!name) {
      Alert.alert('Missing Info', 'Please set a name.');
      return;
    }
    if ((mode === 'gps' || mode === 'indoor') && !audioUri) {
      Alert.alert('Missing Audio', 'Please record audio for this step.');
      return;
    }
    if (mode === 'gps' && !locData && !editingId) {
      Alert.alert('Missing GPS', 'Please get the GPS position.');
      return;
    }

    setLoading(true);
    const parsedFloor = parseInt(floor, 10) || 1;

    try {
      if (mode === 'monument') {
        const newMon = await addMonument(name);
        setMonuments([...monuments, newMon]);
      } else if (mode === 'gps') {
        const parsedOrder = parseInt(targetOrder, 10) || 0;
        if (editingId) {
          const updated = await updateTarget(editingId, { name, triggerRadius: parseInt(triggerRadius, 10) || 7, audioUrl: audioUri, floor: parsedFloor, parentMonumentId: activeMonumentId, orderIndex: parsedOrder, lat: locData.lat, lng: locData.lng });
          setTargets(targets.map(t => t.id === editingId ? updated : t));
        } else {
          const newTarget = await addTarget(name, locData.lat, locData.lng, audioUri, parsedFloor, activeMonumentId, parseInt(triggerRadius, 10) || 7, parsedOrder);
          setTargets([...targets, newTarget]);
        }
      } else if (mode === 'gps_direction') {
        if (!parentGpsId) {
          setLoading(false);
          Alert.alert('Missing Info', 'Please select a GPS target first.');
          return;
        }
        const newDir = await addGpsDirection(name, audioUri, parentGpsId, Number(delaySeconds) || 0);
        setGpsDirections([...gpsDirections, newDir]);
      } else {
        if (!parentGpsId) {
          setLoading(false);
          Alert.alert('Missing Info', 'Please select a GPS target first. If there are none for this monument, create a GPS target first.');
          return;
        }
        const orderIndex = exhibits.length > 0 ? exhibits[exhibits.length - 1].orderIndex + 1 : 1;
        const parsedTargetFloor = parseInt(targetFloor, 10) || 2;
        const newExhibit = await addExhibit(name, audioUri, orderIndex, parsedFloor, nodeType, parsedTargetFloor, parentGpsId, verificationPrompt, Number(delaySeconds) || 0);
        setExhibits([...exhibits, newExhibit]);
      }
      setName('');
      setVerificationPrompt('');
      setDelaySeconds('0');
      setTargetOrder('0');
      setAudioUri(null);
      setAudioName('');
      setEditingId(null);
      setLocData(null);
    } catch (err) {
      Alert.alert('Error', 'Failed to save.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (mode === 'monument') {
      await deleteMonument(id);
      setMonuments(monuments.filter(m => m.id !== id));
    } else if (mode === 'gps') {
      await deleteTarget(id);
      setTargets(targets.filter(t => t.id !== id));
    } else if (mode === 'gps_direction') {
      await deleteGpsDirection(id);
      setGpsDirections(gpsDirections.filter(d => d.id !== id));
    } else {
      await deleteExhibit(id);
      setExhibits(exhibits.filter(e => e.id !== id));
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setName(item.name);
    setAudioUri(item.audioUrl);
    setAudioName(item.audioUrl ? 'Existing Audio File' : '');
    if (mode === 'gps') {
      setTriggerRadius(String(item.triggerRadius || 7));
      setFloor(String(item.floor || 1));
      setActiveMonumentId(item.parentMonumentId);
      setTargetOrder(String(item.orderIndex || 0));
      setLocData({ lat: item.lat, lng: item.lng });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setAudioUri(null);
    setAudioName('');
    setTargetOrder('0');
    setLocData(null);
  };

  const playTestAudio = async (url) => {
    try {
      await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
    } catch (err) {
      Alert.alert('Playback Error', 'Cannot play this audio file.');
    }
  };

  const headerContent = (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Panel</Text>
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={{ color: '#ef4444' }}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, mode === 'monument' && styles.activeTab]} onPress={() => setMode('monument')}>
          <Text style={styles.tabText}>Monuments</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'gps' && styles.activeTab]} onPress={() => setMode('gps')}>
          <Text style={styles.tabText}>GPS Targets</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'gps_direction' && styles.activeTab]} onPress={() => setMode('gps_direction')}>
          <Text style={styles.tabText}>GPS Directions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'indoor' && styles.activeTab]} onPress={() => setMode('indoor')}>
          <Text style={styles.tabText}>Indoor Tour</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={styles.subtitle}>{editingId ? 'Edit Item' : mode === 'monument' ? 'New Monument' : mode === 'gps' ? 'New GPS Target' : mode === 'gps_direction' ? 'New Walking Direction' : 'New Indoor Step'}</Text>
          {editingId && (
            <TouchableOpacity onPress={cancelEdit}>
              <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>Cancel Edit</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {(mode === 'gps' || mode === 'gps_direction' || mode === 'indoor') && monuments.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8, fontWeight: 'bold' }}>BELONGS TO MONUMENT:</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={activeMonumentId}
                style={styles.picker}
                dropdownIconColor="#fff"
                onValueChange={(itemValue) => {
                  setActiveMonumentId(itemValue);
                  const matching = targets.filter(t => t.parentMonumentId === itemValue);
                  setParentGpsId(matching.length > 0 ? matching[0].id : '');
                }}
              >
                {monuments.map(m => (
                  <Picker.Item key={m.id} label={m.name} value={m.id} color="#fff" />
                ))}
              </Picker>
            </View>
          </View>
        )}

        {mode === 'indoor' && (
          <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
            <TouchableOpacity style={[styles.typeBtn, nodeType === 'exhibit' && styles.activeTypeBtn]} onPress={() => setNodeType('exhibit')}><Text style={styles.typeBtnText}>🎨 Exhibit</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, nodeType === 'direction' && styles.activeTypeBtn]} onPress={() => setNodeType('direction')}><Text style={styles.typeBtnText}>➡️ Direct</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, nodeType === 'floor_change' && styles.activeTypeBtn]} onPress={() => setNodeType('floor_change')}><Text style={styles.typeBtnText}>📶 Floor</Text></TouchableOpacity>
          </View>
        )}

        {(mode === 'indoor' || mode === 'gps_direction') && targets.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8, fontWeight: 'bold' }}>BELONGS TO GPS TARGET:</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={parentGpsId}
                style={styles.picker}
                dropdownIconColor="#fff"
                onValueChange={(itemValue) => setParentGpsId(itemValue)}
              >
                {targets.filter(t => t.parentMonumentId === activeMonumentId).map(t => (
                  <Picker.Item key={t.id} label={t.name} value={t.id} color="#fff" />
                ))}
              </Picker>
            </View>
          </View>
        )}

        <TextInput style={styles.input} placeholder={mode === 'monument' ? "Monument Name (e.g. Louvre)" : mode === 'gps' ? "GPS Name" : mode === 'gps_direction' ? "Direction (e.g. Take Left)" : "Instruction / Exhibit Name"} placeholderTextColor="#94a3b8" value={name} onChangeText={setName} />
        
        {mode !== 'monument' && mode !== 'gps_direction' && (
          <TextInput style={styles.input} placeholder="Floor Number (e.g. 1)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={floor} onChangeText={setFloor} />
        )}

        {mode === 'indoor' && nodeType === 'floor_change' && (
          <TextInput style={styles.input} placeholder="Target Floor to Send User To (e.g. 2)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={targetFloor} onChangeText={setTargetFloor} />
        )}

        {mode === 'indoor' && (
          <TextInput style={styles.input} placeholder="Verification Prompt (e.g., Have you reached?)" placeholderTextColor="#94a3b8" value={verificationPrompt} onChangeText={setVerificationPrompt} />
        )}

        {(mode === 'indoor' || mode === 'gps_direction') && (
          <TextInput style={styles.input} placeholder="Walking Delay Before Audio Plays (Seconds)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={delaySeconds} onChangeText={setDelaySeconds} />
        )}

        {mode === 'gps' && (
          <>
            <TextInput style={styles.input} placeholder="Trigger Radius in Meters (e.g. 7)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={triggerRadius} onChangeText={setTriggerRadius} />
            <TextInput style={styles.input} placeholder="Sequence Order (e.g. 1)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={targetOrder} onChangeText={setTargetOrder} />
          </>
        )}

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

        {mode !== 'monument' && (
          <View style={styles.row}>
            <TouchableOpacity style={[styles.recordBtn, recording ? styles.recording : null]} onPress={recording ? stopRecording : startRecording}>
              {recording ? <Square color="#fff" size={16} /> : <Mic color="#fff" size={16} />}
              <Text style={styles.actionBtnText}>{recording ? "Stop Recording" : "Record"}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.recordBtn, { backgroundColor: '#3b82f6' }]} onPress={pickAudio}>
              <Upload color="#fff" size={16} />
              <Text style={styles.actionBtnText}>Upload File</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {audioUri && mode !== 'monument' && <Text style={{ color: '#10b981', fontSize: 13, fontWeight: 'bold', marginBottom: 12 }}>✓ Audio Set: {audioName}</Text>}

        <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{editingId ? "Update Item" : "Save Item"}</Text>}
        </TouchableOpacity>
      </View>

      <Text style={[styles.subtitle, { marginBottom: 12 }]}>{mode === 'monument' ? 'Saved Monuments' : mode === 'gps' ? 'Database Targets' : mode === 'gps_direction' ? 'GPS Directions' : 'Indoor Tour Sequence'}</Text>
    </>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.container}>
        <FlatList
          ListHeaderComponent={headerContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={mode === 'monument' ? monuments : mode === 'gps' ? targets.filter(t=>t.parentMonumentId === activeMonumentId) : mode === 'gps_direction' ? gpsDirections.filter(d=>d.parentGpsId === parentGpsId) : exhibits.filter(e=>targets.find(t=>t.id === e.parentGpsId)?.parentMonumentId === activeMonumentId)}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <View style={styles.targetCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {(mode === 'gps' || mode === 'indoor') && <Text style={{ color: '#8b5cf6', fontWeight: 'bold' }}>F{item.floor || 1}</Text>}
                {mode === 'indoor' && <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                  {index + 1}. {item.nodeType === 'direction' ? '➡️' : item.nodeType === 'floor_change' ? '📶' : '🎨'}
                </Text>}
                {mode === 'gps_direction' && <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>{index + 1}. ➡️</Text>}
                <Text style={styles.targetName}>{item.name}</Text>
              </View>
              {mode === 'gps' && <Text style={{ color: '#94a3b8', fontSize: 12 }}>{item.lat.toFixed(5)}, {item.lng.toFixed(5)} • Rad: {item.triggerRadius || 7}m</Text>}
              {mode === 'indoor' && item.nodeType === 'floor_change' && <Text style={{ color: '#10b981', fontSize: 12 }}>Sends to F{item.targetFloor}</Text>}
              {mode === 'indoor' && <Text style={{ color: '#64748b', fontSize: 12 }}>GPS Match: {targets.find(t => t.id === item.parentGpsId)?.name || 'Unknown'}</Text>}
              {mode === 'gps_direction' && <Text style={{ color: '#10b981', fontSize: 12 }}>Plays after {item.delaySeconds || 0}s delay</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {mode !== 'monument' && <TouchableOpacity onPress={() => playTestAudio(item.audioUrl)}><Volume2 color="#3b82f6" size={20} /></TouchableOpacity>}
              {mode === 'gps' && <TouchableOpacity onPress={() => handleEdit(item)}><Edit3 color="#10b981" size={20} /></TouchableOpacity>}
              <TouchableOpacity onPress={() => handleDelete(item.id)}><Trash2 color="#ef4444" size={20} /></TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
    </KeyboardAvoidingView>
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
  targetName: { color: '#f8fafc', fontSize: 16, fontWeight: '600' },
  typeBtn: { flex: 1, backgroundColor: '#334155', padding: 10, borderRadius: 6, alignItems: 'center' },
  activeTypeBtn: { backgroundColor: '#8b5cf6' },
  typeBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  pickerContainer: { backgroundColor: '#0f172a', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  picker: { color: '#fff', backgroundColor: 'transparent' }
});
