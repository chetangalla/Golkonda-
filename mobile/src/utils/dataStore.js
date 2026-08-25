import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, storage, auth } from './firebase';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';

const LOCAL_KEY = '@audio_targets';
const USERS_KEY = '@users';
const MONUMENTS_KEY = '@monuments';
const GPS_DIRECTIONS_KEY = '@gps_directions';

// ======================= AUTH ========================
// Local-only fallback, used only until Firebase Auth is configured (see
// FIREBASE_SETUP.md). No password is ever checked here — it exists purely
// so the app remains testable before a real backend is wired up. Once
// `auth` is set, signUp/login below take over and every account requires
// a real password.
export async function registerUser(name, email, phone) {
  const stored = await AsyncStorage.getItem(USERS_KEY);
  const users = stored ? JSON.parse(stored) : [];
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email already registered');
  }
  const newUser = { id: Date.now().toString(), name, email, phone };
  users.push(newUser);
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
  return newUser;
}

export async function loginUser(email) {
  const stored = await AsyncStorage.getItem(USERS_KEY);
  const users = stored ? JSON.parse(stored) : [];
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error('Email not found. Please sign up first.');
  return user;
}

// Real accounts, backed by Firebase Authentication. `role` is decided by
// whether an `admins/{uid}` Firestore document exists for that account —
// there's no client-side way to grant yourself admin, since only you can
// create that document (via the Firebase Console, not the app).
export async function signUp(name, email, password, phone) {
  if (auth) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, email, phone, createdAt: new Date().toISOString()
    });
    return { uid: cred.user.uid, email: cred.user.email, role: 'user' };
  } else {
    const local = await registerUser(name, email, phone);
    return { ...local, role: 'user' };
  }
}

export async function login(email, password) {
  if (auth) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const adminDoc = await getDoc(doc(db, 'admins', cred.user.uid));
    return { uid: cred.user.uid, email: cred.user.email, role: adminDoc.exists() ? 'admin' : 'user' };
  } else {
    // No backend configured yet — these two hardcoded logins are dev-only
    // shortcuts (no password check) and disappear the moment Firebase Auth
    // is live, since real accounts take this branch instead.
    const normalized = email.toLowerCase();
    if (normalized === 'admin@tourist.com') return { email, role: 'admin' };
    if (normalized === 'user@tourist.com') return { email, role: 'user' };
    const local = await loginUser(email);
    return { ...local, role: 'user' };
  }
}

export async function logout() {
  if (auth) {
    await signOut(auth);
  }
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

export async function addTarget(name, lat, lng, audioUri, floor = 1, parentMonumentId = null, triggerRadius = 7, orderIndex = 0) {
  let audioUrl = audioUri;

  if (db && storage && audioUri) {
    if (audioUri.startsWith('file://')) {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const fileRef = ref(storage, `audio/${Date.now()}.m4a`);
      await uploadBytes(fileRef, blob);
      audioUrl = await getDownloadURL(fileRef);
    }
    
    const newTarget = { name, lat, lng, audioUrl, floor, parentMonumentId, triggerRadius, orderIndex };
    const docRef = await addDoc(collection(db, 'targets'), newTarget);
    return { id: docRef.id, ...newTarget };
  } else {
    const stored = await AsyncStorage.getItem(LOCAL_KEY);
    const targets = stored ? JSON.parse(stored) : [];
    const newTarget = { id: Date.now().toString(), name, lat, lng, audioUrl, floor, parentMonumentId, triggerRadius, orderIndex };
    targets.push(newTarget);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(targets));
    return newTarget;
  }
}

export async function updateTarget(id, updates) {
  if (db) {
    const docRef = doc(db, 'targets', id);
    await updateDoc(docRef, updates);
    return { id, ...updates };
  } else {
    const stored = await AsyncStorage.getItem(LOCAL_KEY);
    let targets = stored ? JSON.parse(stored) : [];
    const index = targets.findIndex(t => t.id === id);
    if (index > -1) {
      targets[index] = { ...targets[index], ...updates };
      await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(targets));
      return targets[index];
    }
    return null;
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

// ===================== GPS DIRECTIONS =====================

export async function getGpsDirections() {
  if (db) {
    const snap = await getDocs(collection(db, 'gps_directions'));
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.delaySeconds || 0) - (b.delaySeconds || 0));
  } else {
    const stored = await AsyncStorage.getItem(GPS_DIRECTIONS_KEY);
    const directions = stored ? JSON.parse(stored) : [];
    return directions.sort((a, b) => (a.delaySeconds || 0) - (b.delaySeconds || 0));
  }
}

export async function addGpsDirection(name, audioUri, parentGpsId, delaySeconds = 0) {
  let audioUrl = audioUri;

  if (db && storage && audioUri) {
    if (audioUri.startsWith('file://')) {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const fileRef = ref(storage, `gps_directions/${Date.now()}.m4a`);
      await uploadBytes(fileRef, blob);
      audioUrl = await getDownloadURL(fileRef);
    }
    
    const newDir = { name, audioUrl, parentGpsId, delaySeconds };
    const docRef = await addDoc(collection(db, 'gps_directions'), newDir);
    return { id: docRef.id, ...newDir };
  } else {
    const stored = await AsyncStorage.getItem(GPS_DIRECTIONS_KEY);
    const directions = stored ? JSON.parse(stored) : [];
    const newDir = { id: Date.now().toString(), name, audioUrl, parentGpsId, delaySeconds };
    directions.push(newDir);
    await AsyncStorage.setItem(GPS_DIRECTIONS_KEY, JSON.stringify(directions));
    return newDir;
  }
}

