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
