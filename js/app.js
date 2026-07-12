/**
 * Rugged Music Player - Master Application Coordinator
 * Initializes database, playback engine, playlist module, and drag-and-drop slots.
 * Coordinates rendering of track tables, drive space counters, progress timelines,
 * glowing status indicators, and custom metadata/illustration editor modals.
 * Global namespace version for file:// protocol compatibility.
 * Comprehensive Japanese Translation + YouTube Integration + Song Metadata Editor Edition.
 */

// DOM elements mapping
const DOM = {};

// Application-wide Scope State
let currentActivePlaylist = null; // null represents "すべての楽曲"

// Track Editor Modal State
let activeEditTrackId = null;
let activeEditCoverArt = null; // Stores Base64 string of cover art image

/**
 * Main entrypoint. Initiates application elements.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Map all UI DOM elements
    cacheElements();

    // 2. Initialize Database
    try {
        await window.RuggedDB.initDB();
    } catch (e) {
        showGlobalError('致命的エラー: DB接続失敗');
        return;
    }

    // 3. Initialize Playback Engine
    window.RuggedPlayer.initPlayer(DOM.audio, {
        onTrackChange: handleTrackChange,
        onPlayStateChange: handlePlayStateChange,
        onTimeUpdate: handleTimeUpdate,
        onQueueChange: handleQueueChange
    });

    // 4. Initialize Playlist Sidebar
    await window.RuggedPlaylist.initPlaylists({
        sidebarContainer: DOM.playlistsList,
        createInput: DOM.newPlaylistInput,
        createButton: DOM.btnCreatePlaylist
    }, handlePlaylistSelected);

    // 5. Initialize Drag and Drop uploads
    initDragAndDrop();

    // 6. Bind tactile hardware controls
    bindInterfaceControls();

    // 7. Initial loading of tracks and storage
    await refreshTracksList();
    await updateStorageGauge();
    updateSettingsUI();
});

/**
 * Caches DOM nodes.
 */
function cacheElements() {
    DOM.audio = document.getElementById('audio-player');
    
    // HUD Displays
    DOM.vfdTitle = document.getElementById('vfd-track-title');
    DOM.vfdArtist = document.getElementById('vfd-track-artist');
    DOM.vfdStatus = document.getElementById('vfd-status-text');
    DOM.vfdLoop = document.getElementById('vfd-loop-text');
    DOM.vfdBlink = document.getElementById('vfd-blink-dot');
    DOM.visualizer = document.getElementById('visualizer-canvas');
    
    // Player Controls
    DOM.btnPlay = document.getElementById('btn-play');
    DOM.btnPrev = document.getElementById('btn-prev');
    DOM.btnNext = document.getElementById('btn-next');
    DOM.btnShuffle = document.getElementById('btn-shuffle');
    DOM.btnLoop = document.getElementById('btn-loop');
    DOM.volumeSlider = document.getElementById('volume-slider');
    
    // Timeline Seek
    DOM.currentTimeLabel = document.getElementById('time-current');
    DOM.totalTimeLabel = document.getElementById('time-total');
    DOM.progressRail = document.getElementById('progress-rail');
    DOM.progressFill = document.getElementById('progress-fill');

    // Sidebar & Playlists
    DOM.playlistsList = document.getElementById('playlists-list');
    DOM.newPlaylistInput = document.getElementById('new-playlist-input');
    DOM.btnCreatePlaylist = document.getElementById('btn-create-playlist');
    DOM.storageGauge = document.getElementById('storage-gauge');
    DOM.storageStats = document.getElementById('storage-stats');

    // File Input / YouTube Inputs
    DOM.fileInput = document.getElementById('file-input');
    DOM.uploaderSlot = document.getElementById('uploader-slot');
    DOM.youtubeUrlInput = document.getElementById('youtube-url-input');
    DOM.btnAddYoutube = document.getElementById('btn-add-youtube');

    // Track table
    DOM.trackTableBody = document.getElementById('track-table-body');
    DOM.playlistContextTitle = document.getElementById('playlist-context-title');

    // Bottom Player cover & Playlist cover
    DOM.playerTrackCover = document.getElementById('player-track-cover');
    DOM.playlistHeaderCover = document.getElementById('playlist-header-cover');

    // Track Editor Modal nodes
    DOM.editorModal = document.getElementById('editor-modal');
    DOM.modalCoverPreview = document.getElementById('modal-cover-preview');
    DOM.btnSelectCover = document.getElementById('btn-select-cover');
    DOM.coverFileInput = document.getElementById('cover-file-input');
    DOM.editTitleInput = document.getElementById('edit-title-input');
    DOM.editArtistInput = document.getElementById('edit-artist-input');
    DOM.btnCancelEdit = document.getElementById('btn-cancel-edit');
    DOM.btnSaveEdit = document.getElementById('btn-save-edit');
    DOM.btnToggleBg = document.getElementById('btn-toggle-bg');
    DOM.btnToggleYtVideo = document.getElementById('btn-toggle-yt-video');
}

