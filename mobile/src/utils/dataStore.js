import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage } from './firebase';
import { collection, getDocs, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const LOCAL_KEY = '@audio_targets';
const USERS_KEY = '@users';
const MONUMENTS_KEY = '@monuments';

// ======================= AUTH ========================
export async function registerUser(name, email, phone, password) {
  const stored = await AsyncStorage.getItem(USERS_KEY);
  const users = stored ? JSON.parse(stored) : [];
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email already registered');
  }
  const newUser = { id: Date.now().toString(), name, email, phone, password };
  users.push(newUser);
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
  return newUser;
}

export async function loginUser(email, password) {
  const stored = await AsyncStorage.getItem(USERS_KEY);
  const users = stored ? JSON.parse(stored) : [];
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) throw new Error('Invalid email or password');
  return user;
}

// ===================== MONUMENTS =====================
export async function getMonuments() {
  if (db) {
    const snap = await getDocs(collection(db, 'monuments'));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } else {
    const stored = await AsyncStorage.getItem(MONUMENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  }
}

export async function addMonument(name) {
  const newMonument = { name };
  if (db) {
    const docRef = await addDoc(collection(db, 'monuments'), newMonument);
    return { id: docRef.id, ...newMonument };
  } else {
    const stored = await AsyncStorage.getItem(MONUMENTS_KEY);
    const monuments = stored ? JSON.parse(stored) : [];
    const created = { id: Date.now().toString(), ...newMonument };
    monuments.push(created);
    await AsyncStorage.setItem(MONUMENTS_KEY, JSON.stringify(monuments));
    return created;
  }
}

export async function deleteMonument(id) {
  if (db) {
    await deleteDoc(doc(db, 'monuments', id));
  } else {
    const stored = await AsyncStorage.getItem(MONUMENTS_KEY);
    const monuments = stored ? JSON.parse(stored) : [];
    await AsyncStorage.setItem(MONUMENTS_KEY, JSON.stringify(monuments.filter(m => m.id !== id)));
  }
}

// ===================== GPS TARGETS =====================

export async function getTargets() {
  const mData = await getMonuments();
  const lastMonumentId = mData.length > 0 ? mData[mData.length - 1].id : null;

  const processTargets = (list) => {
    return list.map(t => ({
      ...t,
      parentMonumentId: t.parentMonumentId || lastMonumentId || 'orphan'
    }));
  };

  if (db) {
    const snap = await getDocs(collection(db, 'targets'));
    return processTargets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } else {
    const stored = await AsyncStorage.getItem(LOCAL_KEY);
    const targets = stored ? JSON.parse(stored) : [];
    return processTargets(targets);
  }
}

export async function addTarget(name, lat, lng, audioUri, floor = 1, parentMonumentId = null) {
  let audioUrl = audioUri;

  if (db && storage && audioUri) {
    if (audioUri.startsWith('file://')) {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const fileRef = ref(storage, `audio/${Date.now()}.m4a`);
      await uploadBytes(fileRef, blob);
      audioUrl = await getDownloadURL(fileRef);
    }
    
    const newTarget = { name, lat, lng, audioUrl, floor, parentMonumentId };
    const docRef = await addDoc(collection(db, 'targets'), newTarget);
    return { id: docRef.id, ...newTarget };
  } else {
    const stored = await AsyncStorage.getItem(LOCAL_KEY);
    const targets = stored ? JSON.parse(stored) : [];
    const newTarget = { id: Date.now().toString(), name, lat, lng, audioUrl, floor, parentMonumentId };
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
  const tData = await getTargets();
  const lastTargetId = tData.length > 0 ? tData[tData.length - 1].id : null;

  const processExhibits = (list) => {
    return list.map(e => ({
      ...e,
      parentGpsId: e.parentGpsId || lastTargetId
    })).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  };

  if (db) {
    const snap = await getDocs(collection(db, 'indoor_exhibits'));
    const exhibits = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return processExhibits(exhibits);
  } else {
    const stored = await AsyncStorage.getItem(INDOOR_KEY);
    const exhibits = stored ? JSON.parse(stored) : [];
    return processExhibits(exhibits);
  }
}

export async function addExhibit(name, audioUri, orderIndex, floor = 1, nodeType = 'exhibit', targetFloor = null, parentGpsId = null) {
  let audioUrl = audioUri;

  if (db && storage && audioUri) {
    if (audioUri.startsWith('file://')) {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const fileRef = ref(storage, `indoor_audio/${Date.now()}.m4a`);
      await uploadBytes(fileRef, blob);
      audioUrl = await getDownloadURL(fileRef);
    }
    
    const newExhibit = { name, audioUrl, orderIndex, floor, nodeType, targetFloor, parentGpsId };
    const docRef = await addDoc(collection(db, 'indoor_exhibits'), newExhibit);
    return { id: docRef.id, ...newExhibit };
  } else {
    const stored = await AsyncStorage.getItem(INDOOR_KEY);
    const exhibits = stored ? JSON.parse(stored) : [];
    const newExhibit = { id: Date.now().toString(), name, audioUrl, orderIndex, floor, nodeType, targetFloor, parentGpsId };
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
