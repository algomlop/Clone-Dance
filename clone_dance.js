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

let score = 0;
let combo = 0;
let totalFrames = 0;
let matchedFrames = 0;
let isPlaying = false;
let isCalibrated = false;
let currentPlayerPose = null;

// Normalization factors (from calibration)
let scaleFactorX = 1;
let scaleFactorY = 1;
let offsetX = 0;
let offsetY = 0;

// Calibration
let calibrationFrames = 0;
let selectedCalibrationFrame = 0;
let calibrationVideo = null;

// Position history for acceleration calculation
let positionHistory = [];

// Smoothing histories
let positionSmoothHistory = {};
let angleSmoothHistory = {};
let accelerationSmoothHistory = {};

// Mirror settings
let mirrorWebcam = false;

// Player video element (for testing mode)
let playerVideoElement = null;

// Event listeners
document.getElementById('startBtn').addEventListener('click', initGame);
document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
document.getElementById('resetBtn').addEventListener('click', resetGame);
document.getElementById('recalibrateBtn').addEventListener('click', startCalibration);
document.getElementById('skipCalibrationBtn').addEventListener('click', skipCalibration);
document.getElementById('confirmCalibrationBtn').addEventListener('click', finishCalibration);

// Input mode toggle
document.getElementById('inputMode').addEventListener('change', (e) => {
    const playerVideoFile = document.getElementById('playerVideoFile');
    if (e.target.value === 'video') {
        playerVideoFile.style.display = 'block';
    } else {
        playerVideoFile.style.display = 'none';
    }
});

// Mirror checkboxes
document.getElementById('mirrorWebcam').addEventListener('change', (e) => {
    mirrorWebcam = e.target.checked;
});



// Frame slider for calibration
document.getElementById('frameSlider').addEventListener('input', (e) => {
    selectedCalibrationFrame = parseInt(e.target.value);
    document.getElementById('currentFrame').textContent = selectedCalibrationFrame;
    updateCalibrationFrame();
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


    //video.style.transform = 'scaleX(1)';

}

// Resize canvas when video metadata loads or window resizes
window.addEventListener('resize', resizeCanvas);

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
                resolve();
            };
        });

        ctx = canvas.getContext('2d');
        calibrationCanvas = document.getElementById('calibrationCanvas');
        calibrationCtx = calibrationCanvas.getContext('2d');

        calibrationCanvas.width = 640;
        calibrationCanvas.height = 480;

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
            playerVideoElement = videoEl;

            await new Promise((resolve) => {
                videoEl.onloadedmetadata = () => resolve();
            });

            // Sync player video with reference video
            videoElement.addEventListener('play', () => {
                videoEl.currentTime = videoElement.currentTime;
                videoEl.play();
            });

            videoElement.addEventListener('pause', () => {
                videoEl.pause();
            });

            videoElement.addEventListener('seeked', () => {
                videoEl.currentTime = videoElement.currentTime;
            });

            // Process video frames
            const processFrame = async () => {
                if (!videoEl.paused && !videoEl.ended) {
                    await pose.send({ image: videoEl });
                }
                requestAnimationFrame(processFrame);
            };
            processFrame();
        }

        document.getElementById('loading').classList.remove('active');


        if (!referenceData || !referenceData.frames || referenceData.frames.length === 0) {
            throw new Error("Invalid choreography data");
        }

        // Start calibration
        await startCalibration();

        document.getElementById('setupScreen').classList.add('hidden');

    } catch (error) {
        console.error("Error initializing game:", error);
        alert("Failed to initialize game. Check console for details.");
        document.getElementById('loading').classList.remove('active');
        document.getElementById('startBtn').disabled = false;
    }
}

/**
 * Start calibration process
 */