/**
 * Binds UI inputs to operations.
 */
function bindInterfaceControls() {
    // Volume Slider
    DOM.volumeSlider.value = window.RuggedPlayer.getVolume();
    DOM.volumeSlider.addEventListener('input', (e) => {
        window.RuggedPlayer.setVolume(parseFloat(e.target.value));
    });

    // Playback Buttons
    DOM.btnPlay.addEventListener('click', () => {
        window.RuggedPlayer.unlockAudio();
        window.RuggedVisualizer.initVisualizer(DOM.audio, DOM.visualizer);
        window.RuggedPlayer.togglePlay();
    });
    DOM.btnNext.addEventListener('click', () => {
        window.RuggedPlayer.unlockAudio();
        window.RuggedPlayer.nextTrack();
    });
    DOM.btnPrev.addEventListener('click', () => {
        window.RuggedPlayer.unlockAudio();
        window.RuggedPlayer.prevTrack();
    });

    // Shuffle & Loop toggles
    DOM.btnShuffle.addEventListener('click', () => {
        const isShuffleOn = window.RuggedPlayer.toggleShuffle();
        DOM.btnShuffle.classList.toggle('active', isShuffleOn);
    });

    DOM.btnLoop.addEventListener('click', () => {
        const loopMode = window.RuggedPlayer.toggleLoop();
        updateLoopStatusUI(loopMode);
    });

    // Timeline Seeking
    DOM.progressRail.addEventListener('click', (e) => {
        const rect = DOM.progressRail.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / rect.width;
        window.RuggedPlayer.seekTo(percent);
    });

    // File selection click handler
    DOM.uploaderSlot.addEventListener('click', () => {
        DOM.fileInput.click();
    });
    DOM.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files);
            DOM.fileInput.value = ''; // Reset
        }
    });

    // YouTube Add URL Link click handler
    DOM.btnAddYoutube.addEventListener('click', handleYouTubeAddClick);
    DOM.youtubeUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleYouTubeAddClick();
    });

    // Track Editor Modal Bindings
    DOM.btnSelectCover.addEventListener('click', () => {
        DOM.coverFileInput.click();
    });
    DOM.coverFileInput.addEventListener('change', handleCoverUpload);
    DOM.btnCancelEdit.addEventListener('click', closeEditorModal);
    DOM.btnSaveEdit.addEventListener('click', handleSaveTrackEdit);

    // 下部再生バーの曲名や画像をクリックした際、即座に曲編集を開くように設計 (曲の編集を圧倒的に簡単に)
    const handleBottomPlayerEditClick = () => {
        const state = window.RuggedPlayer.getPlayerState();
        if (state.currentTrack) {
            openEditorModal(state.currentTrack.id);
        }
    };
    DOM.playerTrackCover.addEventListener('click', handleBottomPlayerEditClick);
    DOM.vfdTitle.addEventListener('click', handleBottomPlayerEditClick);
    DOM.vfdArtist.addEventListener('click', handleBottomPlayerEditClick);

    // Toggle Background Playback
    DOM.btnToggleBg.addEventListener('click', () => {
        const state = window.RuggedPlayer.getPlayerState();
        const nextState = !state.isBgPlayEnabled;
        window.RuggedPlayer.setBgPlaybackEnabled(nextState);
        updateSettingsUI();
    });

    // Toggle YouTube Video Display
    DOM.btnToggleYtVideo.addEventListener('click', () => {
        const state = window.RuggedPlayer.getPlayerState();
        const nextState = !state.isYtVideoEnabled;
        window.RuggedPlayer.setYtVideoEnabled(nextState);
        updateSettingsUI();
    });
}

/**
 * Parses and fetches YouTube link metadata, then writes it into IndexedDB.
 */
