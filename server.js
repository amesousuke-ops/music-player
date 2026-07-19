const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;
const MUSIC_DIR = path.join(__dirname, 'music');

// Ensure music directory exists
if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

function runGitSync(callback) {
    console.log('Starting sync process...');
    
    // 1. Run update-tracks.js to scan folder and update tracks.json
    exec('node update-tracks.js', (err, stdout, stderr) => {
        if (err) {
            console.error('Failed to run update-tracks.js:', err);
            if (callback) return callback(new Error('Failed to update tracks list'));
            return;
        }
        console.log('tracks.json updated successfully.');

        // 2. Add, commit and push to Git
        const gitCommands = 'git add music/ tracks.json && git commit -m "Auto-sync: Uploaded new track" && git push origin main';
        exec(gitCommands, (gitErr, gitStdout, gitStderr) => {
            if (gitErr) {
                console.warn('Git push warn/error:', gitErr.message);
            }
            console.log('Git commands output:', gitStdout);
            if (callback) callback(null, 'Sync completed');
        });
    });
}

let syncTimeout = null;

function scheduleGitSync() {
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }
    console.log("Scheduling Git sync in 2 seconds...");
    syncTimeout = setTimeout(() => {
        syncTimeout = null;
        runGitSync((err, msg) => {
            if (err) {
                console.error("Delayed Git sync failed:", err);
            } else {
                console.log("Delayed Git sync completed successfully.");
            }
        });
    }, 2000);
}

const server = http.createServer((req, res) => {
    // Enable CORS for frontend GitHub Pages and localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');

    // Handle OPTIONS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Status endpoint to check if server is active
    if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', mode: 'Node.js' }));
        return;
    }

    // File Upload endpoint
    if (req.method === 'POST' && req.url === '/upload') {
        const fileNameHeader = req.headers['x-file-name'];
        if (!fileNameHeader) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing X-File-Name header');
            return;
        }

        try {
            const fileName = decodeURIComponent(fileNameHeader);
            // Prevent directory traversal attacks
            const safeFileName = path.basename(fileName);
            const filePath = path.join(MUSIC_DIR, safeFileName);

            console.log(`Receiving upload: ${safeFileName}`);
            const fileStream = fs.createWriteStream(filePath);
            req.pipe(fileStream);

            fileStream.on('finish', () => {
                console.log(`Successfully saved: ${safeFileName}.`);
                scheduleGitSync();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Upload received, sync scheduled.' }));
            });

            fileStream.on('error', (streamErr) => {
                console.error('File write stream error:', streamErr);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Write error: ${streamErr.message}`);
            });

        } catch (e) {
            console.error('Upload handling error:', e);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Error: ${e.message}`);
        }
        return;
    }

    // File Delete endpoint
    if (req.method === 'POST' && req.url === '/delete') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!data.url) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Missing url parameter');
                    return;
                }
                const fileName = path.basename(data.url);
                const filePath = path.join(MUSIC_DIR, fileName);

                console.log(`Receiving delete request for: ${fileName}`);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted file locally: ${fileName}.`);
                    scheduleGitSync();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Delete complete, sync scheduled.' }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File not found');
                }
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Error: ${e.message}`);
            }
        });
        return;
    }

    // Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`  RUGGED PLAYER Local Sync Helper active on port ${PORT}`);
    console.log(`  Press Ctrl+C to stop the server`);
    console.log(`===================================================`);
});
