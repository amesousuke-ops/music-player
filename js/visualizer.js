/**
 * Rugged Music Player - Audio Visualizer Module
 * Connects an HTML5 <audio> element to the Web Audio API AnalyserNode
 * and renders a warm amber spectrum visualizer on an HTML5 <canvas>.
 * Global namespace version for file:// protocol compatibility.
 * Extended to support dynamic synthetic waves for YouTube streaming mode.
 */

let audioCtx = null;
let analyser = null;
let source = null;
let animationId = null;
let isYouTubeMode = false;

// Peak hold variables for smooth falling-peak animations
let peaks = [];
const peakDecayRate = 0.8;

/**
 * Initializes the Web Audio API context and visualizer canvas render loop.
 * @param {HTMLAudioElement} audioElement - The audio player
 * @param {HTMLCanvasElement} canvasElement - The visualization canvas
 */
function initVisualizer(audioElement, canvasElement) {
    // Detect mobile/tablet browser to bypass Web Audio API nodes connection.
    // iOS Safari has a persistent bug where connecting <audio> to createMediaElementSource() 
    // causes the background audio stream to be forcefully suspended when the tab becomes inactive.
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        || ('ontouchstart' in window);
    
    if (isMobile) {
        isYouTubeMode = true; // Force synthetic visualization waves
        startVisualizationLoop(canvasElement);
        return;
    }

    if (!audioCtx) {
        try {
            // Lazy-init AudioContext to respect browser autoplay policies
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();
            
            // Create analyzer node
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 128; // Small FFT for thick, distinct industrial bars
            
            // Route HTML5 Audio -> Analyser -> Speakers
            source = audioCtx.createMediaElementSource(audioElement);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
        } catch (e) {
            console.error('Failed to initialize Web Audio API Context:', e);
            return;
        }
    }

    // Ensure audio context is active (resumed)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Start rendering
    startVisualizationLoop(canvasElement);
}

/**
 * Toggles synthetic wave generation for YouTube streams.
 * @param {boolean} active 
 */
function setYouTubeMode(active) {
    isYouTubeMode = active;
}

/**
 * Renders the retro glowing VFD display onto the canvas.
 * @param {HTMLCanvasElement} canvas 
 */
function startVisualizationLoop(canvas) {
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    // Cancel existing loop if running
    if (animationId) {
        cancelAnimationFrame(animationId);
    }

    // Clear peaks
    peaks = new Array(bufferLength).fill(0);

    function draw() {
        animationId = requestAnimationFrame(draw);

        // Responsive canvas buffer sizing
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        const width = canvas.width;
        const height = canvas.height;

        // Fetch frequency byte data (or generate synthetic wave for YouTube mode)
        if (isYouTubeMode) {
            const isPlaying = window.RuggedPlayer && window.RuggedPlayer.getPlayerState().isPlaying;
            if (isPlaying) {
                // Generate a beautiful, organic math-based pulsing spectrum for YouTube streaming
                const time = Date.now() * 0.005;
                for (let i = 0; i < bufferLength; i++) {
                    const base = Math.sin(time + i * 0.25) * Math.cos(time * 0.4 + i * 0.08);
                    const secondary = Math.sin(time * 1.8 - i * 0.45) * 0.3;
                    const noise = Math.sin(time * 5 + i * 1.2) * 0.05;
                    // Combine waves and translate to 0-255 scale (peaks concentrated in low-mid frequencies)
                    const factor = Math.max(0, 1 - (i / bufferLength) * 0.7);
                    const val = Math.max(0, ((base + 1.2) * 0.45 + secondary + noise) * 200 * factor);
                    dataArray[i] = Math.min(255, val);
                }
            } else {
                // Return flat flatline if paused
                dataArray.fill(0);
            }
        } else if (analyser) {
            analyser.getByteFrequencyData(dataArray);
        } else {
            dataArray.fill(0);
        }

        // Draw deep grid background
        ctx.fillStyle = '#1e0c02'; // Warm, very dark glowing background
        ctx.fillRect(0, 0, width, height);

        // Draw horizontal grid lines
        ctx.strokeStyle = 'rgba(255, 106, 0, 0.08)';
        ctx.lineWidth = 1;
        for (let y = 0; y < height; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw vertical grid lines (aligned with frequencies)
        const barCount = bufferLength - 16; // Trim ultra-high frequencies
        const barSpacing = 4;
        const totalSpacing = barSpacing * (barCount - 1);
        const barWidth = Math.floor((width - totalSpacing) / barCount);

        for (let i = 0; i < barCount; i++) {
            const x = i * (barWidth + barSpacing) + (width - (barCount * (barWidth + barSpacing) - barSpacing)) / 2;
            ctx.beginPath();
            ctx.moveTo(x + barWidth / 2, 0);
            ctx.lineTo(x + barWidth / 2, height);
            ctx.stroke();
        }

        // Render the frequency bars
        for (let i = 0; i < barCount; i++) {
            const value = dataArray[i];
            const percent = value / 255;
            const barHeight = Math.round(percent * height * 0.9);

            const x = i * (barWidth + barSpacing) + (width - (barCount * (barWidth + barSpacing) - barSpacing)) / 2;
            const y = height - barHeight;

            // Draw frequency bar
            if (barHeight > 0) {
                const gradient = ctx.createLinearGradient(0, height, 0, y);
                gradient.addColorStop(0, '#cc3300'); 
                gradient.addColorStop(0.6, '#ff6a00'); 
                gradient.addColorStop(1, '#ffa600'); 

                ctx.fillStyle = gradient;
                ctx.fillRect(x, y, barWidth, barHeight);

                // Sub-glow on top of active bars
                ctx.shadowColor = 'rgba(255, 106, 0, 0.4)';
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#ffa600';
                ctx.fillRect(x, y, barWidth, Math.min(barHeight, 2));
                ctx.shadowBlur = 0;
            }

            // --- Peak Hold Dot ---
            if (barHeight > peaks[i]) {
                peaks[i] = barHeight;
            } else {
                peaks[i] = Math.max(0, peaks[i] - peakDecayRate);
            }

            const peakY = height - Math.round(peaks[i]);
            if (peaks[i] > 2) {
                ctx.fillStyle = '#ffa600';
                ctx.shadowColor = 'rgba(255, 170, 0, 0.8)';
                ctx.shadowBlur = 6;
                ctx.fillRect(x, peakY - 3, barWidth, 2);
                ctx.shadowBlur = 0;
            }
        }
    }

    draw();
}

/**
 * Resumes audio context if suspended.
 */
function resumeAudioContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Expose to global namespace
window.RuggedVisualizer = {
    initVisualizer,
    resumeAudioContext,
    setYouTubeMode
};
