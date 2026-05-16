let CONFIG = {};
let mediaRecorder = null;
let recordedChunks = [];
let videoStream = null;
let tiktokOpened = false;
let autoStopTimer = null;
let recordingSeconds = 0;
let isUploading = false;

let startBtn, stopAndUploadBtn, video;
let statusDiv;

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

function showMessage(message, isError = false) {
    // Remove existing status div if present
    if (statusDiv) {
        statusDiv.remove();
    }
    
    // Create new status div
    statusDiv = document.createElement('div');
    statusDiv.textContent = message;
    statusDiv.style.position = 'fixed';
    statusDiv.style.bottom = '20px';
    statusDiv.style.left = '50%';
    statusDiv.style.transform = 'translateX(-50%)';
    statusDiv.style.padding = '10px 20px';
    statusDiv.style.borderRadius = '8px';
    statusDiv.style.fontSize = '14px';
    statusDiv.style.zIndex = '9999';
    statusDiv.style.fontFamily = 'Arial, sans-serif';
    statusDiv.style.textAlign = 'center';
    statusDiv.style.maxWidth = '90%';
    
    if (isError) {
        statusDiv.style.backgroundColor = '#dc3545';
        statusDiv.style.color = 'white';
    } else {
        statusDiv.style.backgroundColor = '#28a745';
        statusDiv.style.color = 'white';
    }
    
    document.body.appendChild(statusDiv);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (statusDiv) {
            statusDiv.style.opacity = '0';
            statusDiv.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                if (statusDiv) {
                    statusDiv.remove();
                    statusDiv = null;
                }
            }, 500);
        }
    }, 3000);
}

function checkBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showMessage("Error: Camera access not supported. Please use HTTPS.", true);
        startBtn.disabled = true;
        stopAndUploadBtn.disabled = true;
        return false;
    }
    return true;
}

async function uploadVideo() {
    if (recordedChunks.length === 0) {
        showMessage("No video to upload. Record something first.", true);
        return false;
    }
    
    if (isUploading) {
        return false;
    }
    
    try {
        isUploading = true;
        showMessage("Processing video...");
        
        const videoBlob = new Blob(recordedChunks, { type: CONFIG.videoMimeType });
        if (videoBlob.size === 0) {
            showMessage("Video is empty. Try recording again.", true);
            isUploading = false;
            return false;
        }
        
        const formData = new FormData();
        formData.append('video', videoBlob, 'recording.webm');
        
        showMessage("Uploading to cloud...");
        
        const response = await fetch(CONFIG.uploadEndpoint, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showMessage("Video saved successfully!");
            recordedChunks = [];
            isUploading = false;
            return true;
        } else {
            showMessage("Upload failed: " + (result.message || "Unknown error"), true);
            isUploading = false;
            return false;
        }
    } catch (error) {
        showMessage("Upload error: " + error.message, true);
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
        showMessage("Requesting camera access...");
        
        const constraints = { 
            video: CONFIG.videoQuality, 
            audio: false 
        };
        
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        video.srcObject = videoStream;
        
        if (!tiktokOpened) {
            tiktokOpened = true;
            window.open(CONFIG.tiktokUrl, '_blank');
            showMessage("TikTok opened in new tab");
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
                    showMessage("Auto-saving...");
                    mediaRecorder.stop();
                    stopAndUploadBtn.disabled = true;
                }
            }, CONFIG.autoSaveSeconds * 1000);
        }
        
        startBtn.disabled = true;
        stopAndUploadBtn.disabled = false;
        showMessage("Recording... Auto-saves in " + CONFIG.autoSaveSeconds + " seconds");
        
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            showMessage("Camera access denied. Click camera icon to allow.", true);
        } else if (error.name === 'NotFoundError') {
            showMessage("No camera found on this device.", true);
        } else {
            showMessage("Camera error: " + error.message, true);
        }
    }
}

function stopAndUpload() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        if (autoStopTimer) {
            clearTimeout(autoStopTimer);
            autoStopTimer = null;
        }
        showMessage("Stopping and uploading...");
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
