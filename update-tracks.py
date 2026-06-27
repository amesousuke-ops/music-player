import os
import json
import random
import time

MUSIC_DIR = os.path.join(os.path.dirname(__file__), 'music')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), 'tracks.json')
SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac']

def parse_filename(filename):
    base_name, ext = os.path.splitext(filename)
    parts = base_name.split('-')
    if len(parts) > 1:
        return {
            'artist': parts[0].strip(),
            'title': '-'.join(parts[1:]).strip()
        }
    else:
        return {
            'artist': 'アーティスト不明',
            'title': base_name.strip()
        }

def scan_music_directory():
    print(f"Scanning music directory: {MUSIC_DIR}")
    if not os.path.exists(MUSIC_DIR):
        print(f"Creating music directory: {MUSIC_DIR}")
        os.makedirs(MUSIC_DIR)
        return []
    
    files = os.listdir(MUSIC_DIR)
    tracks = []
    for idx, file in enumerate(files):
        ext = os.path.splitext(file)[1].lower()
        if ext in SUPPORTED_EXTENSIONS:
            metadata = parse_filename(file)
            relative_url = f"music/{file}"
            random_str = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=5))
            tracks.append({
                'id': f"track_server_{int(time.time()*1000)}_{idx}_{random_str}",
                'title': metadata['title'],
                'artist': metadata['artist'],
                'url': relative_url,
                'duration': 0
            })
            print(f"- Added: {metadata['artist']} - {metadata['title']} ({file})")
    return tracks

try:
    tracks = scan_music_directory()
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(tracks, f, ensure_ascii=False, indent=2)
    print(f"Successfully generated {OUTPUT_FILE} with {len(tracks)} tracks.")
except Exception as e:
    print(f"An error occurred: {e}")
    exit(1)
