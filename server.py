import os
import sys
import subprocess
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 3000
MUSIC_DIR = os.path.join(os.path.dirname(__file__), 'music')

if not os.path.exists(MUSIC_DIR):
    os.makedirs(MUSIC_DIR)

def run_git_sync():
    print("Starting sync process...")
    
    # 1. Run update-tracks.py to scan music directory and update tracks.json
    try:
        subprocess.run([sys.executable, "update-tracks.py"], check=True)
        print("tracks.json updated successfully.")
    except Exception as e:
        print("Failed to run update-tracks.py:", e)
        return False

    # 2. Add, commit, and push changes to GitHub
    try:
        subprocess.run(["git", "add", "music/", "tracks.json"], check=True)
        subprocess.run(["git", "commit", "-m", "Auto-sync: Uploaded new track (Python)"], check=True)
        subprocess.run(["git", "push", "origin", "main"], check=True)
        print("Git sync completed successfully.")
        return True
    except Exception as e:
        print("Git commands warning/error:", e)
        # We return True even on soft git warning (like no changes to commit) to avoid hanging the response
        return True

class UploadHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-File-Name')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "online", "mode": "Python"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/upload':
            filename_header = self.headers.get('X-File-Name')
            if not filename_header:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'Missing X-File-Name header')
                return

            try:
                filename = urllib.parse.unquote(filename_header)
                safe_filename = os.path.basename(filename)
                filepath = os.path.join(MUSIC_DIR, safe_filename)

                print(f"Receiving upload: {safe_filename}")
                content_length = int(self.headers.get('Content-Length', 0))
                
                # Stream binary body to file
                with open(filepath, 'wb') as f:
                    remaining = content_length
                    while remaining > 0:
                        chunk_size = min(remaining, 64 * 1024)
                        chunk = self.rfile.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        remaining -= len(chunk)

                print(f"Successfully saved: {safe_filename}. Synchronizing...")
                success = run_git_sync()
                
                if success:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"success": true, "message": "Sync complete!"}')
                else:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"error": "Failed to sync"}')

            except Exception as e:
                print("Error handling upload:", e)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"Error: {e}".encode())

        elif self.path == '/delete':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                url_param = data.get('url')
                if not url_param:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(b'Missing url parameter')
                    return

                filename = os.path.basename(url_param)
                filepath = os.path.join(MUSIC_DIR, filename)

                print(f"Receiving delete request for: {filename}")
                if os.path.exists(filepath):
                    os.remove(filepath)
                    print(f"Deleted file locally: {filename}. Synchronizing...")
                    success = run_git_sync()
                    if success:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(b'{"success": true, "message": "Delete sync complete!"}')
                    else:
                        self.send_response(500)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(b'{"error": "Failed to sync"}')
                else:
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(b'File not found')

            except Exception as e:
                print("Error handling delete:", e)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"Error: {e}".encode())

def run():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, UploadHandler)
    print(f"===================================================")
    print(f"  RUGGED PLAYER Local Sync Helper active on port {PORT} (Python)")
    print(f"  Press Ctrl+C to stop the server")
    print(f"===================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == '__main__':
    run()