async function handleYouTubeAddClick() {
    const url = DOM.youtubeUrlInput.value.trim();
    if (!url) return;

    const videoId = extractYouTubeId(url);
    if (!videoId) {
        alert('YouTubeのURL形式が正しくありません。\n（例: https://www.youtube.com/watch?v=... または https://youtu.be/...）');
        return;
    }

    DOM.vfdStatus.textContent = '情報取得中...';
    DOM.vfdBlink.classList.add('active');

    try {
        // Use a CORS-friendly oEmbed proxy to fetch the video's title and author/uploader
        const noembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(noembedUrl);
        const data = await response.json();

        const trackTitle = data.title || `YouTube動画 (${videoId})`;
        const trackArtist = data.author_name || 'YouTubeストリーム';

        const track = {
            id: 'track_yt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: 'YouTube: ' + videoId,
            title: trackTitle,
            artist: trackArtist,
            duration: 0, // Will be synced in player during playback once loaded
            size: 0, 
            type: 'audio/youtube',
            file: null, 
            isYouTube: true,
            youtubeId: videoId,
            coverArt: null, // Custom cover image placeholders
            addedAt: Date.now()
        };

        await window.RuggedDB.saveTrack(track);
        
        DOM.youtubeUrlInput.value = '';
        DOM.vfdStatus.textContent = '登録完了';
        
        alert(`YouTube曲の登録に成功しました！\n曲名: ${trackTitle}`);
        
        await refreshTracksList();
        await updateStorageGauge();
        await window.RuggedPlaylist.refreshPlaylists();

    } catch (err) {
        console.error('YouTubeメタデータの取得に失敗しました:', err);
        // Save anyway with default placeholders
        const track = {
            id: 'track_yt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            name: 'YouTube: ' + videoId,
            title: `YouTubeストリーム (${videoId})`,
            artist: 'YouTube',
            duration: 0,
            size: 0,
            type: 'audio/youtube',
            file: null,
            isYouTube: true,
            youtubeId: videoId,
            coverArt: null,
            addedAt: Date.now()
        };
        await window.RuggedDB.saveTrack(track);
        DOM.youtubeUrlInput.value = '';
        
        alert(`通信エラーのため曲情報は取得できませんでしたが、予備の名前で登録しました！\n曲名: YouTubeストリーム (${videoId})`);
        
        await refreshTracksList();
        await updateStorageGauge();
        await window.RuggedPlaylist.refreshPlaylists();
    } finally {
        setTimeout(() => { DOM.vfdStatus.textContent = 'システム稼働中'; }, 1500);
        DOM.vfdBlink.classList.remove('active');
    }
}

/**
 * Bulletproof extraction of 11-character YouTube video ID from any URL format.
 * Matches shorts, live, embed formats, standard watch formats, youtu.be, and pure video IDs.
 */
function extractYouTubeId(url) {
    url = url.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    // 1. Shorts / Live / Embed format: /shorts/ID, /live/ID, /embed/ID
    const pathRegex = /\/(shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/;
    const pathMatch = url.match(pathRegex);
    if (pathMatch) return pathMatch[2];

    // 2. Standard watch format: ?v=ID, &v=ID
    const queryRegex = /[?&]v=([a-zA-Z0-9_-]{11})/;
    const queryMatch = url.match(queryRegex);
    if (queryMatch) return queryMatch[1];

    // 3. Short URL format: youtu.be/ID
    const shortRegex = /youtu\.be\/([a-zA-Z0-9_-]{11})/;
    const shortMatch = url.match(shortRegex);
    if (shortMatch) return shortMatch[1];

    // 4. Try parsing directly if it is just a raw 11-character ID
    if (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url)) {
        return url;
    }

    return null;
}

/**
 * Sets up drag-and-drop loading events.
 */
function initDragAndDrop() {
    const slot = DOM.uploaderSlot;
    
    ['dragenter', 'dragover'].forEach(eventName => {
        slot.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            slot.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        slot.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            slot.classList.remove('dragover');
        }, false);
    });

    slot.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileUpload(files);
        }
    });
}

/**
 * Checks if the local helper upload server is running on localhost.
 * @returns {Promise<boolean>}
 */
async function checkLocalServer() {
    try {
        const response = await fetch('http://localhost:3000/status', { mode: 'cors' });
        if (response.ok) {
            const data = await response.json();
            return data.status === 'online';
        }
    } catch (e) {
        // Offline or blocked
    }
    return false;
}

/**
 * Processes list of local uploaded files and puts them in either local server or IndexedDB.
 */
