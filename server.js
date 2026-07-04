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
            return callback(new Error('Failed to update tracks list'));
        }
        console.log('tracks.json updated successfully.');

        // 2. Add, commit and push to Git
        const gitCommands = 'git add music/ tracks.json && git commit -m "Auto-sync: Uploaded new track" && git push origin main';
        exec(gitCommands, (gitErr, gitStdout, gitStderr) => {
            if (gitErr) {
                console.warn('Git push warn/error:', gitErr.message);
                // Sometimes push fails if there are no changes, we treat it as soft success or report warning
            }
            console.log('Git commands output:', gitStdout);
            callback(null, 'Sync completed');
        });
    });
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
                console.log(`Successfully saved: ${safeFileName}. Synchronizing...`);
                runGitSync((syncErr, msg) => {
                    if (syncErr) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: syncErr.message }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Sync complete!' }));
                    }
                });
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
