import { config } from './config.js';

// Variables
let audioContext;
let mediaRecorder;
let audioChunks = [];
let stream;
let analyser;
let startTime;
let timerInterval;
let recordingCounter = 0;

// DOM Elements
const recordButton = document.getElementById('recordButton');
const stopButton = document.getElementById('stopButton');
const canvas = document.getElementById('canvas');
const canvasCtx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const recordingsList = document.getElementById('recordingsList');

// Set up canvas
function setupCanvas() {
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
}

// Initialize
window.addEventListener('load', () => {
    setupCanvas();
    // Initialize event listeners
    recordButton.addEventListener('click', startRecording);
    stopButton.addEventListener('click', stopRecording);
    
    // Handle window resize for canvas
    window.addEventListener('resize', setupCanvas);
});

// Request access to microphone
async function getAudioStream() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup AudioContext and analyzer
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        
        return true;
    } catch (error) {
        console.error('Error accessing microphone:', error);
        statusEl.textContent = 'Could not access microphone';
        return false;
    }
}

// Visualize audio
function visualize() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        if (!analyser) return;
        
        requestAnimationFrame(draw);
        
        analyser.getByteFrequencyData(dataArray);
        
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        
        canvasCtx.fillStyle = config.visualizerColor;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
        }
    }
    
    draw();
}

// Start recording
async function startRecording() {
    const hasAccess = await getAudioStream();
    
    if (!hasAccess) return;
    
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.addEventListener('dataavailable', event => {
        audioChunks.push(event.data);
    });
    
    mediaRecorder.addEventListener('stop', createRecording);
    
    // Start MediaRecorder
    mediaRecorder.start();
    
    // Update UI
    recordButton.disabled = true;
    stopButton.disabled = false;
    statusEl.textContent = 'Recording...';
    
    // Start visualizer
    visualize();
    
    // Start timer
    startTime = Date.now();
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        
        // Stop all tracks on the stream
        stream.getTracks().forEach(track => track.stop());
        
        // Reset analyser and stream
        analyser = null;
        stream = null;
        
        // Update UI
        recordButton.disabled = false;
        stopButton.disabled = true;
        statusEl.textContent = 'Recording stopped';
        
        // Stop timer
        clearInterval(timerInterval);
    }
}

// Update timer display
function updateTimer() {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    // Check if max recording time reached
    if (elapsedSeconds >= config.maxRecordingTime) {
        stopRecording();
        return;
    }
    
    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
    
    timerEl.textContent = `${minutes}:${seconds}`;
}

// Create and save recording
function createRecording() {
    recordingCounter++;
    
    // Create blob from recorded chunks
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    
    // Create audio URL
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // Get formatted date for filename
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const fileName = `${config.fileNamePrefix}_${date}_${time}.webm`;
    
    // Auto download the recording
    if (config.autoDownloadRecording) {
        const downloadLink = document.createElement('a');
        downloadLink.href = audioUrl;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    }
    
    // Create recording item
    const recordingItem = document.createElement('div');
    recordingItem.className = 'recording-item';
    recordingItem.innerHTML = `
        <div class="recording-title">Recording ${recordingCounter} - ${date} ${time.replace(/-/g, ':')}</div>
        <div class="recording-controls">
            <audio src="${audioUrl}" controls></audio>
            <button class="recording-button download-button" data-url="${audioUrl}" data-filename="${fileName}">Download</button>
            <button class="recording-button delete-button">Delete</button>
        </div>
    `;
    
    // Add event listeners to buttons
    const downloadButton = recordingItem.querySelector('.download-button');
    downloadButton.addEventListener('click', () => {
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadButton.dataset.url;
        downloadLink.download = downloadButton.dataset.filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    });
    
    const deleteButton = recordingItem.querySelector('.delete-button');
    deleteButton.addEventListener('click', () => {
        recordingsList.removeChild(recordingItem);
        URL.revokeObjectURL(audioUrl);
    });
    
    // Add to recordings list
    recordingsList.prepend(recordingItem);
    
    // Reset timer
    timerEl.textContent = '00:00';
}