async function startCalibration() {
    isCalibrated = false;
    calibrationFrames = 0;

    // Initialize frame slider
    const maxFrames = (referenceData && referenceData.frames) ? referenceData.frames.length - 1 : 0;
    const frameSlider = document.getElementById('frameSlider');
    frameSlider.max = maxFrames;
    frameSlider.value = 0;
    selectedCalibrationFrame = 0;
    document.getElementById('currentFrame').textContent = '0';
    document.getElementById('totalFrames').textContent = maxFrames;

    // Create a hidden video for frame extraction
    if (!calibrationVideo) {
        calibrationVideo = document.createElement('video');
        calibrationVideo.src = videoElement.src;
        calibrationVideo.muted = true;
        calibrationVideo.style.display = 'none';
        document.body.appendChild(calibrationVideo);

        await new Promise((resolve) => {
            calibrationVideo.onloadedmetadata = () => resolve();
        });
    }

    // Show calibration screen
    document.getElementById('calibrationScreen').classList.add('active');
    document.getElementById('calibrationStatus').textContent = 'Detecting your pose...';
    document.getElementById('calibrationProgress').style.width = '0%';
    document.getElementById('confirmCalibrationBtn').style.display = 'none';

    // Draw initial reference frame
    updateCalibrationFrame();
}

/**
 * Update calibration frame display
 */
function updateCalibrationFrame() {
    if (!referenceData || !calibrationVideo) return;

    const frameData = referenceData.frames[selectedCalibrationFrame];
    if (!frameData) return;

    // Seek video to frame time
    const frameTime = frameData.timestamp || (selectedCalibrationFrame / 30.0); // Assume 30fps
    calibrationVideo.currentTime = frameTime;

    calibrationVideo.onseeked = () => {
        // Clear canvas
        calibrationCtx.fillStyle = '#000';
        calibrationCtx.fillRect(0, 0, calibrationCanvas.width, calibrationCanvas.height);

        // Draw video frame
        calibrationCtx.save();



        calibrationCtx.drawImage(
            calibrationVideo,
            0, 0,
            calibrationCanvas.width,
            calibrationCanvas.height
        );
        calibrationCtx.restore();

        // Draw reference skeleton
        if (frameData.landmarks) {
            drawCalibrationSkeleton(frameData.landmarks, '#00d4ff');
        }
    };
}

/**
 * Handle pose detection results
 */
function onPoseResults(results) {
    if (!results.poseLandmarks) {
        currentPlayerPose = null;
        return;
    }

    // Apply mirror to player landmarks if needed
    let landmarks = results.poseLandmarks;
    if (mirrorWebcam) {
        landmarks = landmarks.map(lm => ({
            ...lm,
            x: 1 - lm.x
        }));
    }

    currentPlayerPose = landmarks;

    // If calibrating, check match
    if (document.getElementById('calibrationScreen').classList.contains('active') && !isCalibrated) {
        calibrateFromPose(landmarks);
    }

    // If playing, compare poses
    if (isPlaying && isCalibrated) {
        comparePoses();
    }
}

/**
 * Calibrate from current pose
 */
function calibrateFromPose(playerLandmarks) {
    const frameData = referenceData.frames[selectedCalibrationFrame];
    if (!frameData || !frameData.landmarks) return;

    const refLandmarks = convertReferenceLandmarks(frameData.landmarks);

    // Calculate similarity
    const comparison = comparePosesDetailed(playerLandmarks, refLandmarks);
    const matchQuality = comparison.overall;

    // Update progress
    const progress = Math.min(100, matchQuality * 100);
    document.getElementById('calibrationProgress').style.width = progress + '%';

    // Draw player skeleton on calibration canvas
    calibrationCtx.fillStyle = '#000';
    calibrationCtx.fillRect(0, 0, calibrationCanvas.width, calibrationCanvas.height);

    // Draw video frame
    if (calibrationVideo) {
        calibrationCtx.save();

        calibrationCtx.drawImage(
            calibrationVideo,
            0, 0,
            calibrationCanvas.width,
            calibrationCanvas.height
        );
        calibrationCtx.restore();
    }

    // Draw reference skeleton (blue)
    drawCalibrationSkeleton(refLandmarks, 'rgba(0, 212, 255, 0.6)');

    // Draw player skeleton (green if matching, red if not)
    const playerColor = matchQuality > GameConfig.COMBO_THRESHOLD ? '#00ff88' : '#ff0080';
    drawCalibrationSkeleton(playerLandmarks, playerColor);

    if (matchQuality > GameConfig.MIN_CALIBRATION_QUALITY) {
        calibrationFrames++;

        const requiredFrames = 30; // 1 second at 30fps
        const calibrationPercent = Math.min(100, (calibrationFrames / requiredFrames) * 100);

        document.getElementById('calibrationStatus').textContent =
            `Good match! Hold position... ${Math.floor(calibrationPercent)}%`;

        if (calibrationFrames >= requiredFrames) {
            // Calibration complete
            calculateNormalizationFactors(playerLandmarks, refLandmarks);
            document.getElementById('calibrationStatus').textContent = 'Calibration complete! Ready to start.';
            document.getElementById('calibrationProgress').style.width = '100%';
            document.getElementById('confirmCalibrationBtn').style.display = 'block';
        }
    } else {
        calibrationFrames = Math.max(0, calibrationFrames - 2);
        document.getElementById('calibrationStatus').textContent =
            `Match quality: ${Math.floor(matchQuality * 100)}% - Match the reference pose`;
    }
}

