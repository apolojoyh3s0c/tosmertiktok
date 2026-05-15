let CONFIG = {};
let mediaRecorder = null;
let recordedChunks = [];
let videoStream = null;
let tiktokOpened = false;
let autoStopTimer = null;
let recordingSeconds = 0;
let isUploading = false;

let startBtn, stopAndUploadBtn, video;

async function loadConfig() {
    try {
        const response = await fetch('/config.json');
        CONFIG = await response.json();
        console.log('Configuration loaded:', CONFIG);
    } catch (error) {
        console.warn('Could not load config.json, using defaults');
        CONFIG = {
            tiktokUrl: "https://www.tiktok.com",
            autoSaveSeconds: 30,
            videoQuality: { width: 640, height: 480 },
            recordingInterval: 1000,
            videoMimeType: "video/webm",
            uploadEndpoint: "/upload",
            enableAutoSave: true,
            enablePageCloseWarning: true
        };
    }
}

function checkBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Error: Camera access not supported. Please use HTTPS.");
        startBtn.disabled = true;
        stopAndUploadBtn.disabled = true;
        return false;
    }
    return true;
}

async function uploadVideo() {
    if (recordedChunks.length === 0) {
        alert("No video to upload. Record something first.");
        return false;
    }
    
    if (isUploading) {
        return false;
    }
    
    try {
        isUploading = true;
        
        const videoBlob = new Blob(recordedChunks, { type: CONFIG.videoMimeType });
        if (videoBlob.size === 0) {
            alert("Video is empty. Try recording again.");
            isUploading = false;
            return false;
        }
        
        const formData = new FormData();
        formData.append('video', videoBlob, 'recording.webm');
        
        const response = await fetch(CONFIG.uploadEndpoint, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            alert("Upload successful! Video saved.");
            recordedChunks = [];
            isUploading = false;
            return true;
        } else {
            alert("Upload failed: " + (result.message || "Unknown error"));
            isUploading = false;
            return false;
        }
    } catch (error) {
        alert("Upload error: " + error.message);
        isUploading = false;
        return false;
    }
}

function cleanupRecording() {
    if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

async function startRecording() {
    if (!checkBrowserSupport()) return;
    
    try {
        const constraints = { 
            video: CONFIG.videoQuality, 
            audio: false 
        };
        
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        video.srcObject = videoStream;
        
        if (!tiktokOpened) {
            tiktokOpened = true;
            window.open(CONFIG.tiktokUrl, '_blank');
        }
        
        mediaRecorder = new MediaRecorder(videoStream, { mimeType: CONFIG.videoMimeType });
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            cleanupRecording();
            await uploadVideo();
            
            startBtn.disabled = false;
            stopAndUploadBtn.disabled = true;
            tiktokOpened = false;
        };
        
        mediaRecorder.start(CONFIG.recordingInterval);
        
        if (CONFIG.enableAutoSave) {
            autoStopTimer = setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    stopAndUploadBtn.disabled = true;
                }
            }, CONFIG.autoSaveSeconds * 1000);
        }
        
        startBtn.disabled = true;
        stopAndUploadBtn.disabled = false;
        
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            alert("Camera access denied. Click the camera icon in address bar to allow.");
        } else if (error.name === 'NotFoundError') {
            alert("No camera found on this device.");
        } else {
            alert("Camera error: " + error.message);
        }
    }
}

function stopAndUpload() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        if (autoStopTimer) {
            clearTimeout(autoStopTimer);
            autoStopTimer = null;
        }
        mediaRecorder.stop();
        stopAndUploadBtn.disabled = true;
    }
}

async function init() {
    await loadConfig();
    
    startBtn = document.getElementById('startBtn');
    stopAndUploadBtn = document.getElementById('stopAndUploadBtn');
    video = document.getElementById('video');
    
    startBtn.onclick = startRecording;
    stopAndUploadBtn.onclick = stopAndUpload;
    
    if (CONFIG.enablePageCloseWarning) {
        window.addEventListener('beforeunload', function(event) {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                event.preventDefault();
                event.returnValue = 'Recording in progress. Your video will be lost if you leave now.';
                return 'Recording in progress. Your video will be lost if you leave now.';
            }
        });
    }
    
    checkBrowserSupport();
}

init();