import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Audio uploaded via "Upload File" on the web admin is stored as a
// self-contained base64 data: URI (see MasterScreen's pickAudio) so it
// travels safely with backups and survives page reloads there. Browsers
// play data: URIs natively, but Android's ExoPlayer (which expo-av uses
// under the hood) does not reliably support them — playback fails silently
// with no error surfaced. The documented workaround is to write the base64
// payload out to a real temp file first and play that instead. This is a
// no-op for every other URL shape (https:// Storage links, file:// local
// paths) and for web itself, where the data: URI already works fine.
const tempFileCache = {};

export async function resolvePlayableUri(uri) {
  if (!uri) return uri;
  if (Platform.OS === 'web') return uri;
  if (!uri.startsWith('data:')) return uri;

  if (tempFileCache[uri]) return tempFileCache[uri];

  // Deliberately not requiring the mime type to start with "audio/" —
  // browsers don't reliably report a clean audio/* type for every
  // recording (an uncommon codec or extension can come through as
  // something like application/octet-stream). We already know this is
  // meant to be audio because of where it's being played from; we just
  // need *a* base64 payload and *some* reasonable file extension.
  const match = uri.match(/^data:([^;,]*);base64,([\s\S]*)$/);
  if (!match) return uri; // Not a base64 data URI at all — let it fail naturally rather than guess.

  const [, mime, base64] = match;
  const rawExt = (mime.split('/')[1] || '').split('+')[0].split(';')[0].trim();
  const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? rawExt : 'm4a';
  const path = `${FileSystem.cacheDirectory}audio-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });

  tempFileCache[uri] = path;
  return path;
}