/**
 * Calculate normalization factors from calibration
 */
function calculateNormalizationFactors(playerLandmarks, refLandmarks) {
    // Use torso landmarks for normalization (shoulders and hips)
    const playerLeftShoulder = playerLandmarks[11];
    const playerRightShoulder = playerLandmarks[12];
    const playerLeftHip = playerLandmarks[23];
    const playerRightHip = playerLandmarks[24];

    const refLeftShoulder = refLandmarks[11];
    const refRightShoulder = refLandmarks[12];
    const refLeftHip = refLandmarks[23];
    const refRightHip = refLandmarks[24];

    if (!playerLeftShoulder || !playerRightShoulder || !playerLeftHip || !playerRightHip ||
        !refLeftShoulder || !refRightShoulder || !refLeftHip || !refRightHip) {
        console.warn("Missing torso landmarks for calibration");
        scaleFactorX = 1;
        scaleFactorY = 1;
        offsetX = 0;
        offsetY = 0;
        return;
    }

    // Calculate torso dimensions
    const playerTorsoWidth = Math.abs(playerRightShoulder.x - playerLeftShoulder.x);
    const playerTorsoHeight = Math.abs((playerLeftHip.y + playerRightHip.y) / 2 - (playerLeftShoulder.y + playerRightShoulder.y) / 2);

    const refTorsoWidth = Math.abs(refRightShoulder.x - refLeftShoulder.x);
    const refTorsoHeight = Math.abs((refLeftHip.y + refRightHip.y) / 2 - (refLeftShoulder.y + refRightShoulder.y) / 2);

    // Calculate scale factors
    scaleFactorX = refTorsoWidth / Math.max(playerTorsoWidth, 0.01);
    scaleFactorY = refTorsoHeight / Math.max(playerTorsoHeight, 0.01);

    // Calculate offsets (align centers)
    const playerCenterX = (playerLeftShoulder.x + playerRightShoulder.x) / 2;
    const playerCenterY = (playerLeftShoulder.y + playerRightShoulder.y + playerLeftHip.y + playerRightHip.y) / 4;

    const refCenterX = (refLeftShoulder.x + refRightShoulder.x) / 2;
    const refCenterY = (refLeftShoulder.y + refRightShoulder.y + refLeftHip.y + refRightHip.y) / 4;

    offsetX = refCenterX - playerCenterX * scaleFactorX;
    offsetY = refCenterY - playerCenterY * scaleFactorY;

    console.log("Calibration factors:", { scaleFactorX, scaleFactorY, offsetX, offsetY });
}

/**
 * Finish calibration and start game
 */
