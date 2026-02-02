/**
 * Clone Dance Visualizer - JavaScript
 * Renders videos with pose landmarks, angles, and acceleration overlay
 */

class DanceVisualizer {
    constructor() {
        this.videoInput = document.getElementById('videoInput');
        this.jsonInput = document.getElementById('jsonInput');
        this.loadBtn = document.getElementById('loadBtn');
        this.playBtn = document.getElementById('playBtn');
        this.canvas = document.getElementById('videoCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.timeline = document.getElementById('timeline');
        this.timelineProgress = document.getElementById('timelineProgress');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.visualizer = document.getElementById('visualizer');
        this.loading = document.getElementById('loading');
        this.mirror = document.getElementById('mirror');
        
        // Visual controls
        this.skeletonColor = document.getElementById('skeletonColor');
        this.lineThickness = document.getElementById('lineThickness');
        this.skeletonOpacity = document.getElementById('skeletonOpacity');
        this.showConnections = document.getElementById('showConnections');
        this.showAngles = document.getElementById('showAngles');
        
        // Info panels
        this.totalPosesEl = document.getElementById('totalPoses');
        this.currentPoseEl = document.getElementById('currentPose');
        this.avgAccelEl = document.getElementById('avgAccel');
        this.durationEl = document.getElementById('duration');
        
        // State
        this.video = null;
        this.choreography = null;
        this.isPlaying = false;
        this.animationFrameId = null;
        
        // Configuration
        this.config = {
            color: '#00ff00',
            thickness: 3,
            opacity: 1.0,
            showConnections: true,
            showAngles: true
        };
        
        // Pose connections
        this.POSE_CONNECTIONS = [
            [11, 12],  // Shoulders
            [11, 13], [13, 15],  // Left arm
            [12, 14], [14, 16],  // Right arm
            [11, 23], [12, 24],  // Torso
            [23, 24],  // Hips
            [23, 25], [25, 27],  // Left leg
            [24, 26], [26, 28]
        ];

        this.KEYPOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

        this.KEYPOINTS_MIRROR_SWAP = [
            [11, 12],
            [13, 14],
            [15, 16],
            [23, 24],
            [25, 26],
            [27, 28]
            ];




        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.videoInput.addEventListener('change', (e) => {
            const fileName = e.target.files[0]?.name || 'Not selected';
            document.getElementById('videoFileName').textContent = fileName;
            this.checkFilesReady();
        });
        
        this.jsonInput.addEventListener('change', (e) => {
            const fileName = e.target.files[0]?.name || 'Not selected';
            document.getElementById('jsonFileName').textContent = fileName;
            this.checkFilesReady();
        });
        
        this.loadBtn.addEventListener('click', () => this.loadFiles());
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.timeline.addEventListener('click', (e) => this.seekTo(e));
        
        this.skeletonColor.addEventListener('change', (e) => {
            this.config.color = e.target.value;
        });
        
        this.lineThickness.addEventListener('input', (e) => {
            this.config.thickness = parseInt(e.target.value);
            document.getElementById('thicknessValue').textContent = e.target.value;
        });
        
        this.skeletonOpacity.addEventListener('input', (e) => {
            this.config.opacity = parseInt(e.target.value) / 100;
            document.getElementById('opacityValue').textContent = e.target.value;
        });
        
        this.showConnections.addEventListener('change', (e) => {
            this.config.showConnections = e.target.checked;
        });
        
        this.showAngles.addEventListener('change', (e) => {
            this.config.showAngles = e.target.checked;
        });
    }
    
    checkFilesReady() {
        const hasVideo = this.videoInput.files.length > 0;
        const hasJson = this.jsonInput.files.length > 0;
        this.loadBtn.disabled = !(hasVideo && hasJson);
    }
    
    async loadFiles() {
        this.loading.style.display = 'block';
        
        try {
            const videoFile = this.videoInput.files[0];
            const videoUrl = URL.createObjectURL(videoFile);
            
            if (this.video) this.video.remove();

            this.video = document.createElement('video');
            this.video.src = videoUrl;
            this.video.muted = true;
            this.video.preload = 'auto';
            this.video.style.display = 'none';
            document.body.appendChild(this.video);
            
            await new Promise((resolve) => {
                this.video.oncanplay = resolve;
                this.video.load();
            });

            this.video.currentTime = 0.01;

            const jsonFile = this.jsonInput.files[0];
            const jsonText = await jsonFile.text();
            this.choreography = JSON.parse(jsonText);
            if (this.mirror.checked && this.choreography?.poses) {
                for (const pose of this.choreography.poses) {
                    for (const lm of pose.landmarks) {
                        lm.x = 1 - lm.x;
                    }
                }
                for (const pose of this.choreography.poses) {
                    for (const [a, b] of this.KEYPOINTS_MIRROR_SWAP) {
                        const ia = pose.landmarks.findIndex(lm => lm.id === a);
                        const ib = pose.landmarks.findIndex(lm => lm.id === b);
                        if (ia === -1 || ib === -1) continue;

                        const tmp = pose.landmarks[ia].id;
                        pose.landmarks[ia].id = pose.landmarks[ib].id;
                        pose.landmarks[ib].id = tmp;
                    }
                }

            }
            
            this.setupCanvas();
            this.updateInfo();
            
            this.loading.style.display = 'none';
            this.visualizer.style.display = 'block';
            
            setTimeout(() => this.render(), 100);
            
        } catch (error) {
            console.error('Error loading files:', error);
            alert('Error loading files.');
            this.loading.style.display = 'none';
        }
    }


  
    setupCanvas() {
        this.canvas.width = this.video.videoWidth || 1280;
        this.canvas.height = this.video.videoHeight || 720;
        
        this.video.ontimeupdate = () => {
            this.updateTimeline();
            this.updateCurrentPose();
            if (!this.isPlaying) this.render();
        };

        this.video.onended = () => {
            this.isPlaying = false;
            this.playBtn.textContent = 'PLAY';
            if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        };
    }
    
    updateInfo() {
        const stats = this.choreography.stats;
        const metadata = this.choreography.metadata;
        
        this.totalPosesEl.textContent = stats.total_poses;
        this.avgAccelEl.textContent = stats.avg_acceleration.toFixed(4);
        this.durationEl.textContent = stats.duration.toFixed(1) + 's';
    }
    
    togglePlay() {
        this.isPlaying = !this.isPlaying;
        
        if (this.isPlaying) {
            this.video.play();
            this.playBtn.textContent = 'PAUSE';
            this.startRenderLoop();
        } else {
            this.video.pause();
            this.playBtn.textContent = 'PLAY';
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
        }
    }
    
    startRenderLoop() {
        const loop = () => {
            if (!this.isPlaying) return;
            
            this.render();
            this.animationFrameId = requestAnimationFrame(loop);
        };
        loop();
    }
    
    render() {
        if (!this.video || !this.choreography) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw video frame
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Get current pose
        const pose = this.getCurrentPose();
        
        if (pose) {
            this.drawSkeleton(pose);
        }
    }
    
    getCurrentPose() {
        if (!this.choreography || !this.video) return null;
        
        const currentTime = this.video.currentTime;
        const poses = this.choreography.poses;
        
        if (!poses || poses.length === 0) return null;
        
        // Find closest pose within 0.5s tolerance
        let closest = poses[0];
        let minDiff = Math.abs(currentTime - closest.timestamp);
        
        for (const pose of poses) {
            const diff = Math.abs(currentTime - pose.timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closest = pose;
            }
        }
        
        return minDiff < 0.5 ? closest : null;
    }
    
    drawSkeleton(pose) {
        const landmarks = this.convertLandmarks(pose.landmarks);
        
        this.ctx.globalAlpha = this.config.opacity;
        this.ctx.strokeStyle = this.config.color;
        this.ctx.fillStyle = this.config.color;
        this.ctx.lineWidth = this.config.thickness;
        this.ctx.lineCap = 'round';
        
        // Draw connections
        if (this.config.showConnections) {
            this.drawConnections(landmarks);
        }
        
        // Draw landmarks
        this.drawLandmarks(landmarks);
        
        // Draw angles if enabled
        if (this.config.showAngles && pose.angles) {
            this.drawAngles(landmarks, pose.angles);
        }
        
        this.ctx.globalAlpha = 1.0;
    }
    
    convertLandmarks(landmarksList) {
        // Convert from [{id, x, y, z, visibility}, ...] to indexed array
        const converted = new Array(33);
        for (const lm of landmarksList) {
            converted[lm.id] = lm;
        }
        return converted;
    }
    
    drawConnections(landmarks) {
        this.ctx.beginPath();
        
        for (let [start, end] of this.POSE_CONNECTIONS) {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];
            
            if (!startPoint || !endPoint) continue;
            if (startPoint.visibility < 0.5 || endPoint.visibility < 0.5) continue;
            
            const x1 = startPoint.x * this.canvas.width;
            const y1 = startPoint.y * this.canvas.height;
            const x2 = endPoint.x * this.canvas.width;
            const y2 = endPoint.y * this.canvas.height;
            
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
        }
        
        this.ctx.stroke();
    }
    
