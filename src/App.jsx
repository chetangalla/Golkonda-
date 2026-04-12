import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Plus, Navigation, Volume2, AlertCircle, Music } from 'lucide-react';
import { calculateDistance, playAudio, enqueueAudio, preloadAudio, clearAudioQueue } from './utils/geo';
import './index.css';

const AUTO_PLAY_DISTANCE = 7;   // metres  – auto-trigger audio
const PRELOAD_DISTANCE   = 200;  // metres  – start buffering audio
const COOLDOWN_PERIOD    = 60000; // 60 s   – don't re-trigger same location

function App() {
  const [currentLoc, setCurrentLoc]     = useState(null);
  const [errorMsg, setErrorMsg]         = useState('');
  const [locations, setLocations]       = useState(() => {
    const saved = localStorage.getItem('audio_locations');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAddForm, setShowAddForm]   = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [nowPlaying, setNowPlaying]     = useState(null); // { name }
  const [playQueue, setPlayQueue]       = useState([]);   // display queue

  const [formParams, setFormParams] = useState({
    name: '', lat: '', lng: '', audioUrl: ''
  });

  // Refs – survive re-renders without triggering them
  const lastPlayedRef  = useRef({});   // locId → timestamp
  const clearedRef     = useRef({});   // locId → true once user has left radius
  const prevLocRef     = useRef(null); // previous GPS fix
  const locationsRef   = useRef(locations);
  const hasInteractedRef = useRef(hasInteracted);

  // Keep refs in sync with state
  useEffect(() => { locationsRef.current   = locations;    }, [locations]);
  useEffect(() => { hasInteractedRef.current = hasInteracted; }, [hasInteracted]);

  // Persist locations
  useEffect(() => {
    localStorage.setItem('audio_locations', JSON.stringify(locations));
  }, [locations]);

  // ─── Proximity check ──────────────────────────────────────────────────────
  const checkProximity = useCallback((lat, lng) => {
    if (!hasInteractedRef.current) return;

    const now = Date.now();
    const locs = locationsRef.current;

    // Preload audio for any location within PRELOAD_DISTANCE
    locs.forEach(loc => {
      const d = calculateDistance(lat, lng, loc.lat, loc.lng);
      if (d <= PRELOAD_DISTANCE) preloadAudio(loc.audioUrl);
    });

    // Collect all locations that should be triggered, with their distance
    const toTrigger = [];

    locs.forEach(loc => {
      const d = calculateDistance(lat, lng, loc.lat, loc.lng);

      // ── Fast-crossing detection ─────────────────────────────────────────
      // If the user moved from outside AUTO_PLAY_DISTANCE to inside (or through
      // and back out) in a single GPS update, the current distance may already
      // be > AUTO_PLAY_DISTANCE. We also check the path intersection.
      let shouldTrigger = false;

      if (d <= AUTO_PLAY_DISTANCE) {
        // Currently inside radius
        shouldTrigger = true;
      } else if (prevLocRef.current) {
        // Check if the straight-line path between previous and current GPS fix
        // crossed through the AUTO_PLAY_DISTANCE circle of this location.
        const prevDist = calculateDistance(
          prevLocRef.current.lat, prevLocRef.current.lng,
          loc.lat, loc.lng
        );
        if (prevDist <= AUTO_PLAY_DISTANCE) {
          // Was inside on previous fix but moved out → fast crossing
          shouldTrigger = true;
        }
      }

      if (!shouldTrigger) {
        // User is outside radius → reset the "cleared" gate so it can trigger again
        clearedRef.current[loc.id] = true;
        return;
      }

      // Respect cooldown
      const lastPlayed = lastPlayedRef.current[loc.id] || 0;
      if (now - lastPlayed < COOLDOWN_PERIOD) return;

      // Must have left and re-entered (or be a first visit)
      if (lastPlayed > 0 && !clearedRef.current[loc.id]) return;

      toTrigger.push({ loc, d });
    });

    if (toTrigger.length === 0) return;

    // Sort nearest first
    toTrigger.sort((a, b) => a.d - b.d);

    // Mark all as played immediately to prevent double-trigger on next GPS fix
    toTrigger.forEach(({ loc }) => {
      lastPlayedRef.current[loc.id]  = now;
      clearedRef.current[loc.id]     = false; // must leave before re-triggering
    });

    // Update display queue
    const names = toTrigger.map(({ loc }) => loc.name);
    setPlayQueue(names);
    setNowPlaying(names[0]);

    // Enqueue audio clips in nearest-first order
    toTrigger.forEach(({ loc }, idx) => {
      enqueueAudio(loc.audioUrl)
        .then(() => {
          setNowPlaying(names[idx + 1] || null);
          if (idx === names.length - 1) setPlayQueue([]);
        })
        .catch(e => {
          console.warn(`Audio failed for ${loc.name}:`, e);
          setErrorMsg(`Could not play audio for "${loc.name}". Check the URL.`);
          setTimeout(() => setErrorMsg(''), 5000);
        });
    });
  }, []);

  // ─── Geolocation watcher ──────────────────────────────────────────────────
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCurrentLoc({ lat: latitude, lng: longitude });
        checkProximity(latitude, longitude);
        prevLocRef.current = { lat: latitude, lng: longitude };
      },
      (err) => {
        setErrorMsg(`Location error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,       // always use a fresh fix
        timeout: 10000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [checkProximity]);

  // ─── Manual play (Test Audio button) ─────────────────────────────────────
  const handleTestAudio = (loc) => {
    playAudio(loc.audioUrl).catch(e => {
      setErrorMsg(`Could not play audio for "${loc.name}". Ensure the link is valid.`);
      setTimeout(() => setErrorMsg(''), 5000);
    });
  };

  // ─── Form helpers ─────────────────────────────────────────────────────────
  const handleAddSubmit = (e) => {
    e.preventDefault();
    const newLoc = {
      id: Date.now().toString(),
      name: formParams.name,
      lat: parseFloat(formParams.lat),
      lng: parseFloat(formParams.lng),
      audioUrl: formParams.audioUrl,
    };
    setLocations(prev => [...prev, newLoc]);
    setFormParams({ name: '', lat: '', lng: '', audioUrl: '' });
    setShowAddForm(false);
  };

  const fillCurrentLoc = () => {
    if (currentLoc) {
      setFormParams(prev => ({
        ...prev,
        lat: currentLoc.lat.toFixed(6),
        lng: currentLoc.lng.toFixed(6),
      }));
    }
  };

  // ─── Distances for display ────────────────────────────────────────────────
  const withDist = locations.map(loc => {
    const dist = currentLoc
      ? calculateDistance(currentLoc.lat, currentLoc.lng, loc.lat, loc.lng)
      : null;
    return { ...loc, dist };
  }).sort((a, b) => {
    if (a.dist === null && b.dist === null) return 0;
    if (a.dist === null) return 1;
    if (b.dist === null) return -1;
    return a.dist - b.dist;
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="container" onClick={() => !hasInteracted && setHasInteracted(true)}>
      <div className="header">
        <h1>GPS Audio Trigger</h1>
        <p style={{ color: 'var(--text-muted)' }}>Location-based audio for tourists</p>
      </div>

      {errorMsg && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <AlertCircle color="var(--danger)" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Now-Playing Banner */}
      {nowPlaying && (
        <div className="card" style={{
          borderLeft: '4px solid var(--success)',
          display: 'flex', gap: '0.75rem', alignItems: 'center',
          animation: 'pulse 2s infinite'
        }}>
          <Music color="var(--success)" size={20} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--success)' }}>Now Playing</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{nowPlaying}</div>
            {playQueue.length > 1 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                Queue: {playQueue.slice(1).join(' → ')}
              </div>
            )}
          </div>
          <button
            type="button"
            className="danger"
            style={{ marginLeft: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            onClick={(e) => { e.stopPropagation(); clearAudioQueue(); setNowPlaying(null); setPlayQueue([]); }}
          >
            Stop
          </button>
        </div>
      )}

      {/* Status Bar */}
      <div className="status-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Navigation style={{ color: currentLoc ? 'var(--accent)' : 'var(--text-muted)' }} />
          <span style={{ fontWeight: 600 }}>Tracking Status</span>
          {currentLoc && (
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', marginLeft: '0.5rem' }}>● Live</span>
          )}
        </div>
        <div className="metrics">
          <div className="metric">
            <span className="metric-label">Latitude</span>
            <span className="metric-value">{currentLoc ? currentLoc.lat.toFixed(5) : '--'}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Longitude</span>
            <span className="metric-value">{currentLoc ? currentLoc.lng.toFixed(5) : '--'}</span>
          </div>
        </div>
      </div>

      {/* Header row */}
      <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
        <h2>Saved Locations</h2>
        <button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={20} /> Add Target
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="card" style={{ animation: 'fadeIn 0.3s' }}>
          <form onSubmit={handleAddSubmit} className="flex-column">
            <div>
              <label>Location Name</label>
              <input
                required
                value={formParams.name}
                onChange={e => setFormParams({ ...formParams, name: e.target.value })}
                placeholder="e.g. Park Entrance"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label>
                  Latitude
                  <button type="button" onClick={fillCurrentLoc}
                    style={{ background: 'transparent', padding: 0, color: 'var(--accent)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                    Use Current
                  </button>
                </label>
                <input required type="number" step="any" value={formParams.lat}
                  onChange={e => setFormParams({ ...formParams, lat: e.target.value })}
                  placeholder="0.0000" />
              </div>
              <div style={{ flex: 1 }}>
                <label>Longitude</label>
                <input required type="number" step="any" value={formParams.lng}
                  onChange={e => setFormParams({ ...formParams, lng: e.target.value })}
                  placeholder="0.0000" />
              </div>
            </div>

            <div>
              <label>Audio File</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                <input type="file" accept="audio/*" onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    const fileURL = URL.createObjectURL(e.target.files[0]);
                    setFormParams({ ...formParams, audioUrl: fileURL });
                  }
                }} style={{ padding: '0.5rem', background: 'var(--bg-card)', fontSize: '0.875rem', marginBottom: 0 }} />
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>OR enter a direct URL</div>
                <input required value={formParams.audioUrl}
                  onChange={e => setFormParams({ ...formParams, audioUrl: e.target.value })}
                  placeholder="https://example.com/audio.mp3"
                  style={{ marginBottom: 0 }} />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Note: Don't use Google Drive links — they block direct audio playback.
                </div>
              </div>
            </div>

            <div className="flex-between">
              <button type="button" className="danger" onClick={() => setShowAddForm(false)}>Cancel</button>
              <button type="submit">Save Target</button>
            </div>
          </form>
        </div>
      )}

      {/* Locations Grid – sorted nearest first */}
      <div className="locations-grid">
        {withDist.length === 0 ? (
          <div className="empty-state">No locations saved yet. Add one to start testing!</div>
        ) : (
          withDist.map((loc, idx) => {
            const isAutoPlay = loc.dist !== null && loc.dist <= AUTO_PLAY_DISTANCE;
            const isPreload  = loc.dist !== null && loc.dist <= PRELOAD_DISTANCE;

            return (
              <div key={loc.id} className="card" style={{
                borderLeft: isAutoPlay
                  ? '4px solid var(--success)'
                  : isPreload
                  ? '4px solid var(--accent)'
                  : '1px solid var(--border)',
              }}>
                <div className="flex-between">
                  <div className="card-title">
                    <MapPin size={20} color={isAutoPlay ? 'var(--success)' : 'var(--text-main)'} />
                    {loc.name}
                    {currentLoc && idx === 0 && loc.dist !== null && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent)', marginLeft: '0.5rem' }}>Nearest</span>
                    )}
                  </div>
                  {loc.dist !== null && (
                    <span className={`badge ${isAutoPlay || isPreload ? 'active' : 'inactive'}`}>
                      {loc.dist < 1000
                        ? `${loc.dist.toFixed(1)} m`
                        : `${(loc.dist / 1000).toFixed(2)} km`} away
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                </div>

                {isAutoPlay && (
                  <div style={{ color: 'var(--success)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <AlertCircle size={16} /> You are near {loc.name}!
                  </div>
                )}

                <div className="flex-between">
                  <button type="button"
                    onClick={() => handleTestAudio(loc)}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                    <Volume2 size={16} /> Test Audio
                  </button>
                  <button type="button" className="danger"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    onClick={() => setLocations(prev => prev.filter(l => l.id !== loc.id))}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Welcome / Interaction gate */}
      {!hasInteracted && (
        <div className="modal-backdrop" onClick={() => setHasInteracted(true)}>
          <div className="modal">
            <h2>Welcome!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Tap below to enable audio playback. Your browser requires a user interaction before audio can play automatically.
            </p>
            <button onClick={() => setHasInteracted(true)}>Enable Audio & Start</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
