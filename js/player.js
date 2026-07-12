/**
 * Rugged Music Player - Player Logic Module
 * Controls core audio element events, state machine (play/pause/skip),
 * shuffle/loop queues, volume persistence, and Blob Object URL lifecycle management.
 * Extended with dual-playback engine support: HTML5 Audio + YouTube IFrame API!
 * Global namespace version for file:// protocol compatibility.
 * Race-Condition Resolved Edition.
 */

let audio = null;
let currentTrack = null;
let currentObjectUrl = null;

// Playback Queue State
let originalQueue = []; 
let activeQueue = [];   
let currentQueueIndex = -1;

// Configuration States
let isPlaying = false;
let isShuffle = false;
let isLoop = 'none'; // 'none' | 'queue' | 'track'
let isBgPlayEnabled = true;
let isYtVideoEnabled = true;

// Dual Playback Engine States
let activeEngine = 'local'; // 'local' | 'youtube'
let ytPlayer = null;
let ytInterval = null;
let isYtApiReady = false;

// Persistence keys
const LOCAL_STORAGE_VOL_KEY = 'rugged-player-volume';

// Callback registry for UI updates
const callbacks = {
    onTrackChange: () => {},
    onPlayStateChange: () => {},
    onTimeUpdate: () => {},
    onQueueChange: () => {},
    onProgressUpdate: () => {}
};

/**
 * STATIC GLOBAL CALLBACK FOR YOUTUBE IFRAME API
 * Defined immediately in the global scope to eliminate load order race conditions.
 * Executes as soon as the YouTube API script is loaded and running.
 */
window.onYouTubeIframeAPIReady = () => {
    isYtApiReady = true;
    
    // Safely waits for DOM elements to exist before initializing the YouTube IFrame player
    const initYtPlayer = () => {
        const container = document.getElementById('youtube-player-iframe');
        if (!container) {
            // Target container does not exist yet, defer until DOMContentLoaded
            document.addEventListener('DOMContentLoaded', initYtPlayer);
            return;
        }
        
        try {
            ytPlayer = new YT.Player('youtube-player-iframe', {
                height: '100%',
                width: '100%',
                videoId: '',
                playerVars: {
                    'playsinline': 1,
                    'controls': 0,
                    'disablekb': 1,
                    'fs': 0,
                    'modestbranding': 1,
                    'rel': 0,
                    'autoplay': 0,
                    'origin': window.location.origin
                },
                events: {
                    'onReady': (event) => {
                        // Sync saved volume state
                        const savedVolume = localStorage.getItem(LOCAL_STORAGE_VOL_KEY);
                        const startVolume = savedVolume !== null ? parseFloat(savedVolume) : 0.8;
                        event.target.setVolume(startVolume * 100);
                    },
                    'onStateChange': handleYouTubeStateChange,
                    'onError': (e) => {
                        console.error('YouTube player error:', e.data);
                        if (activeEngine === 'youtube') {
                            setTimeout(() => nextTrack(), 2000);
                        }
                    }
                }
            });
        } catch (e) {
            console.error('Failed to instantiate YT.Player:', e);
        }
    };
    
    initYtPlayer();
};

/**
 * Initializes the audio player engine.
 * Binds HTML5 audio events and loads the YouTube IFrame Player API.
 * @param {HTMLAudioElement} audioElement 
 * @param {Object} customCallbacks 
 */
function initPlayer(audioElement, customCallbacks = {}) {
    audio = audioElement;
    
    // Bind callbacks
    Object.assign(callbacks, customCallbacks);

    // Load saved volume (default to 0.8)
    const savedVolume = localStorage.getItem(LOCAL_STORAGE_VOL_KEY);
    const initialVolume = savedVolume !== null ? parseFloat(savedVolume) : 0.8;
    audio.volume = initialVolume;

    // Bind HTML5 Audio Element Events
    audio.addEventListener('timeupdate', () => {
        if (activeEngine === 'local' && audio.duration) {
            callbacks.onTimeUpdate(audio.currentTime, audio.duration);
        }
    });

    audio.addEventListener('ended', () => {
        if (activeEngine === 'local') {
            handleTrackEnded();
        }
    });

    audio.addEventListener('error', (e) => {
        if (activeEngine === 'local') {
            console.error('Local Audio playback error:', e);
            setTimeout(() => nextTrack(), 2000);
        }
    });

    // Setup OS-level media keys and lock screen controls
    setupMediaSessionHandlers();

    // Initiate YouTube API script load
    injectYouTubeScript();
}

