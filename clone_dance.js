/**
 * Clone Dance - Main Game Logic
 * Includes pose comparison with positions, angles, and acceleration
 */

// Game state
let referenceData = null;
let pose = null;
let camera = null;
let videoElement = null;
let canvas = null;
let ctx = null;
let calibrationCanvas = null;
let calibrationCtx = null;
let calibrationVideo = null;

let score = 0;
let combo = 0;
let totalFrames = 0;
let matchedFrames = 0;
let isPlaying = false;
let isCalibrated = false;
let currentPlayerPose = null;

// Settings
let isMirrorEnabled = false;
let calibrationTime = 0;

// Normalization factors (from calibration)
let scaleFactorX = 1;
let scaleFactorY = 1;
let offsetX = 0;
let offsetY = 0;

// Calibration
let calibrationFrames = 0;

// Position history for acceleration calculation
let positionHistory = [];

// Smoothing histories
let positionSmoothHistory = {};
let angleSmoothHistory = {};
let accelerationSmoothHistory = {};

this.KEYPOINTS_MIRROR_SWAP = [
    [11, 12],
    [13, 14],
    [15, 16],
    [23, 24],
    [25, 26],
    [27, 28],
    [29, 30],
    [31, 32]
];





// Event listeners
document.getElementById('startBtn').addEventListener('click', initGame);
document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
document.getElementById('resetBtn').addEventListener('click', resetGame);
document.getElementById('recalibrateBtn').addEventListener('click', startCalibration);
document.getElementById('skipCalibrationBtn').addEventListener('click', skipCalibration);

// Mirror toggle
document.getElementById('mirrorToggle').addEventListener('click', () => {
    const toggle = document.getElementById('mirrorToggle');
    const status = document.getElementById('mirrorStatus');
    isMirrorEnabled = !isMirrorEnabled;
    toggle.classList.toggle('active', isMirrorEnabled);
    status.textContent = isMirrorEnabled ? 'ON' : 'OFF';
    console.log('Mirror enabled:', isMirrorEnabled);
});

// Frame slider
document.getElementById('frameSlider').addEventListener('input', (e) => {
    if (!videoElement || !referenceData) return;

    const percentage = e.target.value / 100;
    const duration = videoElement.duration || 0;
    const targetTime = percentage * duration;

    calibrationTime = targetTime;
    calibrationVideo.currentTime = targetTime;
    videoElement.currentTime = targetTime;

    document.getElementById('currentTime').textContent = targetTime.toFixed(1);
});

// Input mode toggle
document.getElementById('inputMode').addEventListener('change', (e) => {
    const playerVideoFile = document.getElementById('playerVideoFile');
    if (e.target.value === 'video') {
        playerVideoFile.style.display = 'block';
    } else {
        playerVideoFile.style.display = 'none';
    }
});

function resizeCanvas() {
    if (!canvas || !videoElement) return;

    const video = videoElement;
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (!videoWidth || !videoHeight) return;

    // 1. Calcular espacio disponible
    const header = document.querySelector('header');
    const headerHeight = header ? header.offsetHeight : 0;

    const gameContainer = document.querySelector('.game-container');
    const gameContainerPadding = 20; // padding del game-container (top + bottom)

    const mainPanel = document.querySelector('.main-panel');
    const mainPanelBorder = 4; // 2px border top + 2px border bottom

    // 2. Altura disponible REAL para el video-container
    const availableHeight = window.innerHeight - headerHeight - gameContainerPadding - mainPanelBorder;
    const availableWidth = window.innerWidth - 80; // padding lateral
    const effectiveWidth = Math.min(availableWidth, 1200);

    // 3. Calcular tamaño del video respetando aspect ratio
    const videoAspect = videoWidth / videoHeight;
    const availableAspect = effectiveWidth / availableHeight;

    let renderWidth, renderHeight;

    if (availableAspect > videoAspect) {
        renderHeight = availableHeight;
        renderWidth = renderHeight * videoAspect;
    } else {
        renderWidth = effectiveWidth;
        renderHeight = renderWidth / videoAspect;
    }

    console.log('Render size:', renderWidth, 'x', renderHeight);

    // 4. REDIMENSIONAR EL MAIN-PANEL para que se ajuste al video
    if (mainPanel) {
        mainPanel.style.maxHeight = renderHeight + 'px';
        mainPanel.style.height = renderHeight + 'px';
    }

    // 5. REDIMENSIONAR EL VIDEO-CONTAINER
    const videoContainer = video.parentElement;
    if (videoContainer) {
        videoContainer.style.height = renderHeight + 'px';
        videoContainer.style.minHeight = renderHeight + 'px';
    }

    // 6. Canvas interno y display
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    canvas.style.width = renderWidth + 'px';
    canvas.style.height = renderHeight + 'px';

    // 7. Posicionar canvas y video
    const containerWidth = videoContainer.clientWidth || effectiveWidth;
    canvas.style.left = ((containerWidth - renderWidth) / 2) + 'px';
    canvas.style.top = '0px';

    video.style.width = renderWidth + 'px';
    video.style.height = renderHeight + 'px';
    video.style.left = ((containerWidth - renderWidth) / 2) + 'px';
    video.style.top = '0px';
}

