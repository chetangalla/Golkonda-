import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';

// Replace these with your real Firebase Project settings from the Firebase Console.
// See FIREBASE_SETUP.md at the repo root for the exact steps.
const firebaseConfig = {
  apiKey: "AIzaSyBbncw2H9_QORSOqCYg2s3TYI3F2RkSTFA",
  authDomain: "golkonda-audio.firebaseapp.com",
  projectId: "golkonda-audio",
  storageBucket: "golkonda-audio.firebasestorage.app",
  messagingSenderId: "703602541392",
  appId: "1:703602541392:web:3ec03a77e53556a7bf2255"
};

export let app = null;
export let db = null;
export let storage = null;
export let auth = null;

try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    // On native, auth state must be told to persist via AsyncStorage explicitly —
    // without this, Firebase Auth defaults to in-memory only and every user gets
    // logged out the moment the app is fully closed. Web doesn't need this; the
    // JS SDK already persists to the browser's own storage there.
    auth = Platform.OS === 'web'
      ? getAuth(app)
      : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  }
} catch (e) {
  console.warn("Firebase failed to initialize. Using local fallback.");
}
