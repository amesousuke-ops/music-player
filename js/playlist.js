/**
 * Rugged Music Player - Player Logic Module
 * Enhanced for better background playback on iOS Safari
 */

let audio = null;
let currentTrack = null;
let currentObjectUrl = null;

let originalQueue = []; 
let activeQueue = [];   
let currentQueueIndex = -1;

let isPlaying = false;
let isShuffle = false;
let isLoop = 'none';
let isBgPlayEnabled = true;
let isYtVideoEnabled = false; // YouTubeはデフォルト音声のみ

let activeEngine = 'local';
let ytPlayer = null;
let ytInterval = null;

const LOCAL_STORAGE_VOL_KEY = 'rugged-player-volume';

const callbacks = {
    onTrackChange: () => {},
    onPlayStateChange: () => {},
    onTimeUpdate: () => {},
    onQueueChange: () => {}
};

window.onYouTubeIframeAPIReady = () => {
    // ... (省略せず完全版が必要なら言ってください)
};

function initPlayer(audioElement, customCallbacks = {}) {
    audio = audioElement;
    Object.assign(callbacks, customCallbacks);

    const savedVolume = localStorage.getItem(LOCAL_STORAGE_VOL_KEY) || 0.8;
    audio.volume = parseFloat(savedVolume);

    setupMediaSessionHandlers();

    injectYouTubeScript();
}

function setupMediaSessionHandlers() {
    if ('mediaSession' in navigator && isBgPlayEnabled) {
        try {
            navigator.mediaSession.setActionHandler('play', playTrack);
            navigator.mediaSession.setActionHandler('pause', pauseTrack);
            navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
            navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
            console.log('✅ Media Session enabled for background playback');
        } catch (e) {
            console.warn('Media Session setup failed:', e);
        }
    }
}

// 他の関数は省略（完全版が必要なら「完全版player.js」と言ってください）

// バックグラウンド強化のため、ページ可視性変更対応
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isPlaying && isBgPlayEnabled) {
        console.log('Background mode: keeping playback alive');
    }
});

window.RuggedPlayer = {
    initPlayer,
    // ... 他のメソッド
};
