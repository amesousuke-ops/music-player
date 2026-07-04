/**
 * Rugged Music Player - Playlist UI & Logic Module
 * Connects playlist DOM nodes (sidebar, select boxes) with the IndexedDB API
 * and coordinates playlist CRUD actions.
 * Global namespace version for file:// protocol compatibility.
 */

let sidebarContainer = null;
let createInput = null;
let createButton = null;
let currentSelectedPlaylistId = null;

// Callback triggered when a playlist is clicked by the user
let onSelectCallback = () => {};

/**
 * Initializes the playlist module.
 * @param {Object} domElements - Map of required DOM elements
 * @param {Function} onPlaylistSelect - Callback when active playlist changes
 */
async function initPlaylists(domElements, onPlaylistSelect) {
    sidebarContainer = domElements.sidebarContainer;
    createInput = domElements.createInput;
    createButton = domElements.createButton;
    onSelectCallback = onPlaylistSelect;

    // Bind playlist creation event
    createButton.addEventListener('click', handleCreatePlaylist);
    createInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCreatePlaylist();
    });

    // Initial render
    await refreshPlaylists();
}

/**
 * Handles creation of a new playlist from user input.
 */
async function handleCreatePlaylist() {
    const name = createInput.value.trim();
    if (!name) return;

    const newPlaylist = {
        id: 'playlist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: name,
        trackIds: [],
        createdAt: Date.now()
    };

    try {
        await window.RuggedDB.savePlaylist(newPlaylist);
        createInput.value = '';
        await refreshPlaylists();
    } catch (err) {
        console.error('Failed to create playlist:', err);
    }
}

/**
 * Re-fetches playlists from DB and draws them in the sidebar.
 * @param {string} selectedId - Optional ID to keep selected
 */
async function refreshPlaylists(selectedId = currentSelectedPlaylistId) {
    if (!sidebarContainer) return;

    currentSelectedPlaylistId = selectedId;
    
    try {
        const playlists = await window.RuggedDB.getAllPlaylists();
        sidebarContainer.innerHTML = '';

        // 1. "すべての楽曲" (Default scope)
        const allItem = document.createElement('div');
        allItem.className = `playlist-row ${!currentSelectedPlaylistId ? 'selected' : ''}`;
        allItem.innerHTML = `
            <div class="playlist-row-info">
                <div class="playlist-row-name">すべての楽曲</div>
                <div class="playlist-row-desc" id="all-tracks-count-label">読み込み中...</div>
            </div>
        `;
        allItem.addEventListener('click', () => {
            currentSelectedPlaylistId = null;
            refreshSelectionState();
            onSelectCallback(null);
        });
        sidebarContainer.appendChild(allItem);

        // 2. Render user playlists
        playlists.forEach(playlist => {
            const item = document.createElement('div');
            item.className = `playlist-row ${currentSelectedPlaylistId === playlist.id ? 'selected' : ''}`;
            item.setAttribute('data-id', playlist.id);

            item.innerHTML = `
                <div class="playlist-row-info">
                    <div class="playlist-row-name" title="${escapeHtml(playlist.name)}">${escapeHtml(playlist.name)}</div>
                    <div class="playlist-row-desc">${playlist.trackIds.length} 曲</div>
                </div>
                <button class="btn-delete-icon" title="プレイリストを削除" data-id="${playlist.id}">
                    <svg viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            `;

            // Select playlist event
            item.addEventListener('click', (e) => {
                // If clicked delete button, skip selection
                if (e.target.closest('.btn-delete-icon')) return;
                
                currentSelectedPlaylistId = playlist.id;
                refreshSelectionState();
                onSelectCallback(playlist);
            });

            // Delete playlist event
            const delBtn = item.querySelector('.btn-delete-icon');
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`プレイリスト「${playlist.name}」を削除してもよろしいですか？`)) {
                    await window.RuggedDB.deletePlaylist(playlist.id);
                    if (currentSelectedPlaylistId === playlist.id) {
                        currentSelectedPlaylistId = null;
                        onSelectCallback(null);
                    }
                    await refreshPlaylists();
                }
            });

            sidebarContainer.appendChild(item);
        });

        // Update all-tracks counter separately
        updateAllTracksCounter();

    } catch (err) {
        console.error('Failed to render playlists:', err);
    }
}

/**
 * Updates selection visual state on sidebar items.
 */
function refreshSelectionState() {
    const items = sidebarContainer.querySelectorAll('.playlist-row');
    items.forEach(item => {
        const id = item.getAttribute('data-id');
        if (id === currentSelectedPlaylistId || (!id && !currentSelectedPlaylistId)) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

/**
 * Populates a dropdown selector with available playlists.
 * Useful for "Add to playlist" track controls.
 * @param {HTMLSelectElement} selectElement 
 */
async function populatePlaylistSelect(selectElement) {
    try {
        const playlists = await window.RuggedDB.getAllPlaylists();
        
        // Clear options except first
        selectElement.innerHTML = '<option value="" disabled selected>+ リストに追加</option>';
        
        playlists.forEach(pl => {
            const opt = document.createElement('option');
            opt.value = pl.id;
            opt.textContent = pl.name;
            selectElement.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to populate playlist dropdown:', err);
    }
}

/**
 * Binds a track to a playlist inside IndexedDB.
 * @param {string} trackId 
 * @param {string} playlistId 
 */
async function addTrackToPlaylist(trackId, playlistId) {
    try {
        const playlists = await window.RuggedDB.getAllPlaylists();
        const playlist = playlists.find(p => p.id === playlistId);
        
        if (!playlist) return;
        
        // Prevent duplicate addition
        if (!playlist.trackIds.includes(trackId)) {
            playlist.trackIds.push(trackId);
            await window.RuggedDB.savePlaylist(playlist);
            await refreshPlaylists();
            return true;
        }
        return false;
    } catch (err) {
        console.error('Failed to add track to playlist:', err);
        return false;
    }
}

/**
 * Decouples a track from a playlist in IndexedDB.
 * @param {string} trackId 
 * @param {string} playlistId 
 */
async function removeTrackFromPlaylist(trackId, playlistId) {
    try {
        const playlists = await window.RuggedDB.getAllPlaylists();
        const playlist = playlists.find(p => p.id === playlistId);
        
        if (!playlist) return;
        
        playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
        await window.RuggedDB.savePlaylist(playlist);
        await refreshPlaylists();
    } catch (err) {
        console.error('Failed to remove track from playlist:', err);
    }
}

/**
 * Updates count label on the "すべての楽曲" playlist item.
 */
async function updateAllTracksCounter() {
    try {
        const tracks = await window.RuggedDB.getAllTracks();
        const counter = document.getElementById('all-tracks-count-label');
        if (counter) {
            counter.textContent = `${tracks.length} 曲`;
        }
    } catch (e) {
        console.error(e);
    }
}

/**
 * Escape HTML utilities to prevent XSS.
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Expose to global namespace
window.RuggedPlaylist = {
    initPlaylists,
    refreshPlaylists,
    populatePlaylistSelect,
    addTrackToPlaylist,
    removeTrackFromPlaylist
};