/**
 * Loads the YouTube IFrame API script dynamically.
 */
function injectYouTubeScript() {
    if (document.getElementById('youtube-iframe-api-script')) {
        return;
    }

    const tag = document.createElement('script');
    tag.id = 'youtube-iframe-api-script';
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

/**
 * Handles YouTube IFrame state change updates.
 * @param {Object} event 
 */
function handleYouTubeStateChange(event) {
    if (activeEngine !== 'youtube') return;

    const state = event.data;

    // YT.PlayerState codes:
    // -1 = unstarted, 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
    if (state === YT.PlayerState.PLAYING) {
        isPlaying = true;
        callbacks.onPlayStateChange(isPlaying);
        startYouTubeTimePoller();
    } else if (state === YT.PlayerState.PAUSED) {
        isPlaying = false;
        callbacks.onPlayStateChange(isPlaying);
        stopYouTubeTimePoller();
    } else if (state === YT.PlayerState.ENDED) {
        stopYouTubeTimePoller();
        handleTrackEnded();
    }
}

/**
 * Starts a 250ms polling timer to simulate timeupdate events for YouTube player.
 */
function startYouTubeTimePoller() {
    stopYouTubeTimePoller();
    ytInterval = setInterval(() => {
        if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
            const currentTime = ytPlayer.getCurrentTime() || 0;
            const duration = ytPlayer.getDuration() || 0;
            if (duration > 0) {
                callbacks.onTimeUpdate(currentTime, duration);
            }
        }
    }, 250);
}

/**
 * Stops the YouTube polling timer.
 */
function stopYouTubeTimePoller() {
    if (ytInterval) {
        clearInterval(ytInterval);
        ytInterval = null;
    }
}

/**
 * Updates the current queue of playable tracks.
 * @param {Array<Object>} newQueue - List of track metadata objects
 * @param {string} startWithTrackId - Optional track ID to immediately play
 */
function updateQueue(newQueue, startWithTrackId = null) {
    originalQueue = [...newQueue];
    
    if (isShuffle) {
        activeQueue = shuffleArray([...originalQueue]);
    } else {
        activeQueue = [...originalQueue];
    }

    callbacks.onQueueChange(activeQueue);

    if (startWithTrackId) {
        const index = activeQueue.findIndex(t => t.id === startWithTrackId);
        if (index !== -1) {
            loadAndPlay(index);
        }
    } else if (currentTrack) {
        currentQueueIndex = activeQueue.findIndex(t => t.id === currentTrack.id);
    }
}

/**
 * Loads a track from database by index in the active queue, and starts playback.
 * Automatically toggles between HTML5 Audio and YouTube engines!
 * @param {number} index 
 */