function finishCalibration() {
    isCalibrated = true;
    document.getElementById('calibrationScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.remove('hidden');

    // Auto-start the video
    videoElement.muted = false;
    videoElement.volume = 1.0;
    videoElement.play();
    isPlaying = true;
    document.getElementById('playPauseBtn').textContent = 'Pause';
}

/**
 * Skip calibration
 */
function skipCalibration() {
    scaleFactorX = 1;
    scaleFactorY = 1;
    offsetX = 0;
    offsetY = 0;
    isCalibrated = true;

    document.getElementById('calibrationScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.remove('hidden');
}

/**
 * Convert reference landmarks format to MediaPipe format
 */
function convertReferenceLandmarks(refLandmarks) {
    const converted = new Array(33).fill(null);

    for (const lm of refLandmarks) {
        if (lm.id >= 0 && lm.id < 33) {
            converted[lm.id] = {
                x: lm.x,
                y: lm.y,
                z: lm.z || 0,
                visibility: lm.visibility || 1.0
            };
        }
    }

    return converted;
}

/**
 * Normalize player landmarks
 */
function normalizePlayerLandmarks(landmarks) {
    return landmarks.map(lm => {
        if (!lm) return null;
        return {
            x: lm.x * scaleFactorX + offsetX,
            y: lm.y * scaleFactorY + offsetY,
            z: lm.z,
            visibility: lm.visibility
        };
    });
}

/**
 * Compare current poses
 */
function comparePoses() {
    if (!currentPlayerPose || !isPlaying) return;

    const currentTime = videoElement.currentTime;
    const currentFrameIndex = Math.floor(currentTime * 30); // Assume 30fps

    if (currentFrameIndex >= referenceData.frames.length) return;

    const refFrame = referenceData.frames[currentFrameIndex];
    if (!refFrame || !refFrame.landmarks) return;

    const refLandmarks = convertReferenceLandmarks(refFrame.landmarks);
    const normalizedPlayerLandmarks = normalizePlayerLandmarks(currentPlayerPose);

    const comparison = comparePosesDetailed(normalizedPlayerLandmarks, refLandmarks);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw skeleton
    drawSkeletonOnVideo(normalizedPlayerLandmarks, comparison);

    // Update score
    updateScore(comparison.overall);
}

/**
 * Detailed pose comparison
 */
function comparePosesDetailed(playerLandmarks, refLandmarks) {
    const positionComp = comparePositions(playerLandmarks, refLandmarks);
    const angleComp = compareAngles(playerLandmarks, refLandmarks);

    // Store current positions for acceleration calculation
    positionHistory.push(playerLandmarks);
    if (positionHistory.length > GameConfig.ACCELERATION_HISTORY_FRAMES) {
        positionHistory.shift();
    }

    const playerAccel = calculateAcceleration(positionHistory);
    const refAccel = {
        left_hand: { magnitude: 0, direction: { x: 0, y: 0, z: 0 } },
        right_hand: { magnitude: 0, direction: { x: 0, y: 0, z: 0 } },
        left_foot: { magnitude: 0, direction: { x: 0, y: 0, z: 0 } },
        right_foot: { magnitude: 0, direction: { x: 0, y: 0, z: 0 } }
    };
    const accelComp = compareAcceleration(playerAccel, refAccel);

    const overall =
        positionComp.score * GameConfig.POSITION_WEIGHT +
        angleComp.score * GameConfig.ANGLE_WEIGHT +
        accelComp.score * GameConfig.ACCELERATION_WEIGHT;

    return {
        overall,
        position: positionComp,
        angle: angleComp,
        acceleration: accelComp
    };
}

/**
 * Compare positions
 */
function comparePositions(playerLandmarks, refLandmarks) {
    const matches = {};
    let totalDist = 0;
    let count = 0;
    let matchedCount = 0;

    for (const jointId of GameConfig.SCORING_JOINTS) {
        const playerLm = playerLandmarks[jointId];
        const refLm = refLandmarks[jointId];

        if (!playerLm || !refLm || playerLm.visibility < 0.5 || refLm.visibility < 0.5) {
            matches[jointId] = null;
            continue;
        }

        let dist = Math.sqrt(
            Math.pow(playerLm.x - refLm.x, 2) +
            Math.pow(playerLm.y - refLm.y, 2) +
            Math.pow(playerLm.z - refLm.z, 2)
        );

        // Apply smoothing
        const key = `pos_${jointId}`;
        if (positionSmoothHistory[key] !== undefined) {
            dist = GameConfig.POSITION_SMOOTHING * dist +
                (1 - GameConfig.POSITION_SMOOTHING) * positionSmoothHistory[key];
        }
        positionSmoothHistory[key] = dist;

        totalDist += dist;
        count++;

        const isMatch = dist < GameConfig.POSITION_THRESHOLD;
        matches[jointId] = isMatch;
        if (isMatch) matchedCount++;
    }

    const avgDist = totalDist / count || 1.0;
    const score = Math.max(0, 1.0 - avgDist);
    const accuracy = matchedCount / count || 0;

    return { score, accuracy, matches, avgDistance: avgDist };
}

/**
 * Calculate angle between three points
 */
function calculateAngle(p1, vertex, p2) {
    if (!p1 || !vertex || !p2) return null;

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

    if (mag1 === 0 || mag2 === 0) return null;

    const cosAngle = dot / (mag1 * mag2);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    return angle * (180 / Math.PI);
}

/**
 * Compare angles
 */
function compareAngles(playerLandmarks, refLandmarks) {
    const matches = {};
    let totalDiff = 0;
    let count = 0;
    let matchedCount = 0;

    for (const [jointName, [p1, vertex, p2]] of Object.entries(GameConfig.ANGLE_JOINTS)) {
        const playerAngle = calculateAngle(
            playerLandmarks[p1],
            playerLandmarks[vertex],
            playerLandmarks[p2]
        );

        const refAngle = calculateAngle(
            refLandmarks[p1],
            refLandmarks[vertex],
            refLandmarks[p2]
        );

        if (playerAngle === null || refAngle === null) {
            matches[jointName] = null;
            continue;
        }

        let angleDiff = Math.abs(playerAngle - refAngle);

        // Apply smoothing
        if (angleSmoothHistory[jointName] !== undefined) {
            angleDiff = GameConfig.ANGLE_SMOOTHING * angleDiff +
                (1 - GameConfig.ANGLE_SMOOTHING) * angleSmoothHistory[jointName];
        }
        angleSmoothHistory[jointName] = angleDiff;

        totalDiff += angleDiff;
        count++;

        const isMatch = angleDiff < GameConfig.ANGLE_THRESHOLD;
        matches[jointName] = isMatch;
        if (isMatch) matchedCount++;
    }

    const avgDiff = totalDiff / count || 180;
    const score = Math.max(0, 1.0 - avgDiff / 180);
    const accuracy = matchedCount / count || 0;

    return { score, accuracy, matches, avgDifference: avgDiff };
}

/**
 * Calculate acceleration from position history
 */
function calculateAcceleration(history) {
    const acceleration = {};

    if (history.length >= 3) {
        for (const [pointName, landmarkId] of Object.entries(GameConfig.ACCELERATION_POINTS)) {
            const p0 = history[0][landmarkId];
            const p1 = history[1][landmarkId];
            const p2 = history[2][landmarkId];

            if (p0 && p1 && p2 && p0.visibility > 0.5 && p1.visibility > 0.5 && p2.visibility > 0.5) {
                const v1x = p1.x - p0.x;
                const v1y = p1.y - p0.y;
                const v1z = p1.z - p0.z;

                const v2x = p2.x - p1.x;
                const v2y = p2.y - p1.y;
                const v2z = p2.z - p1.z;

                const ax = v2x - v1x;
                const ay = v2y - v1y;
                const az = v2z - v1z;

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
    // Save context state
    ctx.save();

    // Apply mirror if needed
    if (mirrorWebcam) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }

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

    // Restore context state
    ctx.restore();
}

/**
 * Draw skeleton for calibration
 */
function drawCalibrationSkeleton(landmarks, color) {
    calibrationCtx.save();

    // Apply mirror if drawing player landmarks and mirror is enabled
    const isPlayerLandmarks = !Array.isArray(landmarks) || (landmarks[0] && landmarks[0].id === undefined);
    if (isPlayerLandmarks && mirrorWebcam) {
        calibrationCtx.translate(calibrationCanvas.width, 0);
        calibrationCtx.scale(-1, 1);
    }

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

    calibrationCtx.restore();
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
        btn.textContent = 'Pause';
    } else {
        videoElement.pause();
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
    document.getElementById('playPauseBtn').textContent = 'Play';
    updateUI();
}