// Resize canvas when video metadata loads or window resizes
window.addEventListener('resize', () => {
    resizeCanvas();
    resizeCalibrationCanvas();
});

/**
 * Initialize the game
 */
async function initGame() {
    const videoFile = document.getElementById('videoFile').files[0];
    const jsonFile = document.getElementById('jsonFile').files[0];
    const inputMode = document.getElementById('inputMode').value;
    const playerVideoFile = document.getElementById('playerVideoFile').files[0];

    if (!videoFile || !jsonFile) {
        alert('Please select both reference video and choreography JSON');
        return;
    }

    if (inputMode === 'video' && !playerVideoFile) {
        alert('Please select a player video file');
        return;
    }

    document.getElementById('loading').classList.add('active');
    document.getElementById('startBtn').disabled = true;

    try {
        console.log("Loading JSON...");
        const jsonText = await jsonFile.text();
        referenceData = JSON.parse(jsonText);

        console.log("Setting up reference video...");
        videoElement = document.getElementById('referenceVideo');
        videoElement.src = URL.createObjectURL(videoFile);

        // Setup calibration video (same source)
        calibrationVideo = document.getElementById('calibrationVideo');
        calibrationVideo.src = URL.createObjectURL(videoFile);

        console.log("Initializing MediaPipe Pose...");
        pose = new Pose({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
            }
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.7
        });

        pose.onResults(onPoseResults);

        canvas = document.getElementById('playerCanvas');

        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                resizeCanvas();

                // Setup slider max value based on video duration
                if (videoElement.duration) {
                    document.getElementById('totalTime').textContent = videoElement.duration.toFixed(1);
                }

                resolve();
            };
        });

        ctx = canvas.getContext('2d');
        calibrationCanvas = document.getElementById('calibrationCanvas');
        calibrationCtx = calibrationCanvas.getContext('2d');

        calibrationCanvas.width = calibrationVideo.videoWidth || 640;
        calibrationCanvas.height = calibrationVideo.videoHeight || 480;

        calibrationCanvas.width = calibrationVideo.videoWidth || 640;
        calibrationCanvas.height = calibrationVideo.videoHeight || 480;

        // Llamar a la función de resize para ajustar al viewport
        setTimeout(() => {
            resizeCalibrationCanvas();
        }, 100);

        if (inputMode === 'webcam') {
            console.log("Setting up webcam...");
            const videoEl = document.createElement('video');
            videoEl.setAttribute('autoplay', '');
            videoEl.setAttribute('muted', '');
            videoEl.setAttribute('playsinline', '');
            videoEl.classList.add('webcam-hidden');
            document.body.appendChild(videoEl);

            console.log("Starting camera...");
            camera = new Camera(videoEl, {
                onFrame: async () => {
                    await pose.send({ image: videoEl });
                },
                width: 640,
                height: 480
            });

            await camera.start();
            console.log("Camera ready.");
        } else {
            // Video mode
            console.log("Setting up player video...");
            const videoEl = document.createElement('video');
            videoEl.src = URL.createObjectURL(playerVideoFile);
            videoEl.setAttribute('muted', '');
            videoEl.setAttribute('playsinline', '');
            videoEl.classList.add('webcam-hidden');
            document.body.appendChild(videoEl);

            await new Promise((resolve) => {
                videoEl.onloadedmetadata = () => resolve();
            });

            // Store reference for sync
            window.playerVideoElement = videoEl;

            // Process video frames
            const processFrame = async () => {
                if (!videoEl.paused && !videoEl.ended) {
                    await pose.send({ image: videoEl });
                }
                requestAnimationFrame(processFrame);
            };
            processFrame();

            console.log("Player video ready.");
        }

        document.getElementById('loading').classList.remove('active');
        document.getElementById('setupScreen').classList.add('hidden');
        document.getElementById('gameScreen').classList.remove('hidden');

        // Call resizeCanvas multiple times to ensure proper sizing
        setTimeout(() => {
            resizeCanvas();
        }, 100);

        setTimeout(() => {
            resizeCanvas();
        }, 300);

        setTimeout(() => {
            resizeCanvas();
        }, 500);

        startCalibration();

    } catch (error) {
        console.error('Initialization error:', error);
        alert('Error starting game: ' + error.message);
        document.getElementById('loading').classList.remove('active');
        document.getElementById('startBtn').disabled = false;
    }
}