    drawLandmarks(landmarks) {
        
        
        for (let idx of this.KEYPOINTS) {
            const point = landmarks[idx];
            
            if (!point || point.visibility < 0.2) continue;
            
            const x = point.x * this.canvas.width;
            const y = point.y * this.canvas.height;
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.config.thickness * 2, 0, 2 * Math.PI);
            this.ctx.fillStyle = this.config.color;
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
    }
    
    drawAngles(landmarks, angles) {
        this.ctx.font = '14px monospace';
        this.ctx.fillStyle = '#ffd700';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        
        const anglePositions = {
            'left_shoulder': 11,
            'right_shoulder': 12,
            'left_elbow': 13,
            'right_elbow': 14,
            'left_knee': 25,
            'right_knee': 26
        };
        
        for (const [angleName, jointId] of Object.entries(anglePositions)) {
            const angle = angles[angleName];
            if (angle === null || angle === undefined) continue;
            
            const joint = landmarks[jointId];
            if (!joint || joint.visibility < 0.5) continue;
            
            const x = joint.x * this.canvas.width + 10;
            const y = joint.y * this.canvas.height - 10;
            
            const text = `${angle.toFixed(0)}°`;
            
            // Draw text with outline
            this.ctx.strokeText(text, x, y);
            this.ctx.fillText(text, x, y);
        }
    }
    
    updateTimeline() {
        const progress = (this.video.currentTime / this.video.duration) * 100;
        this.timelineProgress.style.width = progress + '%';
        
        const current = this.formatTime(this.video.currentTime);
        const total = this.formatTime(this.video.duration);
        this.timeDisplay.textContent = `${current} / ${total}`;
    }
    
    updateCurrentPose() {
        const pose = this.getCurrentPose();
        if (pose) {
            this.currentPoseEl.textContent = pose.frame;
        } else {
            this.currentPoseEl.textContent = '-';
        }
    }
    
    seekTo(e) {
        const rect = this.timeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const newTime = percentage * this.video.duration;
        
        this.video.currentTime = newTime;
        
        this.video.addEventListener('seeked', () => {
            this.render();
        }, { once: true });
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const visualizer = new DanceVisualizer();
    console.log('Dance Visualizer initialized');
});