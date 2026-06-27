const fs = require('fs');
const path = require('path');

const MUSIC_DIR = path.join(__dirname, 'music');
const OUTPUT_FILE = path.join(__dirname, 'tracks.json');

// Supported audio extensions
const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'];

function parseFilename(filename) {
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const parts = baseName.split('-');
    
    if (parts.length > 1) {
        return {
            artist: parts[0].trim(),
            title: parts.slice(1).join('-').trim()
        };
    } else {
        return {
            artist: 'アーティスト不明',
            title: baseName.trim()
        };
    }
}

function scanMusicDirectory() {
    console.log(`Scanning music directory: ${MUSIC_DIR}`);
    
    if (!fs.existsSync(MUSIC_DIR)) {
        console.error(`Error: Music directory "${MUSIC_DIR}" does not exist. Creating it...`);
        fs.mkdirSync(MUSIC_DIR, { recursive: true });
        return [];
    }

    const files = fs.readdirSync(MUSIC_DIR);
    const tracks = [];

    files.forEach((file, index) => {
        const ext = path.extname(file).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
            const metadata = parseFilename(file);
            const relativeUrl = `music/${file}`;
            
            tracks.push({
                id: `track_server_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
                title: metadata.title,
                artist: metadata.artist,
                url: relativeUrl,
                duration: 0 // Will resolve dynamically inside the browser player
            });
            console.log(`- Added: ${metadata.artist} - ${metadata.title} (${file})`);
        }
    });

    return tracks;
}

try {
    const tracks = scanMusicDirectory();
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tracks, null, 2), 'utf8');
    console.log(`Successfully generated ${OUTPUT_FILE} with ${tracks.length} tracks.`);
} catch (error) {
    console.error('An error occurred during tracks list generation:', error);
    process.exit(1);
}
