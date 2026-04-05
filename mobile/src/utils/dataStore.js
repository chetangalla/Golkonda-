import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from './firebase';
import { collection, getDocs, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const LOCAL_KEY = '@audio_targets';

export async function getTargets() {
  if (db) {
    const snap = await getDocs(collection(db, 'targets'));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } else {
    const stored = await AsyncStorage.getItem(LOCAL_KEY);
    return stored ? JSON.parse(stored) : [];
  }
}

export async function addTarget(name, lat, lng, audioUri) {
  let audioUrl = audioUri;

  if (db && storage && audioUri) {
    if (audioUri.startsWith('file://')) {
      // Upload recording to Firebase
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const fileRef = ref(storage, `audio/${Date.now()}.m4a`);
      await uploadBytes(fileRef, blob);
      audioUrl = await getDownloadURL(fileRef);
    }
    
    const newTarget = { name, lat, lng, audioUrl };
    const docRef = await addDoc(collection(db, 'targets'), newTarget);
    return { id: docRef.id, ...newTarget };
  } else {
    // Local fallback
    const stored = await AsyncStorage.getItem(LOCAL_KEY);
    const targets = stored ? JSON.parse(stored) : [];
    const newTarget = { id: Date.now().toString(), name, lat, lng, audioUrl };
    targets.push(newTarget);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(targets));
    return newTarget;
  }
}

export async function deleteTarget(id) {
  if (db) {
    await deleteDoc(doc(db, 'targets', id));
  } else {
    const stored = await AsyncStorage.getItem(LOCAL_KEY);
    const targets = stored ? JSON.parse(stored) : [];
    const filtered = targets.filter(t => t.id !== id);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(filtered));
  }
}

const INDOOR_KEY = '@indoor_exhibits';

export async function getExhibits() {
  if (db) {
    const snap = await getDocs(collection(db, 'indoor_exhibits'));
    const exhibits = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return exhibits.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  } else {
    const stored = await AsyncStorage.getItem(INDOOR_KEY);
    const exhibits = stored ? JSON.parse(stored) : [];
    return exhibits.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }
}

export async function addExhibit(name, audioUri, orderIndex) {
  let audioUrl = audioUri;

  if (db && storage && audioUri) {
    if (audioUri.startsWith('file://')) {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const fileRef = ref(storage, `indoor_audio/${Date.now()}.m4a`);
      await uploadBytes(fileRef, blob);
      audioUrl = await getDownloadURL(fileRef);
    }
    
    const newExhibit = { name, audioUrl, orderIndex };
    const docRef = await addDoc(collection(db, 'indoor_exhibits'), newExhibit);
    return { id: docRef.id, ...newExhibit };
  } else {
    const stored = await AsyncStorage.getItem(INDOOR_KEY);
    const exhibits = stored ? JSON.parse(stored) : [];
    const newExhibit = { id: Date.now().toString(), name, audioUrl, orderIndex };
    exhibits.push(newExhibit);
    await AsyncStorage.setItem(INDOOR_KEY, JSON.stringify(exhibits));
    return newExhibit;
  }
}

export async function deleteExhibit(id) {
  if (db) {
    await deleteDoc(doc(db, 'indoor_exhibits', id));
  } else {
    const stored = await AsyncStorage.getItem(INDOOR_KEY);
    const exhibits = stored ? JSON.parse(stored) : [];
    const filtered = exhibits.filter(e => e.id !== id);
    await AsyncStorage.setItem(INDOOR_KEY, JSON.stringify(filtered));
  }
}