/**
 * Apply mirror transformation to landmarks if enabled
 */
function applyMirror(landmarks) {
    if (!isMirrorEnabled || !landmarks) return landmarks;

    // Step 1: Mirror horizontally (x' = 1 - x)
    const mirrored = landmarks.map(lm => ({
        ...lm,
        x: 1 - lm.x
    }));

    // Step 2: Swap left-right landmarks
    const swapped = [...mirrored];
    for (const [leftIdx, rightIdx] of this.KEYPOINTS_MIRROR_SWAP) {
        const temp = swapped[leftIdx];
        swapped[leftIdx] = swapped[rightIdx];
        swapped[rightIdx] = temp;
    }

    return swapped;
}

/**
 * Handle pose detection results from MediaPipe
 */
function onPoseResults(results) {
    let playerLandmarks = results.poseLandmarks;

    // Apply mirror if enabled
    if (playerLandmarks && isMirrorEnabled) {
        playerLandmarks = applyMirror(playerLandmarks);
    }

    if (playerLandmarks) {
        currentPlayerPose = playerLandmarks;

        if (!isCalibrated) {
            handleCalibration(playerLandmarks);
            return;
        }
    }

    if (!isCalibrated) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentPlayerPose) {
        const referencePose = getCurrentReferencePose();

        if (referencePose && isPlaying) {
            const comparison = comparePoses(currentPlayerPose, referencePose);
            drawSkeletonOnVideo(currentPlayerPose, comparison);
        } else {
            const neutralComparison = {
                position: { matches: {} },
                angles: { matches: {} },
                acceleration: { matches: {} }
            };
            drawSkeletonOnVideo(currentPlayerPose, neutralComparison);
        }
    }
}

/**
 * Start calibration process
 */
function startCalibration() {
    isCalibrated = false;
    isPlaying = false;
    calibrationFrames = 0;
    positionHistory = [];
    positionSmoothHistory = {};
    angleSmoothHistory = {};
    accelerationSmoothHistory = {};

    // Reset videos to start
    videoElement.currentTime = 0;
    videoElement.pause();

    if (calibrationVideo) {
        calibrationVideo.currentTime = 0;
        calibrationVideo.pause();
    }

    // Reset slider
    document.getElementById('frameSlider').value = 0;
    document.getElementById('currentTime').textContent = '0.0';
    calibrationTime = 0;

    document.getElementById('calibrationScreen').classList.add('active');
    document.getElementById('calibrationStatus').textContent = 'Detecting pose...';
    document.getElementById('calibrationProgress').style.width = '0%';
}

/**
 * Skip calibration
 */
function skipCalibration() {
    isCalibrated = true;
    scaleFactorX = 1;
    scaleFactorY = 1;
    offsetX = 0;
    offsetY = 0;
    document.getElementById('calibrationScreen').classList.remove('active');
    resizeCanvas();

    // Auto-start game after calibration
    setTimeout(() => {
        startGameAfterCalibration();
    }, 100);
}

/**
 * Start game automatically after successful calibration
 */
function startGameAfterCalibration() {
    console.log("Auto-starting game after calibration");

    // For browser autoplay policies, we need user interaction
    // But since they just calibrated, we can try to play
    // If it fails due to audio policy, we show a "Click to Start" overlay

    if (!isPlaying) {
        isPlaying = true;

        // Try to play reference video
        videoElement.muted = false;
        videoElement.volume = 1.0;

        const playPromise = videoElement.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log("Video playing automatically");
                document.getElementById('playPauseBtn').textContent = 'Pause';
            }).catch(error => {
                console.warn("Autoplay prevented:", error);
                // Show click-to-start overlay or fallback
                showAudioFallback();
            });
        }

        // Sync player video if exists
        if (window.playerVideoElement) {
            window.playerVideoElement.currentTime = videoElement.currentTime;
            window.playerVideoElement.play();
        }
    }
}

/**
 * Show fallback if audio autoplay is blocked
 */