async function handleFileUpload(files) {
    DOM.vfdStatus.textContent = '同期確認中...';
    DOM.vfdBlink.classList.add('active');

    const isLocalServerOnline = await checkLocalServer();

    if (isLocalServerOnline) {
        DOM.vfdStatus.textContent = '外部同期中...';
        let syncSuccessCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.type.startsWith('audio/')) {
                console.warn('オーディオファイルではないためスキップしました:', file.name);
                continue;
            }

            try {
                DOM.vfdStatus.textContent = `同期中 [${i+1}/${files.length}]`;
                const response = await fetch('http://localhost:3000/upload', {
                    method: 'POST',
                    headers: {
                        'X-File-Name': encodeURIComponent(file.name),
                        'Content-Type': file.type
                    },
                    body: file
                });

                if (response.ok) {
                    syncSuccessCount++;
                } else {
                    console.error('Server sync failed for file:', file.name);
                }
            } catch (err) {
                console.error('Local server sync error:', err);
            }
        }

        DOM.vfdStatus.textContent = 'システム稼働中';
        DOM.vfdBlink.classList.remove('active');

        if (syncSuccessCount > 0) {
            alert(`${syncSuccessCount} 曲のPC同期とGitHub送信に成功しました！\n1〜2分後にスマホ版に反映されます。`);
            await refreshTracksList();
        } else {
            alert('同期に失敗しました。ローカルサーバーのコンソールを確認してください。');
        }
        return;
    }

    // Default Local IndexedDB fallback
    let importedCount = 0;
    DOM.vfdStatus.textContent = '取り込み中...';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (!file.type.startsWith('audio/')) {
            console.warn('オーディオファイルではないためスキップしました:', file.name);
            continue;
        }

        try {
            const duration = 0; // Set to 0 to prevent iOS Safari from hanging. Dynamic duration sync will update this on first play.
            const cleanMetadata = parseFilename(file.name);

            const track = {
                id: 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: file.name,
                title: cleanMetadata.title,
                artist: cleanMetadata.artist,
                duration: duration,
                size: file.size,
                type: file.type,
                file: file, 
                coverArt: null, // Holds base64 cover image if uploaded
                addedAt: Date.now()
            };

            await window.RuggedDB.saveTrack(track);
            importedCount++;
        } catch (err) {
            console.error('取り込みに失敗しました:', file.name, err);
        }
    }

    DOM.vfdStatus.textContent = 'システム稼働中';
    DOM.vfdBlink.classList.remove('active');

    if (importedCount > 0) {
        await refreshTracksList();
        await updateStorageGauge();
        await window.RuggedPlaylist.refreshPlaylists();
    }
}

/**
 * Decodes audio duration programmatically.
 */
function getAudioDuration(file) {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const tempAudio = new Audio(objectUrl);
        
        tempAudio.addEventListener('loadedmetadata', () => {
            URL.revokeObjectURL(objectUrl);
            resolve(tempAudio.duration || 0);
        });

        tempAudio.addEventListener('error', () => {
            URL.revokeObjectURL(objectUrl);
            resolve(0); 
        });
    });
}

/**
 * Splits filenames into parsed objects.
 */
function parseFilename(filename) {
    const cleanName = filename.replace(/\.[^/.]+$/, "");
    const parts = cleanName.split('-');
    
    if (parts.length > 1) {
        return {
            artist: parts[0].trim(),
            title: parts.slice(1).join('-').trim()
        };
    } else {
        return {
            artist: 'アーティスト不明',
            title: cleanName.trim()
        };
    }
}

/**
 * Fetches server-hosted tracks configured inside tracks.json
 */
async function loadServerTracks() {
    try {
        const response = await fetch('tracks.json?v=' + Date.now());
        if (response.ok) {
            const serverTracks = await response.json();
            // Mark them as server tracks and assign unique IDs if not present
            return serverTracks.map((t, idx) => {
                t.isServerTrack = true;
                if (!t.id) t.id = 'track_server_' + idx;
                return t;
            });
        }
    } catch (e) {
        console.warn('Failed to load server tracks from tracks.json:', e);
    }
    return [];
}

/**
 * Refreshes track table display based on scope.
 */
