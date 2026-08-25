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

  const match = uri.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  if (!match) return uri; // Unrecognized data URI shape — let it fail naturally rather than guess.

  const [, mime, base64] = match;
  const ext = (mime.split('/')[1] || 'm4a').split('+')[0];
  const path = `${FileSystem.cacheDirectory}audio-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });

  tempFileCache[uri] = path;
  return path;
}