function loadAndPlay(index) {
    if (index < 0 || index >= activeQueue.length) return;
    
    currentQueueIndex = index;
    const fullTrack = activeQueue[index];

    try {
        if (!fullTrack) {
            throw new Error(`Track metadata not found for ID: ${trackMetadata.id}`);
        }

        // TAPE SELECTION ROUTER
        if (fullTrack.isYouTube) {
            // --- YOUTUBE ENGINE ROUTING ---
            activeEngine = 'youtube';
            
            // Pause and clear HTML5 Audio player
            audio.pause();
            audio.src = '';
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
                currentObjectUrl = null;
            }

            // Sync visualizer to synthetic pulsing spectrum
            if (window.RuggedVisualizer) {
                window.RuggedVisualizer.setYouTubeMode(true);
            }

            currentTrack = fullTrack;
            callbacks.onTrackChange(currentTrack);
            updateMediaSessionMetadata(currentTrack);

            // Load and play inside YouTube IFrame Player
            if (ytPlayer && ytPlayer.loadVideoById) {
                isPlaying = true;
                callbacks.onPlayStateChange(isPlaying);
                
                // Show the YouTube monitor pane if video display is enabled
                const ytScreen = document.getElementById('youtube-monitor-panel');
                if (ytScreen) {
                    ytScreen.style.display = isYtVideoEnabled ? 'block' : 'none';
                }

                ytPlayer.loadVideoById(fullTrack.youtubeId);
            } else {
                console.warn('YouTube IFrame Player is not ready yet. Retrying in 1s...');
                setTimeout(() => loadAndPlay(index), 1000);
            }

        } else if (fullTrack.isServerTrack) {
            // --- SERVER AUDIO STREAM ROUTING ---
            activeEngine = 'local';

            // Stop and hide YouTube player
            stopYouTubeTimePoller();
            if (ytPlayer && ytPlayer.pauseVideo) {
                ytPlayer.pauseVideo();
            }
            const ytScreen = document.getElementById('youtube-monitor-panel');
            if (ytScreen) {
                ytScreen.style.display = 'none';
            }

            // Sync visualizer
            if (window.RuggedVisualizer) {
                window.RuggedVisualizer.setYouTubeMode(false);
            }

            // Revoke old object URL
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
                currentObjectUrl = null;
            }

            currentTrack = fullTrack;
            audio.src = fullTrack.url; // Assign server URL (e.g. music/song.mp3)
            
            callbacks.onTrackChange(currentTrack);
            updateMediaSessionMetadata(currentTrack);
            playTrack();

        } else {
            // --- LOCAL AUDIO ENGINE ROUTING ---
            activeEngine = 'local';

            // Stop and hide YouTube player
            stopYouTubeTimePoller();
            if (ytPlayer && ytPlayer.pauseVideo) {
                ytPlayer.pauseVideo();
            }
            const ytScreen = document.getElementById('youtube-monitor-panel');
            if (ytScreen) {
                ytScreen.style.display = 'none';
            }

            // Sync visualizer to use physical sound card frequencies
            if (window.RuggedVisualizer) {
                window.RuggedVisualizer.setYouTubeMode(false);
            }

            if (!fullTrack.file) {
                throw new Error(`Track Blob missing for local ID: ${fullTrack.id}`);
            }

            // Revoke old object URL
            if (currentObjectUrl) {
                URL.revokeObjectURL(currentObjectUrl);
            }

            // Fix empty or missing MIME type on iOS File app imports
            let fileBlob = fullTrack.file;
            if (!fileBlob.type || !fileBlob.type.startsWith('audio/')) {
                const ext = fullTrack.name.split('.').pop().toLowerCase();
                let inferredType = 'audio/mpeg';
                if (ext === 'mp3') inferredType = 'audio/mpeg';
                else if (ext === 'wav') inferredType = 'audio/wav';
                else if (ext === 'm4a') inferredType = 'audio/mp4';
                else if (ext === 'ogg') inferredType = 'audio/ogg';
                else if (ext === 'flac') inferredType = 'audio/flac';
                fileBlob = new Blob([fullTrack.file], { type: inferredType });
            }

            // Create new Blob URL
            currentObjectUrl = URL.createObjectURL(fileBlob);
            
            currentTrack = fullTrack;
            audio.src = currentObjectUrl;
            
            callbacks.onTrackChange(currentTrack);
            updateMediaSessionMetadata(currentTrack);
            playTrack();
        }

    } catch (err) {
        console.error('Failed to load track:', err);
    }
}

/**
 * Play current track.
 */
function playTrack() {
    if (activeEngine === 'local') {
        if (!audio.src) {
            if (activeQueue.length > 0) loadAndPlay(0);
            return;
        }
        try {
            isPlaying = true;
            callbacks.onPlayStateChange(isPlaying);
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
            }
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    console.warn('Local playback failed/requires gesture:', e);
                    isPlaying = false;
                    callbacks.onPlayStateChange(isPlaying);
                    if ('mediaSession' in navigator) {
                        navigator.mediaSession.playbackState = 'paused';
                    }
                });
            }
        } catch (e) {
            console.warn('Local playback failed/requires gesture:', e);
            isPlaying = false;
            callbacks.onPlayStateChange(isPlaying);
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
            }
        }
    } else if (activeEngine === 'youtube') {
        if (ytPlayer && ytPlayer.playVideo) {
            ytPlayer.playVideo();
        }
        isPlaying = true;
        callbacks.onPlayStateChange(isPlaying);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
    }
}