function showAudioFallback() {
    // Create temporary click overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(10, 10, 15, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        cursor: pointer;
        flex-direction: column;
    `;
    overlay.innerHTML = `
        <div style="font-family: Orbitron; font-size: 2rem; color: #00d4ff; text-align: center;">
            <div>🎵 Click to Start Music</div>
            <div style="font-size: 1rem; color: #888; margin-top: 10px;">
                (Browser requires interaction for audio)
            </div>
        </div>
    `;

    overlay.addEventListener('click', () => {
        videoElement.play();
        document.getElementById('playPauseBtn').textContent = 'Pause';
        overlay.remove();
    });

    document.body.appendChild(overlay);
}

/**
 * Handle calibration frame by frame
 */
function handleCalibration(playerLandmarks) {
    // Clear canvas
    calibrationCtx.clearRect(0, 0, calibrationCanvas.width, calibrationCanvas.height);

    // Draw video frame
    if (calibrationVideo && calibrationVideo.videoWidth) {
        calibrationCtx.drawImage(
            calibrationVideo,
            0, 0,
            calibrationCanvas.width,
            calibrationCanvas.height
        );
    }

    const referencePose = getReferencePoseAtTime(calibrationTime);

    if (!referencePose) {
        document.getElementById('calibrationStatus').textContent = 'No reference pose found. Try another frame';
        return;
    }

    // Draw reference skeleton (semi-transparent)
    drawCalibrationSkeleton(referencePose.landmarks, 'rgba(0, 212, 255, 0.6)');

    // Draw player skeleton
    drawCalibrationSkeleton(playerLandmarks, '#00ff88', true);


    const refConverted = convertReferenceLandmarks(referencePose.landmarks);
    for (let i = 0; i < playerLandmarks.length; i++) {
        if (!playerLandmarks[i] || !refConverted[i]) continue;
        if (playerLandmarks[i].visibility < 0.5 || refConverted[i].visibility < 0.5) continue;

        const px = playerLandmarks[i].x * calibrationCanvas.width;
        const py = playerLandmarks[i].y * calibrationCanvas.height;
        const rx = refConverted[i].x * calibrationCanvas.width;
        const ry = refConverted[i].y * calibrationCanvas.height;

        const distance = Math.sqrt((px - rx) ** 2 + (py - ry) ** 2);

        // Si coinciden (menos de 20px de distancia), iluminar en amarillo brillante
        if (distance < 20) {
            calibrationCtx.fillStyle = '#ffff00';
            calibrationCtx.shadowBlur = 15;
            calibrationCtx.shadowColor = '#ffff00';
            calibrationCtx.beginPath();
            calibrationCtx.arc(px, py, 8, 0, 2 * Math.PI);
            calibrationCtx.fill();
            calibrationCtx.shadowBlur = 0;
        }
    }

    // Calculate match
    const comparison = comparePoses(playerLandmarks, referencePose);
    const matchPercentage = (comparison.overall_score * 100).toFixed(0);

    document.getElementById('calibrationProgress').style.width = matchPercentage + '%';

    if (comparison.overall_score >= GameConfig.MIN_CALIBRATION_QUALITY) {
        calibrationFrames++;
        document.getElementById('calibrationStatus').textContent =
            `Good! Hold pose... (${calibrationFrames}/${GameConfig.CALIBRATION_FRAMES})`;

        if (calibrationFrames >= GameConfig.CALIBRATION_FRAMES) {
            calculateNormalization(playerLandmarks, referencePose.landmarks);
            isCalibrated = true;
            document.getElementById('calibrationScreen').classList.remove('active');
            showFeedback('CALIBRATED!', '#00ff88');

            // Auto-start game
            setTimeout(() => {
                startGameAfterCalibration();
            }, 500);
        }
    } else {
        calibrationFrames = 0;
        document.getElementById('calibrationStatus').textContent = 'Insufficient match. Adjust your pose...';
    }
}

/**
 * Get reference pose at specific time
 */
function getReferencePoseAtTime(time) {
    if (!referenceData) return null;

    const poses = referenceData.poses;
    if (!poses || poses.length === 0) return null;

    let closest = poses[0];
    let minDiff = Math.abs(time - closest.timestamp);

    for (const pose of poses) {
        const diff = Math.abs(time - pose.timestamp);
        if (diff < minDiff) {
            minDiff = diff;
            closest = pose;
        }
    }

    if (minDiff > 0.5) return null;
    return closest;
}

/**
 * Calculate normalization factors from calibration
 */
function calculateNormalization(playerLandmarks, referenceLandmarks) {
    const playerTorso = getTorsoSize(playerLandmarks);
    const refTorso = getTorsoSize(convertReferenceLandmarks(referenceLandmarks));

    // Usar el promedio de ambos factores para mantener proporciones
    const avgScale = (refTorso.width / playerTorso.width + refTorso.height / playerTorso.height) / 2;
    scaleFactorX = avgScale;
    scaleFactorY = avgScale;

    const playerCenter = getTorsoCenter(playerLandmarks);
    const refCenter = getTorsoCenter(convertReferenceLandmarks(referenceLandmarks));

    // CORREGIDO: el offset es simplemente la diferencia entre centros
    offsetX = refCenter.x - playerCenter.x;
    offsetY = refCenter.y - playerCenter.y;

    console.log('Calibration:', {
        scaleFactorX, scaleFactorY, offsetX, offsetY,
        playerCenter, refCenter,
        playerTorso, refTorso
    });
}

/**
 * Get torso size for normalization
 */
function getTorsoSize(landmarks) {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    const width = Math.abs(rightShoulder.x - leftShoulder.x);
    const height = Math.abs((leftHip.y + rightHip.y) / 2 - (leftShoulder.y + rightShoulder.y) / 2);

    return { width, height };
}

/**
 * Get torso center for normalization
 */
function getTorsoCenter(landmarks) {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    return {
        x: (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4,
        y: (leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 4
    };
}

/**
 * Normalize player pose
 */
function normalizePose(landmarks) {
    return landmarks.map(lm => ({
        x: (lm.x + offsetX) * scaleFactorX,
        y: (lm.y + offsetY) * scaleFactorY,
        z: lm.z,
        visibility: lm.visibility
    }));
}

/**
 * Convert reference landmarks (from JSON format) to MediaPipe format
 */
function convertReferenceLandmarks(refLandmarks) {
    // Reference landmarks are in format: [{id, x, y, z, visibility}, ...]
    // Need to convert to array indexed by id
    const converted = new Array(33);
    for (const lm of refLandmarks) {
        converted[lm.id] = lm;
    }
    return converted;
}

/**
 * Get first reference pose from choreography
 */
function getFirstReferencePose() {
    return getReferencePoseAtTime(0);
}

/**
 * Get current reference pose based on video time
 */
function getCurrentReferencePose() {
    if (!referenceData || !videoElement) return null;

    const currentTime = videoElement.currentTime;
    return getReferencePoseAtTime(currentTime);
}

/**
 * Compare poses with positions, angles, and acceleration
 */
function comparePoses(playerLandmarks, referencePose) {
    const normalizedPlayer = normalizePose(playerLandmarks);
    const refLandmarks = convertReferenceLandmarks(referencePose.landmarks);

    // Compare positions
    const positionResult = comparePositions(normalizedPlayer, refLandmarks);

    // Calculate and compare angles
    const playerAngles = calculateAngles(normalizedPlayer);
    const refAngles = referencePose.angles || {};
    const angleResult = compareAngles(playerAngles, refAngles);

    // Calculate and compare acceleration
    const playerAccel = calculateAcceleration(normalizedPlayer);
    const refAccel = referencePose.acceleration || {};
    const accelResult = compareAcceleration(playerAccel, refAccel);

    // Weighted overall score
    const overall_score = (
        GameConfig.POSITION_WEIGHT * positionResult.score +
        GameConfig.ANGLE_WEIGHT * angleResult.score +
        GameConfig.ACCELERATION_WEIGHT * accelResult.score
    );

    // Update game score if playing
    if (isPlaying) {
        updateScore(overall_score);
    }

    return {
        overall_score: overall_score,
        position: positionResult,
        angles: angleResult,
        acceleration: accelResult
    };
}

/**
 * Compare landmark positions
 */
function comparePositions(playerLandmarks, refLandmarks) {
    const matches = {};
    let totalDistance = 0;
    let count = 0;
    let matchedCount = 0;

    for (const jointIdx of GameConfig.SCORING_JOINTS) {
        const playerJoint = playerLandmarks[jointIdx];
        const refJoint = refLandmarks[jointIdx];

        if (!playerJoint || !refJoint || playerJoint.visibility < 0.5 || refJoint.visibility < 0.5) {
            matches[jointIdx] = null;
            continue;
        }

        let distance = Math.sqrt(
            Math.pow(playerJoint.x - refJoint.x, 2) +
            Math.pow(playerJoint.y - refJoint.y, 2) +
            Math.pow(playerJoint.z - refJoint.z, 2)
        );

        // Apply smoothing
        if (positionSmoothHistory[jointIdx] !== undefined) {
            distance = GameConfig.POSITION_SMOOTHING * distance +
                (1 - GameConfig.POSITION_SMOOTHING) * positionSmoothHistory[jointIdx];
        }
        positionSmoothHistory[jointIdx] = distance;

        totalDistance += distance;
        count++;

        const isMatch = distance < GameConfig.POSITION_THRESHOLD;
        matches[jointIdx] = isMatch;
        if (isMatch) matchedCount++;
    }

    const avgDistance = totalDistance / count || 1.0;
    const score = Math.max(0, 1.0 - avgDistance);
    const accuracy = matchedCount / count || 0;

    return { score, accuracy, matches, avgDistance, matchedCount, totalJoints: count };
}

/**
 * Calculate joint angles
 */
function calculateAngles(landmarks) {
    const angles = {};

    for (const [angleName, [p1, vertex, p2]] of Object.entries(GameConfig.ANGLE_JOINTS)) {
        const pt1 = landmarks[p1];
        const vtx = landmarks[vertex];
        const pt2 = landmarks[p2];

        if (!pt1 || !vtx || !pt2 ||
            pt1.visibility < 0.5 || vtx.visibility < 0.5 || pt2.visibility < 0.5) {
            angles[angleName] = null;
            continue;
        }

        angles[angleName] = computeAngle(pt1, vtx, pt2);
    }

    return angles;
}

/**
 * Compute angle between three points
 */
function computeAngle(p1, vertex, p2) {
    const v1 = {
        x: p1.x - vertex.x,
        y: p1.y - vertex.y,
        z: p1.z - vertex.z
    };
    const v2 = {
        x: p2.x - vertex.x,
        y: p2.y - vertex.y,
        z: p2.z - vertex.z
    };

    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    const cosAngle = dot / (mag1 * mag2 + 1e-8);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    return angleRad * (180 / Math.PI);
}

/**
 * Compare angles
 */
function compareAngles(playerAngles, refAngles) {
    const matches = {};
    let totalDiff = 0;
    let count = 0;
    let matchedCount = 0;

    for (const [angleName, playerAngle] of Object.entries(playerAngles)) {
        if (playerAngle === null || refAngles[angleName] === null || refAngles[angleName] === undefined) {
            matches[angleName] = null;
            continue;
        }

        let angleDiff = Math.abs(playerAngle - refAngles[angleName]);

        // Apply smoothing
        if (angleSmoothHistory[angleName] !== undefined) {
            angleDiff = GameConfig.ANGLE_SMOOTHING * angleDiff +
                (1 - GameConfig.ANGLE_SMOOTHING) * angleSmoothHistory[angleName];
        }
        angleSmoothHistory[angleName] = angleDiff;

        totalDiff += angleDiff;
        count++;

        const isMatch = angleDiff < GameConfig.ANGLE_THRESHOLD;
        matches[angleName] = isMatch;
        if (isMatch) matchedCount++;
    }

    const avgDiff = totalDiff / count || 180;
    const score = Math.max(0, 1.0 - avgDiff / 180.0);
    const accuracy = matchedCount / count || 0;

    return { score, accuracy, matches, avgDifference: avgDiff };
}

/**
 * Calculate acceleration for hands and feet
 */
function calculateAcceleration(landmarks) {
    const acceleration = {};

    // Store current positions
    const currentPositions = {};
    for (const [pointName, pointId] of Object.entries(GameConfig.ACCELERATION_POINTS)) {
        const lm = landmarks[pointId];
        if (lm && lm.visibility > 0.5) {
            currentPositions[pointName] = { x: lm.x, y: lm.y, z: lm.z };
        }
    }

    // Add to history
    positionHistory.push(currentPositions);
    if (positionHistory.length > GameConfig.ACCELERATION_HISTORY_FRAMES) {
        positionHistory.shift();
    }

    // Calculate acceleration if we have enough history
    if (positionHistory.length >= 3) {
        const curr = positionHistory[positionHistory.length - 1];
        const prev = positionHistory[positionHistory.length - 2];
        const prev2 = positionHistory[positionHistory.length - 3];

        for (const pointName of Object.keys(GameConfig.ACCELERATION_POINTS)) {
            if (curr[pointName] && prev[pointName] && prev2[pointName]) {
                // Velocity at t and t-1
                const vx = curr[pointName].x - prev[pointName].x;
                const vy = curr[pointName].y - prev[pointName].y;
                const vz = curr[pointName].z - prev[pointName].z;

                const vx_prev = prev[pointName].x - prev2[pointName].x;
                const vy_prev = prev[pointName].y - prev2[pointName].y;
                const vz_prev = prev[pointName].z - prev2[pointName].z;

                // Acceleration
                const ax = vx - vx_prev;
                const ay = vy - vy_prev;
                const az = vz - vz_prev;

                const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);

                acceleration[pointName] = {
                    magnitude: magnitude,
                    direction: { x: ax, y: ay, z: az }
                };
            } else {
                acceleration[pointName] = {
                    magnitude: 0,
                    direction: { x: 0, y: 0, z: 0 }
                };
            }
        }
    } else {
        for (const pointName of Object.keys(GameConfig.ACCELERATION_POINTS)) {
            acceleration[pointName] = {
                magnitude: 0,
                direction: { x: 0, y: 0, z: 0 }
            };
        }
    }

    return acceleration;
}

/**
 * Compare acceleration
 */
function compareAcceleration(playerAccel, refAccel) {
    const matches = {};
    let totalDiff = 0;
    let count = 0;
    let matchedCount = 0;

    for (const [pointName, playerData] of Object.entries(playerAccel)) {
        const refData = refAccel[pointName];
        if (!refData) {
            matches[pointName] = null;
            continue;
        }

        let accelDiff = Math.abs(playerData.magnitude - refData.magnitude);

        // Apply smoothing
        if (accelerationSmoothHistory[pointName] !== undefined) {
            accelDiff = GameConfig.ACCELERATION_SMOOTHING * accelDiff +
                (1 - GameConfig.ACCELERATION_SMOOTHING) * accelerationSmoothHistory[pointName];
        }
        accelerationSmoothHistory[pointName] = accelDiff;

        totalDiff += accelDiff;
        count++;

        const isMatch = accelDiff < GameConfig.ACCELERATION_THRESHOLD;
        matches[pointName] = isMatch;
        if (isMatch) matchedCount++;
    }

    const avgDiff = totalDiff / count || 1.0;
    const score = Math.max(0, 1.0 - avgDiff);
    const accuracy = matchedCount / count || 0;

    return { score, accuracy, matches, avgDifference: avgDiff };
}

/**
 * Draw skeleton on video canvas
 */
function drawSkeletonOnVideo(landmarks, comparison) {
    ctx.lineWidth = GameConfig.LINE_THICKNESS;

    // Draw connections
    for (const [start, end] of GameConfig.POSE_CONNECTIONS) {
        const startLm = landmarks[start];
        const endLm = landmarks[end];

        if (!startLm || !endLm || startLm.visibility < 0.5 || endLm.visibility < 0.5) continue;

        let color = 'rgba(255, 255, 255, 0.4)';

        // Color based on position matches
        const startMatch = comparison.position.matches[start];
        const endMatch = comparison.position.matches[end];

        if (startMatch === true && endMatch === true) {
            color = GameConfig.SKELETON_COLOR;
        } else if (startMatch === false || endMatch === false) {
            color = '#ff0080';
        }

        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(startLm.x * canvas.width, startLm.y * canvas.height);
        ctx.lineTo(endLm.x * canvas.width, endLm.y * canvas.height);
        ctx.stroke();
    }

    // Draw landmarks
    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (!lm || lm.visibility < 0.5) continue;

        const x = lm.x * canvas.width;
        const y = lm.y * canvas.height;

        let color = 'rgba(255, 255, 255, 0.6)';
        if (comparison.position.matches[i] === true) {
            color = GameConfig.SKELETON_COLOR;
        } else if (comparison.position.matches[i] === false) {
            color = '#ff0080';
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();

        if (comparison.position.matches[i] === true) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = color;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

/**
 * Draw skeleton for calibration
 */
function drawCalibrationSkeleton(landmarks, color, isPlayer = false) {
    calibrationCtx.lineWidth = 3;
    calibrationCtx.strokeStyle = color;

    const isRefFormat = Array.isArray(landmarks) && landmarks[0] && landmarks[0].id !== undefined;
    const lmArray = isRefFormat ? convertReferenceLandmarks(landmarks) : landmarks;

    for (const [start, end] of GameConfig.POSE_CONNECTIONS) {
        const startLm = lmArray[start];
        const endLm = lmArray[end];

        if (!startLm || !endLm || startLm.visibility < 0.5 || endLm.visibility < 0.5) continue;

        calibrationCtx.beginPath();
        calibrationCtx.moveTo(startLm.x * calibrationCanvas.width, startLm.y * calibrationCanvas.height);
        calibrationCtx.lineTo(endLm.x * calibrationCanvas.width, endLm.y * calibrationCanvas.height);
        calibrationCtx.stroke();
    }

    calibrationCtx.fillStyle = color;
    for (const lm of lmArray) {
        if (!lm || lm.visibility < 0.5) continue;
        calibrationCtx.beginPath();
        calibrationCtx.arc(lm.x * calibrationCanvas.width, lm.y * calibrationCanvas.height, 5, 0, 2 * Math.PI);
        calibrationCtx.fill();
    }
}

/**
 * Update score based on comparison
 */
function updateScore(overallScore) {
    totalFrames++;

    if (overallScore > GameConfig.COMBO_THRESHOLD) {
        matchedFrames++;
        combo++;
        score += GameConfig.BASE_POINTS * (1 + combo * GameConfig.COMBO_MULTIPLIER);

        if (combo > 5) {
            const indicator = document.getElementById('comboIndicator');
            const comboVal = document.getElementById('comboValue');
            comboVal.textContent = combo;
            indicator.classList.add('active');
        }

        if (combo % 10 === 0 && combo > 0) {
            showFeedback('PERFECT!', '#00ff88');
        }
    } else {
        if (combo > 10) {
            showFeedback('COMBO BREAK', '#ff0080');
        }
        combo = 0;
        document.getElementById('comboIndicator').classList.remove('active');
    }

    updateUI();
}

/**
 * Update UI elements
 */
function updateUI() {
    document.getElementById('score').textContent = Math.floor(score);
    document.getElementById('combo').textContent = combo;

    const accuracy = totalFrames > 0 ? (matchedFrames / totalFrames) * 100 : 0;
    document.getElementById('accuracy').textContent = accuracy.toFixed(0) + '%';
}

/**
 * Show feedback text
 */
function showFeedback(text, color) {
    const feedback = document.getElementById('feedback');
    feedback.textContent = text;
    feedback.style.color = color;
    feedback.classList.remove('show');
    void feedback.offsetWidth;
    feedback.classList.add('show');
}

/**
 * Toggle play/pause
 */
function togglePlayPause() {
    if (!isCalibrated) {
        alert('Please complete calibration first');
        return;
    }

    isPlaying = !isPlaying;
    const btn = document.getElementById('playPauseBtn');

    if (isPlaying) {
        videoElement.muted = false;
        videoElement.volume = 1.0;
        videoElement.play();

        if (window.playerVideoElement) {
            window.playerVideoElement.play();
        }

        btn.textContent = 'Pause';
    } else {
        videoElement.pause();

        if (window.playerVideoElement) {
            window.playerVideoElement.pause();
        }

        btn.textContent = 'Play';
    }
}

/**
 * Reset game
 */
function resetGame() {
    score = 0;
    combo = 0;
    totalFrames = 0;
    matchedFrames = 0;
    positionHistory = [];
    positionSmoothHistory = {};
    angleSmoothHistory = {};
    accelerationSmoothHistory = {};

    videoElement.currentTime = 0;
    isPlaying = false;

    if (window.playerVideoElement) {
        window.playerVideoElement.currentTime = 0;
        window.playerVideoElement.pause();
    }

    document.getElementById('playPauseBtn').textContent = 'Play';
    updateUI();
}

function resizeCalibrationCanvas() {
    if (!calibrationCanvas || !calibrationVideo) return;

    const videoWidth = calibrationVideo.videoWidth;
    const videoHeight = calibrationVideo.videoHeight;

    if (!videoWidth || !videoHeight) return;

    // Calcular espacio disponible
    const calContent = document.querySelector('.calibration-content');
    if (!calContent) return;

    const calPreview = document.querySelector('.calibration-preview');
    const calStatus = document.querySelector('.calibration-status');

    // Altura del título + margen
    const titleHeight = 30; // h2 + margin
    // Altura del status (text + progress + hint + button)
    const statusHeight = calStatus ? calStatus.offsetHeight : 120;

    // Padding del content
    const contentPadding = 30; // 15px top + 15px bottom

    // Espacio disponible para el preview
    const maxPreviewHeight = window.innerHeight * 0.6 - titleHeight - statusHeight - contentPadding - 30; // 30px extra margin
    const maxPreviewWidth = window.innerWidth - 30; // padding lateral

    // Calcular tamaño respetando aspect ratio
    const videoAspect = videoWidth / videoHeight;
    const availableAspect = maxPreviewWidth / maxPreviewHeight;

    console.log('window.innerHeight: ', window.innerHeight, ' videoAspect: ', videoAspect, ' availableAspect: ', availableAspect, 'titleHeight: ', titleHeight, ' statusHeight: ', statusHeight, ' contentPadding: ', contentPadding);

    let renderWidth, renderHeight;

    if (availableAspect > videoAspect) {
        renderHeight = Math.min(maxPreviewHeight, videoHeight);
        renderWidth = renderHeight * videoAspect;
    } else {
        renderWidth = Math.min(maxPreviewWidth, videoWidth);
        renderHeight = renderWidth / videoAspect;
    }

    // Ajustar el contenedor preview
    if (calPreview) {
        calPreview.style.height = renderHeight + 'px';
        calPreview.style.width = renderWidth + 'px';
        calPreview.style.margin = '0 auto 15px auto';
    }

    // Canvas interno y display
    calibrationCanvas.width = videoWidth;
    calibrationCanvas.height = videoHeight;
    calibrationCanvas.style.width = renderWidth + 'px';
    calibrationCanvas.style.height = renderHeight + 'px';
    calibrationCanvas.style.left = '0px';
    calibrationCanvas.style.top = '0px';

    // Video
    calibrationVideo.style.width = renderWidth + 'px';
    calibrationVideo.style.height = renderHeight + 'px';
    calibrationVideo.style.left = '0px';
    calibrationVideo.style.top = '0px';

    console.log('Calibration canvas resized:', renderWidth, 'x', renderHeight);
}