export async function updateGpsDirection(id, updates) {
  if (db) {
    const docRef = doc(db, 'gps_directions', id);
    await updateDoc(docRef, updates);
    return { id, ...updates };
  } else {
    const stored = await AsyncStorage.getItem(GPS_DIRECTIONS_KEY);
    let directions = stored ? JSON.parse(stored) : [];
    const index = directions.findIndex(d => d.id === id);
    if (index > -1) {
      directions[index] = { ...directions[index], ...updates };
      await AsyncStorage.setItem(GPS_DIRECTIONS_KEY, JSON.stringify(directions));
      return directions[index];
    }
    return null;
  }
}

export async function deleteGpsDirection(id) {
  if (db) {
    await deleteDoc(doc(db, 'gps_directions', id));
  } else {
    const stored = await AsyncStorage.getItem(GPS_DIRECTIONS_KEY);
    const directions = stored ? JSON.parse(stored) : [];
    await AsyncStorage.setItem(GPS_DIRECTIONS_KEY, JSON.stringify(directions.filter(d => d.id !== id)));
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

export async function addExhibit(name, audioUri, orderIndex, floor = 1, nodeType = 'exhibit', targetFloor = null, parentGpsId = null, verificationPrompt = '', delaySeconds = 0) {
  let audioUrl = audioUri;

  if (db && storage && audioUri) {
    if (audioUri.startsWith('file://')) {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const fileRef = ref(storage, `indoor_audio/${Date.now()}.m4a`);
      await uploadBytes(fileRef, blob);
      audioUrl = await getDownloadURL(fileRef);
    }
    
    const newExhibit = { name, audioUrl, orderIndex, floor, nodeType, targetFloor, parentGpsId, verificationPrompt, delaySeconds };
    const docRef = await addDoc(collection(db, 'indoor_exhibits'), newExhibit);
    return { id: docRef.id, ...newExhibit };
  } else {
    const stored = await AsyncStorage.getItem(INDOOR_KEY);
    const exhibits = stored ? JSON.parse(stored) : [];
    const newExhibit = { id: Date.now().toString(), name, audioUrl, orderIndex, floor, nodeType, targetFloor, parentGpsId, verificationPrompt, delaySeconds };
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

// ===================== BACKUP / RESTORE =====================
// Without Firebase, local storage lives only on one device and nothing is
// synced anywhere — these let the admin pull everything out as one portable
// file and load it back in on any device. Note: audioUrl values recorded/
// uploaded on a phone are local file:// paths, so they won't play back after
// restoring on a different device — re-attach audio via "Update Item" after
// restoring. Coordinates, names, and the tour structure all restore fully.
//
// With Firebase configured, this instead reads from / writes to Firestore
// directly, so a restore is visible to every device immediately. Original
// document IDs are preserved on import — targets/exhibits/directions
// reference their parent by that ID (parentMonumentId, parentGpsId), and
// those links only stay intact if restored docs keep the IDs they were
// exported with.
const BACKUP_KEYS = {
  monuments: MONUMENTS_KEY,
  targets: LOCAL_KEY,
  gpsDirections: GPS_DIRECTIONS_KEY,
  exhibits: INDOOR_KEY,
};
const BACKUP_COLLECTIONS = {
  monuments: 'monuments',
  targets: 'targets',
  gpsDirections: 'gps_directions',
  exhibits: 'indoor_exhibits',
};

export async function exportAllData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'golkonda-audio-guide',
    version: 1,
    data: {},
  };
  if (db) {
    for (const [label, collName] of Object.entries(BACKUP_COLLECTIONS)) {
      const snap = await getDocs(collection(db, collName));
      payload.data[label] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } else {
    for (const [label, key] of Object.entries(BACKUP_KEYS)) {
      const stored = await AsyncStorage.getItem(key);
      payload.data[label] = stored ? JSON.parse(stored) : [];
    }
  }
  return payload;
}

export async function importAllData(payload, { merge = false } = {}) {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    throw new Error('This file is not a recognized backup.');
  }
  if (db) {
    for (const [label, collName] of Object.entries(BACKUP_COLLECTIONS)) {
      const incoming = Array.isArray(payload.data[label]) ? payload.data[label] : [];
      if (!merge) {
        // A "replace" restore should actually replace — clear the collection first.
        const existingSnap = await getDocs(collection(db, collName));
        await Promise.all(existingSnap.docs.map(d => deleteDoc(doc(db, collName, d.id))));
      }
      await Promise.all(incoming.map(item => {
        const { id, ...fields } = item;
        return setDoc(doc(db, collName, id), fields);
      }));
    }
  } else {
    for (const [label, key] of Object.entries(BACKUP_KEYS)) {
      const incoming = Array.isArray(payload.data[label]) ? payload.data[label] : [];
      if (!merge) {
        await AsyncStorage.setItem(key, JSON.stringify(incoming));
        continue;
      }
      const stored = await AsyncStorage.getItem(key);
      const existing = stored ? JSON.parse(stored) : [];
      const existingIds = new Set(existing.map(item => item.id));
      const combined = [...existing, ...incoming.filter(item => !existingIds.has(item.id))];
      await AsyncStorage.setItem(key, JSON.stringify(combined));
    }
  }
  return true;
}

// ===================== ACCESS CODES =====================
// Cash-only, time-limited access: the admin generates a code for a visitor
// who's paid in person, the visitor redeems it once inside the app, and
// their account gets `durationHours` of tour access starting at that
// moment. No payment happens anywhere in this code — that's the point.
//
// Known limitation, worth being upfront about: this is enforced by
// Firestore's security rules, not a server function, because a server
// function would mean standing up Cloud Functions (a real separate piece
// of infrastructure) for a pilot feature. The rules prevent the casual
// bypasses — generating your own code, reusing someone else's, reading
// other visitors' data — but a technically determined user could still
// write a fake accessExpiresAt to their own profile directly, bypassing a
// code entirely. Fine for testing at the fort; worth moving the expiry
// write into a Cloud Function before this becomes the permanent model.
const ACCESS_CODES_KEY = '@access_codes'; // local fallback only

function generateCodeString() {
  // Excludes visually ambiguous characters (0/O, 1/I/L) since these get
  // read aloud or handwritten during an in-person cash handoff.
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function generateAccessCode(durationHours) {
  const hours = Number(durationHours) || 6;

  if (db) {
    // Collision odds at 6 chars from a 32-letter alphabet are astronomically
    // low, but this is a code someone will hand over cash for — check anyway.
    let code = generateCodeString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await getDoc(doc(db, 'accessCodes', code));
      if (!existing.exists()) break;
      code = generateCodeString();
    }
    await setDoc(doc(db, 'accessCodes', code), {
      durationHours: hours,
      createdAt: serverTimestamp(),
      used: false,
      redeemedBy: null,
      redeemedAt: null,
    });
    return code;
  } else {
    const stored = await AsyncStorage.getItem(ACCESS_CODES_KEY);
    const codes = stored ? JSON.parse(stored) : [];
    const code = generateCodeString();
    codes.push({ id: code, durationHours: hours, createdAt: new Date().toISOString(), used: false, redeemedBy: null, redeemedAt: null });
    await AsyncStorage.setItem(ACCESS_CODES_KEY, JSON.stringify(codes));
    return code;
  }
}

export async function getAccessCodes() {
  if (db) {
    const snap = await getDocs(collection(db, 'accessCodes'));
    const codes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return codes.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  } else {
    const stored = await AsyncStorage.getItem(ACCESS_CODES_KEY);
    const codes = stored ? JSON.parse(stored) : [];
    return codes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

export async function deleteAccessCode(code) {
  if (db) {
    await deleteDoc(doc(db, 'accessCodes', code));
  } else {
    const stored = await AsyncStorage.getItem(ACCESS_CODES_KEY);
    const codes = stored ? JSON.parse(stored) : [];
    await AsyncStorage.setItem(ACCESS_CODES_KEY, JSON.stringify(codes.filter(c => c.id !== code)));
  }
}

// Visitor side: redeem a code to unlock `durationHours` of access starting
// now. Runs as a transaction so two people reading the same physical code
// at the same moment can't both successfully redeem it.
export async function redeemAccessCode(rawCode) {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('Enter the code you were given.');

  if (!db || !auth?.currentUser) {
    throw new Error('Access codes need a live connection — no backend is configured right now.');
  }

  const uid = auth.currentUser.uid;
  const codeRef = doc(db, 'accessCodes', code);
  const userRef = doc(db, 'users', uid);

  const expiresAt = await runTransaction(db, async (tx) => {
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists()) throw new Error('That code was not found — double check it and try again.');
    const data = codeSnap.data();
    if (data.used) throw new Error('That code has already been used.');

    const durationHours = Number(data.durationHours) || 6;
    const expires = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    tx.update(codeRef, { used: true, redeemedBy: uid, redeemedAt: serverTimestamp() });
    tx.set(userRef, { accessExpiresAt: expires.toISOString() }, { merge: true });
    return expires;
  });

  return expiresAt;
}

// Local/dev fallback (no Firebase configured) skips gating entirely — there
// is nowhere to check a real access window against, so every visitor is
// treated as having access, same as before this feature existed.
export async function getUserAccess(uid) {
  if (!db) return { hasAccess: true, expiresAt: null };
  if (!uid) return { hasAccess: false, expiresAt: null };

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists() || !snap.data().accessExpiresAt) return { hasAccess: false, expiresAt: null };

  const expiresAt = new Date(snap.data().accessExpiresAt);
  return { hasAccess: expiresAt.getTime() > Date.now(), expiresAt };
}