/**
 * Pause current track.
 */
function pauseTrack() {
    if (activeEngine === 'local') {
        audio.pause();
        isPlaying = false;
        callbacks.onPlayStateChange(isPlaying);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
    } else if (activeEngine === 'youtube') {
        if (ytPlayer && ytPlayer.pauseVideo) {
            ytPlayer.pauseVideo();
        }
        isPlaying = false;
        callbacks.onPlayStateChange(isPlaying);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
    }
}

/**
 * Toggle between Play and Pause.
 */
function togglePlay() {
    if (isPlaying) {
        pauseTrack();
    } else {
        playTrack();
    }
}

/**
 * Jump to the next track.
 */
function nextTrack() {
    if (activeQueue.length === 0) return;

    let nextIndex = currentQueueIndex + 1;
    if (nextIndex >= activeQueue.length) {
        nextIndex = 0;
    }

    loadAndPlay(nextIndex);
}

/**
 * Jump to the previous track.
 */
function prevTrack() {
    if (activeQueue.length === 0) return;

    let prevIndex = currentQueueIndex - 1;
    if (prevIndex < 0) {
        prevIndex = activeQueue.length - 1;
    }

    loadAndPlay(prevIndex);
}

/**
 * Handles automatic queue progression.
 */
function handleTrackEnded() {
    if (isLoop === 'track') {
        if (activeEngine === 'local') {
            audio.currentTime = 0;
            playTrack();
        } else if (activeEngine === 'youtube' && ytPlayer && ytPlayer.seekTo) {
            ytPlayer.seekTo(0, true);
            ytPlayer.playVideo();
        }
    } else if (isLoop === 'queue') {
        nextTrack();
    } else {
        if (currentQueueIndex < activeQueue.length - 1) {
            nextTrack();
        } else {
            pauseTrack();
            if (activeEngine === 'local') {
                audio.currentTime = 0;
            } else if (activeEngine === 'youtube' && ytPlayer && ytPlayer.seekTo) {
                ytPlayer.seekTo(0, true);
            }
        }
    }
}

/**
 * Seeks playback position.
 * @param {number} percent - Position from 0 to 1
 */
function seekTo(percent) {
    if (activeEngine === 'local') {
        if (!audio.duration) return;
        audio.currentTime = audio.duration * percent;
    } else if (activeEngine === 'youtube') {
        if (ytPlayer && ytPlayer.getDuration && ytPlayer.seekTo) {
            const duration = ytPlayer.getDuration();
            ytPlayer.seekTo(duration * percent, true);
        }
    }
}

/**
 * Sets playback volume and persists it.
 * @param {number} volume - From 0.0 to 1.0
 */
function setVolume(volume) {
    const val = Math.max(0, Math.min(1, volume));
    
    audio.volume = val;
    
    if (ytPlayer && ytPlayer.setVolume) {
        ytPlayer.setVolume(val * 100);
    }
    
    localStorage.setItem(LOCAL_STORAGE_VOL_KEY, val);
}

/**
 * Gets current volume.
 * @returns {number}
 */
function getVolume() {
    return audio ? audio.volume : 0.8;
}

/**
 * Toggles shuffle mode.
 */
function toggleShuffle() {
    isShuffle = !isShuffle;
    
    if (isShuffle && originalQueue.length > 0) {
        const trackId = currentTrack ? currentTrack.id : null;
        let pool = [...originalQueue];
        
        if (trackId) {
            pool = pool.filter(t => t.id !== trackId);
            activeQueue = [currentTrack, ...shuffleArray(pool)];
            currentQueueIndex = 0;
        } else {
            activeQueue = shuffleArray(pool);
            currentQueueIndex = -1;
        }
    } else {
        activeQueue = [...originalQueue];
        if (currentTrack) {
            currentQueueIndex = activeQueue.findIndex(t => t.id === currentTrack.id);
        }
    }

    callbacks.onQueueChange(activeQueue);
    return isShuffle;
}