async function refreshTracksList() {
    try {
        const isServerOnline = await checkLocalServer();
        const allLocalTracks = await window.RuggedDB.getAllTracks();
        const serverTracks = await loadServerTracks();
        const allTracks = [...serverTracks, ...allLocalTracks];
        let displayTracks = [];

        if (currentActivePlaylist === null) {
            DOM.playlistContextTitle.textContent = 'すべての楽曲';
            displayTracks = allTracks;
            
            // Set header banner cover image to default CD/music uploader
            renderPlaylistHeaderCover(null);
        } else {
            DOM.playlistContextTitle.textContent = currentActivePlaylist.name;
            displayTracks = allTracks.filter(track => currentActivePlaylist.trackIds.includes(track.id));
            
            displayTracks.sort((a, b) => {
                return currentActivePlaylist.trackIds.indexOf(a.id) - currentActivePlaylist.trackIds.indexOf(b.id);
            });

            // Set playlist header image (uses cover of first song in playlist if available, otherwise default)
            const firstTrackInPlaylist = displayTracks.length > 0 ? displayTracks[0] : null;
            renderPlaylistHeaderCover(firstTrackInPlaylist);
        }

        // Render table rows
        DOM.trackTableBody.innerHTML = '';

        if (displayTracks.length === 0) {
            DOM.trackTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        ${currentActivePlaylist ? 'プレイリストは空です。「すべての楽曲」一覧の「リストに追加」から曲を追加してください。' : 'ライブラリに曲がありません。左の「楽曲のインポート」または「YouTubeリンクを追加」から登録してください。'}
                    </td>
                </tr>
            `;
            await window.RuggedPlayer.updateQueue([]);
            return;
        }

        await window.RuggedPlayer.updateQueue(displayTracks);

        const state = window.RuggedPlayer.getPlayerState();

        displayTracks.forEach((track, index) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-id', track.id);
            
            if (state.currentTrack && state.currentTrack.id === track.id) {
                tr.className = 'playing';
            }

            const trackNo = String(index + 1).padStart(2, '0');
            
            // Format size label based on track source
            let sizeLabel = '';
            if (track.isServerTrack) {
                sizeLabel = '<span style="color:var(--color-amber-glow);font-weight:bold;">配信</span>';
            } else if (track.isYouTube) {
                sizeLabel = '<span style="color:var(--color-amber-glow);font-weight:bold;">ストリーム</span>';
            } else {
                sizeLabel = (track.size / (1024 * 1024)).toFixed(1) + ' MB';
            }

            // Format duration label
            const durationFormatted = track.duration > 0 ? formatTime(track.duration) : (track.isYouTube ? 'YouTube' : '配信');

            tr.innerHTML = `
                <td style="width: 50px; text-align: center; color: var(--color-text-dim); font-weight: bold;">${trackNo}</td>
                <td style="font-weight: bold;">
                    ${track.isYouTube ? '<span style="color:var(--color-amber-glow); font-size:0.75rem; margin-right:4px;">[YT]</span>' : ''}
                    ${track.isServerTrack ? '<span style="color:var(--color-amber-glow); font-size:0.75rem; margin-right:4px;">[配信]</span>' : ''}
                    ${escapeHtml(track.title)}
                </td>
                <td style="color: var(--color-text-dim);">${escapeHtml(track.artist)}</td>
                <td style="color: var(--color-text-dim); font-size: 0.75rem;">${sizeLabel}</td>
                <td>
                    <div class="action-cell" onclick="event.stopPropagation();">
                        <span style="margin-right:15px; font-weight:bold; color: var(--color-text-dim);">${durationFormatted}</span>
                        ${
                            currentActivePlaylist 
                            ? `<button class="btn-delete-icon btn-remove-pl" data-track-id="${track.id}" title="プレイリストから削除">
                                <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
                               </button>`
                            : `<select class="select-simple playlist-adder" data-track-id="${track.id}">
                                <option value="" disabled selected>+ リストに追加</option>
                               </select>`
                        }
                        ${
                            (track.isServerTrack && !isServerOnline) ? '' : `
                            ${track.isServerTrack ? '' : `
                            <button class="btn-delete-icon btn-edit-track" data-track-id="${track.id}" title="情報を編集">
                                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                            </button>
                            `}
                            <button class="btn-delete-icon btn-destroy-track" data-track-id="${track.id}" title="完全に削除">
                                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            </button>
                            `
                        }
                    </div>
                </td>
            `;

            // Double click / Click to play row
            tr.addEventListener('click', () => {
                window.RuggedPlayer.unlockAudio();
                window.RuggedVisualizer.initVisualizer(DOM.audio, DOM.visualizer);
                window.RuggedPlayer.updateQueue(displayTracks, track.id);
            });

            // Bind playlist selection adder dropdown
            if (!currentActivePlaylist) {
                const adder = tr.querySelector('.playlist-adder');
                window.RuggedPlaylist.populatePlaylistSelect(adder);
                adder.addEventListener('change', async (e) => {
                    const plId = e.target.value;
                    const trackId = e.target.getAttribute('data-track-id');
                    if (plId) {
                        const added = await window.RuggedPlaylist.addTrackToPlaylist(trackId, plId);
                        if (added) {
                            DOM.vfdStatus.textContent = '登録完了';
                            setTimeout(() => { DOM.vfdStatus.textContent = 'システム稼働中'; }, 1500);
                        }
                        adder.value = ''; 
                    }
                });
            } else {
                const removeBtn = tr.querySelector('.btn-remove-pl');
                removeBtn.addEventListener('click', async () => {
                    const trackId = removeBtn.getAttribute('data-track-id');
                    await window.RuggedPlaylist.removeTrackFromPlaylist(trackId, currentActivePlaylist.id);
                    await refreshPlaylistScope();
                });
            }

            // Bind Edit Modal click
            const editBtn = tr.querySelector('.btn-edit-track');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditorModal(track.id);
                });
            }

            // Permanently destroy track
            const destroyBtn = tr.querySelector('.btn-destroy-track');
            if (destroyBtn) {
                destroyBtn.addEventListener('click', async () => {
                    const trackId = destroyBtn.getAttribute('data-track-id');
                    
                    if (track.isServerTrack) {
                        const confirmMsg = `配信曲「${track.title}」をサーバーおよびGitHubから完全に削除しますか？\n（PCのファイルも削除され、自動的に同期されます）`;
                        if (confirm(confirmMsg)) {
                            DOM.vfdStatus.textContent = '同期削除中...';
                            DOM.vfdBlink.classList.add('active');
                            try {
                                const response = await fetch('http://localhost:3000/delete', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ url: track.url })
                                });
                                if (response.ok) {
                                    alert(`配信曲「${track.title}」の削除と同期が成功しました！\n1〜2分後にスマホ版に反映されます。`);
                                    await refreshTracksList();
                                } else {
                                    alert('サーバーでの削除に失敗しました。');
                                }
                            } catch (e) {
                                console.error('Delete request failed:', e);
                                alert('同期サーバーに接続できません。');
                            } finally {
                                DOM.vfdStatus.textContent = 'システム稼働中';
                                DOM.vfdBlink.classList.remove('active');
                            }
                        }
                        return;
                    }

                    const confirmMsg = track.isYouTube 
                        ? `YouTubeストリーム「${track.title}」をライブラリから削除しますか？`
                        : `楽曲「${track.title}」をローカルデータベースから完全に削除しますか？\n（プレイリストからも自動的に削除されます。この操作は取り消せません）`;
                    
                    if (confirm(confirmMsg)) {
                        await window.RuggedDB.deleteTrack(trackId);
                        await refreshTracksList();
                        await updateStorageGauge();
                        await window.RuggedPlaylist.refreshPlaylists();
                    }
                });
            }

            DOM.trackTableBody.appendChild(tr);
        });

    } catch (err) {
        console.error('Failed to load track list UI:', err);
    }
}

// --- TRACK METADATA EDITOR MODAL LOGIC ---

/**
 * Opens the track information metadata editor modal.
 * @param {string} trackId 
 */
async function openEditorModal(trackId) {
    activeEditTrackId = trackId;
    activeEditCoverArt = null;

    try {
        const track = await window.RuggedDB.getTrack(trackId);
        if (!track) return;

        // Set form inputs
        DOM.editTitleInput.value = track.title;
        DOM.editArtistInput.value = track.artist;

        // Render preview image
        renderModalCoverPreview(track);

        // Display modal
        DOM.editorModal.style.display = 'flex';
    } catch (e) {
        console.error('Failed to open metadata editor:', e);
    }
}

/**
 * Hides the editor modal.
 */
function closeEditorModal() {
    DOM.editorModal.style.display = 'none';
    DOM.coverFileInput.value = ''; // Reset input
    activeEditTrackId = null;
    activeEditCoverArt = null;
}

/**
 * Handles cover art image upload file reading.
 */
function handleCoverUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        // Cache base64 string
        activeEditCoverArt = event.target.result;
        
        // Update modal preview dynamically
        DOM.modalCoverPreview.innerHTML = `<img src="${activeEditCoverArt}" alt="カバーアートプレビュー">`;
    };
    reader.readAsDataURL(file);
}

/**
 * Writes edited metadata (Title, Artist, Base64 Cover Art) back into IndexedDB.
 */
async function handleSaveTrackEdit() {
    if (!activeEditTrackId) return;

    try {
        const track = await window.RuggedDB.getTrack(activeEditTrackId);
        if (!track) return;

        // Update properties
        track.title = DOM.editTitleInput.value.trim() || track.title;
        track.artist = DOM.editArtistInput.value.trim() || track.artist;

        if (activeEditCoverArt) {
            track.coverArt = activeEditCoverArt;
        }

        // Put back into DB
        await window.RuggedDB.saveTrack(track);

        // Success notification
        DOM.vfdStatus.textContent = '編集データ保存';
        setTimeout(() => { DOM.vfdStatus.textContent = 'システム稼働中'; }, 1500);

        closeEditorModal();

        // Refresh UI components
        await refreshTracksList();
        await window.RuggedPlaylist.refreshPlaylists();

        // If the edited track is currently playing, dynamically sync HUD and cover thumbnails instantly!
        const state = window.RuggedPlayer.getPlayerState();
        if (state.currentTrack && state.currentTrack.id === track.id) {
            DOM.vfdTitle.textContent = track.title;
            DOM.vfdArtist.textContent = track.artist;
            renderPlayerTrackCover(track);
            
            // Sync loaded state in player
            state.currentTrack.title = track.title;
            state.currentTrack.artist = track.artist;
            if (track.coverArt) state.currentTrack.coverArt = track.coverArt;
        }

    } catch (e) {
        console.error('Failed to save metadata edits:', e);
        alert('曲情報の保存中にエラーが発生しました。');
    }
}

// --- DYNAMIC ALBUM ART DRAWING ENGINE ---

/**
 * Renders the preview box cover inside the modal.
 * @param {Object} track 
 */
function renderModalCoverPreview(track) {
    if (track.coverArt) {
        DOM.modalCoverPreview.innerHTML = `<img src="${track.coverArt}" alt="プレビュー">`;
    } else if (track.isYouTube && track.youtubeId) {
        // Fallback to YouTube video thumbnail
        const ytThumb = `https://img.youtube.com/vi/${track.youtubeId}/hqdefault.jpg`;
        DOM.modalCoverPreview.innerHTML = `<img src="${ytThumb}" alt="YouTubeプレビュー">`;
    } else {
        // Default music note SVG
        DOM.modalCoverPreview.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        `;
    }
}

/**
 * Renders the album art next to the song title in the bottom player deck.
 * @param {Object|null} track 
 */
function renderPlayerTrackCover(track) {
    if (!track) {
        DOM.playerTrackCover.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        `;
        return;
    }

    if (track.coverArt) {
        DOM.playerTrackCover.innerHTML = `<img src="${track.coverArt}" alt="再生カバー">`;
    } else if (track.isYouTube && track.youtubeId) {
        const ytThumb = `https://img.youtube.com/vi/${track.youtubeId}/hqdefault.jpg`;
        DOM.playerTrackCover.innerHTML = `<img src="${ytThumb}" alt="YouTube再生カバー">`;
    } else {
        DOM.playerTrackCover.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        `;
    }
}

/**
 * Renders the large album art image in the active playlist cover banner.
 * @param {Object|null} track - First track metadata in active playlist
 */
function renderPlaylistHeaderCover(track) {
    if (!track) {
        DOM.playlistHeaderCover.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>
        `;
        return;
    }

    if (track.coverArt) {
        DOM.playlistHeaderCover.innerHTML = `<img src="${track.coverArt}" alt="プレイリストカバー">`;
    } else if (track.isYouTube && track.youtubeId) {
        const ytThumb = `https://img.youtube.com/vi/${track.youtubeId}/hqdefault.jpg`;
        DOM.playlistHeaderCover.innerHTML = `<img src="${ytThumb}" alt="YouTubeプレイリストカバー">`;
    } else {
        DOM.playlistHeaderCover.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.04-.42 1.99-1.07 2.75z"/></svg>
        `;
    }
}

/**
 * Keeps storage indicator up to date.
 */
async function updateStorageGauge() {
    try {
        let quotaBytes = 1024 * 1024 * 1024; // Default fallback to 1GB
        const usageBytes = await window.RuggedDB.getStorageUsage();
        
        // Query browser storage system for actual device limit allocated for this origin
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            if (estimate.quota) {
                quotaBytes = estimate.quota;
            }
        }

        const mbUsed = usageBytes / (1024 * 1024);
        const mbQuota = quotaBytes / (1024 * 1024);
        const percent = Math.min(100, (mbUsed / mbQuota) * 100);

        DOM.storageGauge.style.width = `${percent}%`;

        // Format label beautifully based on scale (MB vs GB)
        const usedStr = mbUsed.toFixed(1) + ' MB';
        const quotaStr = mbQuota >= 1024 ? (mbQuota / 1024).toFixed(1) + ' GB' : mbQuota.toFixed(1) + ' MB';
        
        DOM.storageStats.textContent = `${usedStr} / ${quotaStr} [${percent.toFixed(1)}%]`;
    } catch (e) {
        console.error('Failed to query disk capacity usage:', e);
    }
}

/**
 * Handles playlist sidebar clicks.
 */
async function handlePlaylistSelected(playlist) {
    currentActivePlaylist = playlist;
    await refreshTracksList();
}

/**
 * Helper to reload current active playlist scope to refresh UI.
 */
async function refreshPlaylistScope() {
    if (currentActivePlaylist) {
        const playlists = await window.RuggedDB.getAllPlaylists();
        const refreshed = playlists.find(p => p.id === currentActivePlaylist.id);
        currentActivePlaylist = refreshed || null;
    }
    await refreshTracksList();
}

// --- AUDIO CALLBACK HANDLERS (ENGINE -> UI) ---

function handleTrackChange(track) {
    DOM.vfdTitle.textContent = track.title;
    DOM.vfdTitle.classList.add('glow');
    DOM.vfdArtist.textContent = track.artist;
    DOM.vfdStatus.textContent = '再生中';
    DOM.vfdBlink.classList.add('active');

    // Update bottom player and playlist covers dynamically
    renderPlayerTrackCover(track);

    // Highlight row in list
    const rows = DOM.trackTableBody.querySelectorAll('tr');
    rows.forEach(r => {
        if (r.getAttribute('data-id') === track.id) {
            r.classList.add('playing');
        } else {
            r.classList.remove('playing');
        }
    });
}

function handlePlayStateChange(isPlaying) {
    if (isPlaying) {
        DOM.vfdStatus.textContent = '再生中';
        DOM.vfdBlink.classList.add('active');
        DOM.btnPlay.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
        `;
        DOM.btnPlay.title = '一時停止';
    } else {
        DOM.vfdStatus.textContent = '一時停止';
        DOM.vfdBlink.classList.remove('active');
        DOM.btnPlay.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
            </svg>
        `;
        DOM.btnPlay.title = '再生';
    }
}

/**
 * Handles time progress updates.
 */
function handleTimeUpdate(currentTime, duration) {
    DOM.currentTimeLabel.textContent = formatTime(currentTime);
    DOM.totalTimeLabel.textContent = formatTime(duration);

    const percent = (currentTime / duration) * 100;
    DOM.progressFill.style.width = `${percent}%`;

    // Dynamic Duration Sync:
    const state = window.RuggedPlayer.getPlayerState();
    if (state.currentTrack && state.currentTrack.duration === 0 && duration > 0) {
        state.currentTrack.duration = duration;
        if (!state.currentTrack.isServerTrack) {
            window.RuggedDB.saveTrack(state.currentTrack).then(() => {
                const rows = DOM.trackTableBody.querySelectorAll('tr');
                rows.forEach(row => {
                    if (row.getAttribute('data-id') === state.currentTrack.id) {
                        const durationSpan = row.querySelector('.action-cell span');
                        if (durationSpan) {
                            durationSpan.textContent = formatTime(duration);
                        }
                    }
                });
            });
        }
    }
}

function handleQueueChange(queue) {
    // Queue synchronized
}

// --- UTILITY FORMATTERS ---

function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateLoopStatusUI(loopMode) {
    DOM.btnLoop.classList.toggle('active', loopMode !== 'none');
    
    if (loopMode === 'none') {
        DOM.vfdLoop.textContent = 'リピート: OFF';
    } else if (loopMode === 'queue') {
        DOM.vfdLoop.textContent = 'リピート: 全曲';
    } else {
        DOM.vfdLoop.textContent = 'リピート: 1曲';
    }
}

function showGlobalError(msg) {
    if (DOM.vfdStatus) {
        DOM.vfdStatus.textContent = msg;
        DOM.vfdBlink.classList.add('active');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Updates settings panel UI state (active highlight / label content).
 */
function updateSettingsUI() {
    const state = window.RuggedPlayer.getPlayerState();
    
    // Background playback toggle UI
    if (state.isBgPlayEnabled) {
        DOM.btnToggleBg.textContent = 'ON';
        DOM.btnToggleBg.style.background = 'var(--color-amber-glow)';
        DOM.btnToggleBg.style.color = '#000000';
        DOM.btnToggleBg.style.borderColor = 'var(--color-amber-glow)';
    } else {
        DOM.btnToggleBg.textContent = 'OFF';
        DOM.btnToggleBg.style.background = 'var(--color-bg-widget)';
        DOM.btnToggleBg.style.color = 'var(--color-text-bright)';
        DOM.btnToggleBg.style.borderColor = 'var(--color-border-clean)';
    }

    // YouTube Video Display toggle UI
    if (state.isYtVideoEnabled) {
        DOM.btnToggleYtVideo.textContent = '映像あり';
        DOM.btnToggleYtVideo.style.background = 'var(--color-amber-glow)';
        DOM.btnToggleYtVideo.style.color = '#000000';
        DOM.btnToggleYtVideo.style.borderColor = 'var(--color-amber-glow)';
    } else {
        DOM.btnToggleYtVideo.textContent = '音声のみ';
        DOM.btnToggleYtVideo.style.background = 'var(--color-bg-widget)';
        DOM.btnToggleYtVideo.style.color = 'var(--color-text-bright)';
        DOM.btnToggleYtVideo.style.borderColor = 'var(--color-border-clean)';
    }
}
