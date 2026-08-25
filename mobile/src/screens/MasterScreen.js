import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, FlatList, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { MapPin, Mic, Square, Trash2, Volume2, Footprints, Upload, Edit3, DownloadCloud, UploadCloud, KeyRound } from 'lucide-react-native';
import { getTargets, addTarget, updateTarget, deleteTarget, getExhibits, addExhibit, deleteExhibit, getMonuments, addMonument, deleteMonument, getGpsDirections, addGpsDirection, updateGpsDirection, deleteGpsDirection, exportAllData, importAllData, generateAccessCode, getAccessCodes, deleteAccessCode } from '../utils/dataStore';
import { showAlert } from '../utils/alert';
import { resolvePlayableUri } from '../utils/audioSource';

export default function MasterScreen({ navigation }) {
  const [mode, setMode] = useState('monument'); // 'monument' | 'gps' | 'indoor'

  // Monument State
  const [monuments, setMonuments] = useState([]);
  const [activeMonumentId, setActiveMonumentId] = useState('');

  // GPS State
  const [targets, setTargets] = useState([]);
  const [fetchingLoc, setFetchingLoc] = useState(false);
  const [locData, setLocData] = useState(null);
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');

  // Indoor State
  const [exhibits, setExhibits] = useState([]);

  // GPS Directions State
  const [gpsDirections, setGpsDirections] = useState([]);

  // Access Codes State — cash-based, time-limited access (see dataStore).
  const [accessCodes, setAccessCodes] = useState([]);
  const [codeDuration, setCodeDuration] = useState('6');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [lastGeneratedCode, setLastGeneratedCode] = useState(null);

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
    setLatText('');
    setLngText('');
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

    const codesData = await getAccessCodes();
    setAccessCodes(codesData);
  };

  const handleGenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const code = await generateAccessCode(codeDuration);
      setLastGeneratedCode(code);
      const codesData = await getAccessCodes();
      setAccessCodes(codesData);
    } catch (err) {
      showAlert('Error', 'Failed to generate a code.');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleDeleteCode = async (code) => {
    await deleteAccessCode(code);
    setAccessCodes(accessCodes.filter(c => c.id !== code));
    if (lastGeneratedCode === code) setLastGeneratedCode(null);
  };

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (Platform.OS === 'web' && asset.file) {
          // The web picker's own .uri is a blob: reference — valid only
          // for this browser tab's lifetime, gone the moment the page
          // reloads, and useless once written into a backup file or
          // restored on another device. Reading it into a data: URI makes
          // it a self-contained string that survives all of that.
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(asset.file);
          });
          setAudioUri(dataUrl);
        } else {
          setAudioUri(asset.uri);
        }
        setAudioName(asset.name || 'File Selected');
      }
    } catch (err) {
      showAlert('Error', 'Failed to pick audio file.');
    }
  };

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {
      showAlert('Error', 'Failed to start recording.');
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
    try {
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocData({ lat: location.coords.latitude, lng: location.coords.longitude });
      setLatText(String(location.coords.latitude));
      setLngText(String(location.coords.longitude));
    } catch (err) {
      showAlert('Location Error', err.message || 'Could not get device GPS. You can type coordinates manually instead.');
    } finally {
      setFetchingLoc(false);
    }
  };

  // Manual coordinate entry — for adding waypoints from a laptop/desk using
  // coordinates already looked up (e.g. off Google Maps), instead of only
  // being able to capture GPS by standing at the spot with a phone.
  const syncManualCoords = (latStr, lngStr) => {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    // Only treat it as a real position once both halves parse — a lone
    // latitude with no longitude yet is not a coordinate.
    setLocData(!isNaN(lat) && !isNaN(lng) ? { lat, lng } : null);
  };

  const handleLatChange = (text) => {
    setLatText(text);
    syncManualCoords(text, lngText);
  };

  const handleLngChange = (text) => {
    setLngText(text);
    syncManualCoords(latText, text);
  };

  const handleSave = async () => {
    if (!name) {
      showAlert('Missing Info', 'Please set a name.');
      return;
    }
    // Directions are often just a pacing/walking cue with nothing to
    // narrate — GPS Directions never required audio, and indoor "Direct"
    // steps shouldn't either. Exhibits and floor changes still do.
    const needsAudio = mode === 'gps' || (mode === 'indoor' && nodeType !== 'direction');
    if (needsAudio && !audioUri) {
      showAlert('Missing Audio', 'Please record audio for this step.');
      return;
    }
    if (mode === 'gps' && !locData && !editingId) {
      showAlert('Missing GPS', 'Type in both latitude and longitude, or tap "Use This Device\'s GPS Instead".');
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
          showAlert('Missing Info', 'Please select a GPS target first.');
          return;
        }
        if (editingId) {
          const updated = await updateGpsDirection(editingId, { name, audioUrl: audioUri, parentGpsId, delaySeconds: Number(delaySeconds) || 0 });
          setGpsDirections(gpsDirections.map(d => d.id === editingId ? updated : d));
        } else {
          const newDir = await addGpsDirection(name, audioUri, parentGpsId, Number(delaySeconds) || 0);
          setGpsDirections([...gpsDirections, newDir]);
        }
      } else {
        if (!parentGpsId) {
          setLoading(false);
          showAlert('Missing Info', 'Please select a GPS target first. If there are none for this monument, create a GPS target first.');
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
      setLatText('');
      setLngText('');
    } catch (err) {
      showAlert('Error', 'Failed to save.');
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
      setLatText(String(item.lat));
      setLngText(String(item.lng));
    } else if (mode === 'gps_direction') {
      setParentGpsId(item.parentGpsId);
      setDelaySeconds(String(item.delaySeconds || 0));
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName('');
    setAudioUri(null);
    setAudioName('');
    setTargetOrder('0');
    setDelaySeconds('0');
    setLocData(null);
    setLatText('');
    setLngText('');
  };

  const playTestAudio = async (url) => {
    try {
      const playableUri = await resolvePlayableUri(url);
      await Audio.Sound.createAsync({ uri: playableUri }, { shouldPlay: true });
    } catch (err) {
      showAlert('Playback Error', 'Cannot play this audio file.');
    }
  };

  // Everything above is stored only on this device. These two let the admin
  // get names/coordinates/tour structure out as a plain JSON file (save to
  // Files, email it, drop it in a cloud drive) and load it back in on any
  // device — so losing this device doesn't mean losing the tour data again.
  // On phones, audio is a local file:// path and isn't portable, so it has
  // to be re-attached per waypoint after a restore. On web, audio picked
  // via Upload File is now stored as a self-contained data: URI (see
  // pickAudio), so it genuinely does travel with the backup — recordings
  // made via the Record button still don't, since expo-av's web recorder
  // hands back a blob: reference the same way.
  const handleBackupExport = async () => {
    try {
      const payload = await exportAllData();
      const json = JSON.stringify(payload, null, 2);
      const fileName = `golkonda-backup-${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === 'web') {
        // expo-file-system and expo-sharing have no web implementation and
        // throw there ("...is not available on web") — the browser's own
        // download mechanism does the exact same job without either.
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showAlert('Backup Saved', `Downloaded as ${fileName} — check your browser's Downloads folder.`);
        return;
      }

      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Save Golkonda backup' });
      } else {
        showAlert('Saved', `Backup written to ${fileUri}`);
      }
    } catch (err) {
      showAlert('Backup Failed', err.message || 'Could not create backup file.');
    }
  };

  const handleBackupImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/*', '*/*'] });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      // Same reasoning as pickAudio: expo-file-system can't read a web
      // blob: URI, but the picker already hands us the real File on web.
      const content = (Platform.OS === 'web' && asset.file)
        ? await asset.file.text()
        : await FileSystem.readAsStringAsync(asset.uri);
      const parsed = JSON.parse(content);

      showAlert(
        'Restore Backup',
        'Add this backup\'s waypoints to what\'s already on this phone (skipping duplicates), or replace everything currently stored here?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge', onPress: () => runImport(parsed, true) },
          { text: 'Replace All', style: 'destructive', onPress: () => runImport(parsed, false) },
        ]
      );
    } catch (err) {
      showAlert('Restore Failed', err.message || 'Could not read that file as a backup.');
    }
  };

  const runImport = async (parsed, merge) => {
    try {
      await importAllData(parsed, { merge });
      await loadData();
      showAlert('Restored', 'Backup loaded. Audio uploaded via "Upload File" on the web app travels with the backup — anything recorded, or uploaded from a phone, is still device-local and needs re-attaching per waypoint.');
    } catch (err) {
      showAlert('Restore Failed', err.message || 'Could not apply that backup.');
    }
  };

  // Picker.Item's color prop only works safely on iOS/Android, where the
  // wheel/popup is genuinely themed by native code. On web, the open
  // dropdown list is rendered by the browser/OS itself, outside our dark
  // theme, and it ignores our transparent background — so it falls back
  // to its own (light) native popup background. Leaving text white there
  // isn't enough: <option> inherits color from the <select> regardless,
  // so it stays white either way unless each option's color is set
  // explicitly, overriding that inheritance with something dark enough
  // to read against a light popup.
  const itemTextColor = Platform.OS === 'web' ? '#111827' : '#fff';

  const headerContent = (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>Admin Panel</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <TouchableOpacity onPress={handleBackupExport} style={{ alignItems: 'center' }}>
            <DownloadCloud color="#3b82f6" size={20} />
            <Text style={{ color: '#3b82f6', fontSize: 10, fontWeight: '600', marginTop: 2 }}>Backup</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBackupImport} style={{ alignItems: 'center' }}>
            <UploadCloud color="#8b5cf6" size={20} />
            <Text style={{ color: '#8b5cf6', fontSize: 10, fontWeight: '600', marginTop: 2 }}>Restore</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.replace('Login')}>
            <Text style={{ color: '#ef4444' }}>Logout</Text>
          </TouchableOpacity>
        </View>
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
        <TouchableOpacity style={[styles.tab, mode === 'access_codes' && styles.activeTab]} onPress={() => setMode('access_codes')}>
          <Text style={styles.tabText}>Codes</Text>
        </TouchableOpacity>
      </View>

      {mode !== 'access_codes' && (
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
                  <Picker.Item key={m.id} label={m.name} value={m.id} color={itemTextColor} />
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
                  <Picker.Item key={t.id} label={t.name} value={t.id} color={itemTextColor} />
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
          <TextInput style={styles.input} placeholder="Pause After Audio Plays, Before Next Step (Seconds)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={delaySeconds} onChangeText={setDelaySeconds} />
        )}

        {mode === 'gps' && (
          <>
            <TextInput style={styles.input} placeholder="Trigger Radius in Meters (e.g. 7)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={triggerRadius} onChangeText={setTriggerRadius} />
            <TextInput style={styles.input} placeholder="Sequence Order (e.g. 1)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={targetOrder} onChangeText={setTargetOrder} />
          </>
        )}

        {mode === 'gps' && (
          <>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8, fontWeight: 'bold' }}>COORDINATES — type them in, or capture from the device:</Text>
            <View style={styles.row}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Latitude (e.g. 17.383054)" placeholderTextColor="#94a3b8" keyboardType="numbers-and-punctuation" value={latText} onChangeText={handleLatChange} />
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Longitude (e.g. 78.401432)" placeholderTextColor="#94a3b8" keyboardType="numbers-and-punctuation" value={lngText} onChangeText={handleLngChange} />
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={styles.actionBtn} onPress={fetchCurrentLocation}>
                <MapPin color="#fff" size={16} />
                <Text style={styles.actionBtnText}>
                  {fetchingLoc ? "Getting..." : "Use This Device's GPS Instead"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
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
      )}

      {mode === 'access_codes' && (
        <View style={styles.formCard}>
          <Text style={styles.subtitle}>Generate Access Code</Text>
          <Text style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
            Give this code to a visitor who's paid in person. It grants that many hours of tour access from the moment they enter it in the app — no payment happens anywhere in the app itself.
          </Text>
          <TextInput style={styles.input} placeholder="Duration in Hours (e.g. 6)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={codeDuration} onChangeText={setCodeDuration} />
          <TouchableOpacity style={styles.btnPrimary} onPress={handleGenerateCode} disabled={generatingCode}>
            {generatingCode ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Generate New Code</Text>}
          </TouchableOpacity>
          {lastGeneratedCode && (
            <View style={styles.codeReveal}>
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>NEW CODE — GIVE THIS TO THE VISITOR</Text>
              <Text style={styles.codeRevealText}>{lastGeneratedCode}</Text>
            </View>
          )}
        </View>
      )}

      <Text style={[styles.subtitle, { marginBottom: 12 }]}>{mode === 'monument' ? 'Saved Monuments' : mode === 'gps' ? 'Database Targets' : mode === 'gps_direction' ? 'GPS Directions' : mode === 'access_codes' ? 'Generated Codes' : 'Indoor Tour Sequence'}</Text>
    </>
  );

  const mainContent = (
    <View style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        ListHeaderComponent={headerContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={mode === 'monument' ? monuments : mode === 'gps' ? targets.filter(t=>t.parentMonumentId === activeMonumentId) : mode === 'gps_direction' ? gpsDirections.filter(d=>d.parentGpsId === parentGpsId) : mode === 'access_codes' ? accessCodes : exhibits.filter(e=>targets.find(t=>t.id === e.parentGpsId)?.parentMonumentId === activeMonumentId)}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => mode === 'access_codes' ? (
          <View style={styles.targetCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <KeyRound color={item.used ? '#64748b' : '#10b981'} size={16} />
                <Text style={[styles.targetName, { letterSpacing: 2 }]}>{item.id}</Text>
              </View>
              <Text style={{ color: item.used ? '#94a3b8' : '#10b981', fontSize: 12, marginTop: 4 }}>
                {item.used ? `Redeemed • ${item.durationHours}h grant` : `Unused • grants ${item.durationHours}h`}
              </Text>
            </View>
            {!item.used && <TouchableOpacity onPress={() => handleDeleteCode(item.id)}><Trash2 color="#ef4444" size={20} /></TouchableOpacity>}
          </View>
        ) : (
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
              {mode === 'gps_direction' && <Text style={{ color: '#10b981', fontSize: 12 }}>Pauses {item.delaySeconds || 0}s after playing</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {mode !== 'monument' && <TouchableOpacity onPress={() => playTestAudio(item.audioUrl)}><Volume2 color="#3b82f6" size={20} /></TouchableOpacity>}
              {(mode === 'gps' || mode === 'gps_direction') && <TouchableOpacity onPress={() => handleEdit(item)}><Edit3 color="#10b981" size={20} /></TouchableOpacity>}
              <TouchableOpacity onPress={() => handleDelete(item.id)}><Trash2 color="#ef4444" size={20} /></TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );

  // KeyboardAvoidingView is a mobile concern (software keyboard covering
  // inputs) and its height-tracking logic actively fights the browser's own
  // layout on web, which is what was breaking scrolling there — so web gets
  // the plain content with an explicit viewport-height anchor instead.
  if (Platform.OS === 'web') {
    return mainContent;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      {mainContent}
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
  picker: { color: '#fff', backgroundColor: 'transparent' },
  codeReveal: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#10b981', borderRadius: 8, padding: 16, marginTop: 16, alignItems: 'center' },
  codeRevealText: { color: '#10b981', fontSize: 28, fontWeight: 'bold', letterSpacing: 6 }
});