/**
 * Toggles loop mode.
 */
function toggleLoop() {
    if (isLoop === 'none') {
        isLoop = 'queue';
    } else if (isLoop === 'queue') {
        isLoop = 'track';
    } else {
        isLoop = 'none';
    }
    return isLoop;
}

/**
 * Utility to shuffle an array.
 * @param {Array} array 
 * @returns {Array}
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Sets up OS media control session action handlers.
 */
/**
 * Sets up OS media control session action handlers.
 */
function setupMediaSessionHandlers() {
    if ('mediaSession' in navigator) {
        if (!isBgPlayEnabled) return;
        try {
            navigator.mediaSession.setActionHandler('play', () => {
                playTrack();
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                pauseTrack();
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                prevTrack();
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                nextTrack();
            });
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (activeEngine === 'local' && audio) {
                    audio.currentTime = details.seekTime;
                } else if (activeEngine === 'youtube' && ytPlayer && ytPlayer.seekTo) {
                    ytPlayer.seekTo(details.seekTime, true);
                }
            });
        } catch (e) {
            console.warn('Media Session Action Handlers setup failed:', e);
        }
    }
}

/**
 * Updates OS-level media metadata (lockscreen / notification controls).
 * @param {Object} track 
 */
function updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator) || !isBgPlayEnabled) return;

    try {
        const artwork = [];
        if (track.coverArt) {
            artwork.push({ src: track.coverArt, sizes: '256x256', type: 'image/png' });
        } else if (track.isYouTube && track.youtubeId) {
            artwork.push({
                src: `https://img.youtube.com/vi/${track.youtubeId}/hqdefault.jpg`,
                sizes: '480x360',
                type: 'image/jpeg'
            });
        } else {
            artwork.push({
                src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
                sizes: '1x1',
                type: 'image/png'
            });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: 'RUGGED PLAYER',
            artwork: artwork
        });
    } catch (e) {
        console.error('Failed to update Media Session metadata:', e);
    }
}

/**
 * Toggles background playback state (Media Session).
 * @param {boolean} enabled 
 */
function setBgPlaybackEnabled(enabled) {
    isBgPlayEnabled = enabled;
    if ('mediaSession' in navigator) {
        if (!isBgPlayEnabled) {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.playbackState = 'none';
        } else if (currentTrack) {
            setupMediaSessionHandlers();
            updateMediaSessionMetadata(currentTrack);
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }
    }
    return isBgPlayEnabled;
}

/**
 * Toggles YouTube video monitor visibility state.
 * @param {boolean} enabled 
 */
function setYtVideoEnabled(enabled) {
    isYtVideoEnabled = enabled;
    const ytScreen = document.getElementById('youtube-monitor-panel');
    if (ytScreen) {
        if (activeEngine === 'youtube' && isYtVideoEnabled) {
            ytScreen.style.display = 'block';
        } else {
            ytScreen.style.display = 'none';
        }
    }
    return isYtVideoEnabled;
}

/**
 * Unlocks the HTML5 audio element for background playback within a user gesture callback.
 * Call this synchronously inside click event handlers to satisfy browser autoplay requirements.
 */
function unlockAudio() {
    if (audio && audio.paused) {
        audio.play().then(() => {
            audio.pause();
        }).catch(e => {
            console.warn('Audio unlock gesture bypass:', e);
        });
    }
    if (window.RuggedVisualizer && window.RuggedVisualizer.resumeAudioContext) {
        window.RuggedVisualizer.resumeAudioContext();
    }
}

// Getters for player state
function getPlayerState() {
    return {
        currentTrack,
        isPlaying,
        isShuffle,
        isLoop,
        activeQueue,
        currentQueueIndex,
        activeEngine,
        isBgPlayEnabled,
        isYtVideoEnabled
    };
}

// Expose to global namespace
window.RuggedPlayer = {
    initPlayer,
    updateQueue,
    playTrack,
    pauseTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume,
    getVolume,
    toggleShuffle,
    toggleLoop,
    getPlayerState,
    setBgPlaybackEnabled,
    setYtVideoEnabled,
    unlockAudio
};
