/**
 * Rugged Music Player - Database Module (IndexedDB)
 * Handles persistent offline storage of audio files (Blobs) and playlist definitions.
 * Global namespace version for file:// protocol compatibility.
 */

const DB_NAME = 'RuggedMusicPlayerDB';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function initDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create tracks store (holds actual audio Blobs and metadata)
            if (!db.objectStoreNames.contains('tracks')) {
                db.createObjectStore('tracks', { keyPath: 'id' });
            }

            // Create playlists store (holds playlist name and list of track IDs)
            if (!db.objectStoreNames.contains('playlists')) {
                db.createObjectStore('playlists', { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            console.error('Database failed to open:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Helper to get a transaction and store.
 * @param {string} storeName 
 * @param {string} mode 
 * @returns {Promise<{transaction: IDBTransaction, store: IDBObjectStore}>}
 */
async function getStore(storeName, mode = 'readonly') {
    const db = await initDB();
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(mode === 'readwrite' ? storeName : storeName);
    return { transaction, store };
}

// --- TRACKS API ---

/**
 * Saves a track to the database.
 * @param {Object} track - The track metadata and audio Blob
 * @returns {Promise<string>} - Resolves with the track ID
 */
async function saveTrack(track) {
    const { store } = await getStore('tracks', 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.put(track);
        request.onsuccess = () => resolve(track.id);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Gets a track by ID, including its audio Blob.
 * @param {string} id 
 * @returns {Promise<Object>}
 */
async function getTrack(id) {
    const { store } = await getStore('tracks', 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Gets all stored tracks (metadata only, or full).
 * @returns {Promise<Array<Object>>}
 */
async function getAllTracks() {
    const { store } = await getStore('tracks', 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            // Sort by added date, descending
            const tracks = request.result || [];
            tracks.sort((a, b) => b.addedAt - a.addedAt);
            resolve(tracks);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Deletes a track from the database.
 * Also removes references to this track from all playlists.
 * @param {string} id 
 * @returns {Promise<void>}
 */
async function deleteTrack(id) {
    // 1. Delete from tracks store
    const { store: trackStore } = await getStore('tracks', 'readwrite');
    await new Promise((resolve, reject) => {
        const request = trackStore.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });

    // 2. Remove reference from all playlists
    const playlists = await getAllPlaylists();
    for (const playlist of playlists) {
        if (playlist.trackIds.includes(id)) {
            playlist.trackIds = playlist.trackIds.filter(trackId => trackId !== id);
            await savePlaylist(playlist);
        }
    }
}

/**
 * Calculates the total bytes consumed by all stored audio files.
 * @returns {Promise<number>} - Bytes
 */
async function getStorageUsage() {
    const tracks = await getAllTracks();
    return tracks.reduce((total, track) => total + (track.size || 0), 0);
}

// --- PLAYLISTS API ---

/**
 * Saves a playlist to the database.
 * @param {Object} playlist 
 * @returns {Promise<string>} - Resolves with playlist ID
 */
async function savePlaylist(playlist) {
    const { store } = await getStore('playlists', 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.put(playlist);
        request.onsuccess = () => resolve(playlist.id);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Gets all playlists.
 * @returns {Promise<Array<Object>>}
 */
async function getAllPlaylists() {
    const { store } = await getStore('playlists', 'readonly');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            const playlists = request.result || [];
            playlists.sort((a, b) => b.createdAt - a.createdAt);
            resolve(playlists);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Deletes a playlist.
 * @param {string} id 
 * @returns {Promise<void>}
 */
async function deletePlaylist(id) {
    const { store } = await getStore('playlists', 'readwrite');
    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// Expose to global namespace
window.RuggedDB = {
    initDB,
    saveTrack,
    getTrack,
    getAllTracks,
    deleteTrack,
    getStorageUsage,
    savePlaylist,
    getAllPlaylists,
    deletePlaylist
};
