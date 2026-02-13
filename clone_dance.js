/**
 * Clone Dance - Main Game Logic
 * Includes pose comparison with positions and angles
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
let currentAccuracy = 0;
let lastScoreTimeSec = null;
let goodTimeAccumSec = 0;
let goodStreakSec = 0;
let angleDebugEl = null;
let lastAngleDebugUpdateMs = 0;
let isPlaying = false;
let isCalibrated = false;
let currentPlayerPose = null;
let referenceLowAnglesSinceSec = null;
let playerLowAnglesSinceSec = null;
let noPoseWarningMessage = '';
let isCountdownActive = false;
let statsMaxCombo = 0;
let statsAverageAccuracyAccum = 0;
let statsTrackedTimeSec = 0;

let gameEffectsLayerEl = null;
const effectsState = window.cloneDanceEffectsState || {
    enabled: false,
    active: false,
    strength: 0,
    x: 0.5,
    y: 0.5,
    hasInput: false
};
window.cloneDanceEffectsState = effectsState;

// Settings
let isMirrorEnabled = null;
let effectsEnabled = null;
let debugEnabled = null;
let calibrationTime = 0;

// Normalization factors (from calibration)
let scaleFactorX = 1;
let scaleFactorY = 1;
let offsetX = 0;
let offsetY = 0;

// Calibration
let calibrationFrames = 0;


// Smoothing histories
let positionSmoothHistory = {};
let angleSmoothHistory = {};

let GameConfig = null;
let gameConfigPromise = null;

function getGameConfig() {
    if (GameConfig) {
        return Promise.resolve(GameConfig);
    }
    if (gameConfigPromise) {
        return gameConfigPromise;
    }
    if (!window.loadAppConfig) {
        return Promise.reject(new Error('loadAppConfig not found. Ensure config_loader.js is loaded first.'));
    }

    gameConfigPromise = window.loadAppConfig()
        .then((config) => {
            GameConfig = { ...config.common, ...config.game };
            return GameConfig;
        });

    return gameConfigPromise;
}

getGameConfig()
    .then((config) => {
        if (isMirrorEnabled === null) {
            isMirrorEnabled = config.MIRROR_INPUT_DEFAULT;
        }
        if (effectsEnabled === null) {
            effectsEnabled = config.EFFECTS_ENABLED_DEFAULT;
        }

        const mirrorToggle = document.getElementById('mirrorToggle');
        if (mirrorToggle) {
            mirrorToggle.classList.toggle('active', !!isMirrorEnabled);
        }

        const effectsToggle = document.getElementById('enable-effectsToggle');
        if (effectsToggle) {
            effectsToggle.classList.toggle('active', !!effectsEnabled);
        }

        const debugToggle = document.getElementById('debugToggle');
        if (debugToggle) {
            debugToggle.classList.toggle('active', !!debugEnabled);
        }

        syncEffectsState();
    })
    .catch((error) => {
        console.error('Failed to initialize game config:', error);
    });





// Event listeners
document.getElementById('startBtn').addEventListener('click', initGame);
document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
document.getElementById('resetBtn').addEventListener('click', resetGame);
document.getElementById('recalibrateBtn').addEventListener('click', startCalibration);
document.getElementById('skipCalibrationBtn').addEventListener('click', skipCalibration);
document.getElementById('retrySongBtn').addEventListener('click', retrySong);
document.getElementById('backToStartBtn').addEventListener('click', backToStart);

// Mirror toggle
document.getElementById('mirrorToggle').addEventListener('click', () => {
    const toggle = document.getElementById('mirrorToggle');
    isMirrorEnabled = !isMirrorEnabled;
    toggle.classList.toggle('active', isMirrorEnabled);
    console.log('Mirror enabled:', isMirrorEnabled);
});

// Effects toggle
document.getElementById('enable-effectsToggle').addEventListener('click', () => {
    const toggle = document.getElementById('enable-effectsToggle');
    effectsEnabled = !effectsEnabled;
    toggle.classList.toggle('active', effectsEnabled);
    console.log('Effects enabled:', effectsEnabled);
    syncEffectsState();
});

document.getElementById('debugToggle').addEventListener('click', () => {
    const toggle = document.getElementById('debugToggle');
    debugEnabled = !debugEnabled;
    toggle.classList.toggle('active', debugEnabled);
    console.log('Debug enabled:', debugEnabled);
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

function getGameEffectsLayer() {
    if (!gameEffectsLayerEl) {
        gameEffectsLayerEl = document.getElementById('effectsLayer');
    }
    return gameEffectsLayerEl;
}

function setEffectsLayerActive(isActive) {
    const layer = getGameEffectsLayer();
    if (!layer) return;
    layer.classList.toggle('active', isActive);
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function setGameControlsDisabled(disabled) {
    for (const id of ['playPauseBtn', 'resetBtn', 'recalibrateBtn']) {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = disabled;
        }
    }
}

function showCountdownValue(value) {
    const overlay = document.getElementById('countdownOverlay');
    const valueEl = document.getElementById('countdownValue');
    if (!overlay || !valueEl) return;
    valueEl.textContent = value;
    overlay.classList.remove('hidden');
}

function hideCountdownOverlay() {
    const overlay = document.getElementById('countdownOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
}

function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function hideStatsScreen() {
    const statsScreen = document.getElementById('statsScreen');
    if (!statsScreen) return;
    statsScreen.classList.add('hidden');
}

function showStatsScreen() {
    const avgAccuracy = statsTrackedTimeSec > 0
        ? clamp01(statsAverageAccuracyAccum / statsTrackedTimeSec)
        : clamp01(currentAccuracy);
    const dancedSeconds = statsTrackedTimeSec > 0
        ? statsTrackedTimeSec
        : (Number.isFinite(videoElement?.duration) ? videoElement.duration : 0);

    const finalScoreEl = document.getElementById('finalScore');
    const finalAccuracyEl = document.getElementById('finalAccuracy');
    const finalComboEl = document.getElementById('finalCombo');
    const finalDurationEl = document.getElementById('finalDuration');
    const statsScreen = document.getElementById('statsScreen');

    if (finalScoreEl) finalScoreEl.textContent = String(Math.floor(score));
    if (finalAccuracyEl) finalAccuracyEl.textContent = (avgAccuracy * 100).toFixed(0) + '%';
    if (finalComboEl) finalComboEl.textContent = String(statsMaxCombo);
    if (finalDurationEl) finalDurationEl.textContent = dancedSeconds.toFixed(1) + 's';
    if (statsScreen) statsScreen.classList.remove('hidden');
}

function handleSongEnded() {
    if (!videoElement || isCountdownActive || !isCalibrated) return;

    isPlaying = false;
    lastScoreTimeSec = null;
    resetNoPoseState();

    if (window.playerVideoElement) {
        window.playerVideoElement.pause();
    }

    document.getElementById('playPauseBtn').textContent = 'Play';
    syncEffectsState();
    showStatsScreen();
}

function startSongPlaybackFromBeginning() {
    if (!videoElement) return;

    isPlaying = true;
    lastScoreTimeSec = getGameTimeSec();
    goodTimeAccumSec = 0;
    goodStreakSec = 0;
    combo = 0;
    resetNoPoseState();
    updateComboIndicator();

    videoElement.currentTime = 0;
    videoElement.muted = false;
    videoElement.volume = 1.0;

    const playPromise = videoElement.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            document.getElementById('playPauseBtn').textContent = 'Pause';
        }).catch((error) => {
            console.warn("Autoplay prevented:", error);
            showAudioFallback();
        });
    }

    if (window.playerVideoElement) {
        window.playerVideoElement.currentTime = 0;
        window.playerVideoElement.play();
    }

    syncEffectsState();
}

async function startSongWithCountdown() {
    if (!isCalibrated || !videoElement || isCountdownActive) return;

    hideStatsScreen();
    resetGame();
    isCountdownActive = true;
    setGameControlsDisabled(true);

    try {
        const countdownValues = ['3', '2', '1'];
        for (const value of countdownValues) {
            if (!isCountdownActive) return;
            showCountdownValue(value);
            await waitMs(900);
        }

        if (!isCountdownActive) return;
        startSongPlaybackFromBeginning();
    } finally {
        hideCountdownOverlay();
        setGameControlsDisabled(false);
        isCountdownActive = false;
    }
}

function updateEffectsInputFromPose(landmarks) {
    if (!effectsState) return;
    if (!landmarks || !landmarks.length) {
        effectsState.hasInput = false;
        return;
    }

    const pickVisible = (indices) => indices
        .map((idx) => landmarks[idx])
        .filter((lm) => lm && lm.visibility > 0.5);

    let points = pickVisible([15, 16]); // wrists
    if (points.length === 0) points = pickVisible([13, 14]); // elbows
    if (points.length === 0) points = pickVisible([11, 12]); // shoulders
    if (points.length === 0) points = pickVisible([23, 24]); // hips
    if (points.length === 0) points = pickVisible([0]); // nose

    if (points.length === 0) {
        effectsState.hasInput = false;
        return;
    }

    const sum = points.reduce((acc, lm) => {
        acc.x += lm.x;
        acc.y += lm.y;
        return acc;
    }, { x: 0, y: 0 });

    const x = clamp01(sum.x / points.length);
    const y = clamp01(sum.y / points.length);
    const smooth = 0.35;

    if (effectsState.hasInput) {
        effectsState.x = effectsState.x * (1 - smooth) + x * smooth;
        effectsState.y = effectsState.y * (1 - smooth) + y * smooth;
    } else {
        effectsState.x = x;
        effectsState.y = y;
    }

    effectsState.hasInput = true;
}

function updateEffectsInputFromAngleResult(angleResult, landmarks) {
    if (!effectsState || !angleResult || !landmarks || !landmarks.length) return false;
    if (!GameConfig || !GameConfig.ANGLE_JOINTS) return false;

    const similarities = angleResult.similarities || {};
    const matches = angleResult.matches || {};
    let bestMatched = null;
    let bestMatchedScore = -1;
    let bestAny = null;
    let bestAnyScore = -1;

    for (const [name, score] of Object.entries(similarities)) {
        if (!Number.isFinite(score)) continue;
        if (matches[name] === true && score > bestMatchedScore) {
            bestMatchedScore = score;
            bestMatched = name;
        }
        if (score > bestAnyScore) {
            bestAnyScore = score;
            bestAny = name;
        }
    }

    const bestAngle = bestMatched || bestAny;
    const bestScore = bestMatched ? bestMatchedScore : bestAnyScore;
    if (!bestAngle || bestScore <= 0) return false;

    const joint = GameConfig.ANGLE_JOINTS[bestAngle];
    if (!joint || joint.length < 2) return false;

    const [p1, vertexIdx, p2] = joint;
    let targetIdx = null;
    let targetLm = null;

    const candidates = [p2, p1, vertexIdx];
    const torsoCenter = (landmarks[11] && landmarks[12] && landmarks[23] && landmarks[24])
        ? getTorsoCenter(landmarks)
        : null;

    if (torsoCenter) {
        let bestDist = -1;
        for (const idx of candidates) {
            const lm = landmarks[idx];
            if (!lm || lm.visibility < 0.5) continue;
            const dx = lm.x - torsoCenter.x;
            const dy = lm.y - torsoCenter.y;
            const dist = dx * dx + dy * dy;
            if (dist > bestDist) {
                bestDist = dist;
                targetIdx = idx;
                targetLm = lm;
            }
        }
    }

    if (!targetLm) {
        for (const idx of candidates) {
            const lm = landmarks[idx];
            if (!lm || lm.visibility < 0.5) continue;
            targetIdx = idx;
            targetLm = lm;
            break;
        }
    }

    if (!targetLm) return false;

    const x = clamp01(targetLm.x);
    const y = clamp01(targetLm.y);
    const smooth = 0.45;

    if (effectsState.hasInput) {
        effectsState.x = effectsState.x * (1 - smooth) + x * smooth;
        effectsState.y = effectsState.y * (1 - smooth) + y * smooth;
    } else {
        effectsState.x = x;
        effectsState.y = y;
    }

    effectsState.hasInput = true;
    effectsState.bestAngle = bestAngle;
    effectsState.bestAngleScore = bestScore;
    effectsState.bestAngleLandmark = targetIdx;
    return true;
}

function syncEffectsState() {
    if (!effectsState) return;

    const accuracyThreshold = GameConfig?.SCORE_ACCURACY_THRESHOLD ?? 0.7;
    const maxCombo = GameConfig?.MAX_COMBO ?? 5;

    const active = !!effectsEnabled &&
        isPlaying &&
        isCalibrated &&
        currentAccuracy >= accuracyThreshold &&
        combo > 0;

    let strength = 0;
    if (active) {
        const accuracyBoost = clamp01(
            (currentAccuracy - accuracyThreshold) / Math.max(1e-6, 1 - accuracyThreshold)
        );
        const comboBoost = clamp01(maxCombo > 0 ? combo / maxCombo : 0);
        strength = Math.max(0.15, accuracyBoost * 0.7 + comboBoost * 0.3);
    }

    effectsState.enabled = !!effectsEnabled;
    effectsState.active = active;
    effectsState.strength = strength;

    // Keep the effects layer visible while enabled so particles can fade out.
    setEffectsLayerActive(!!effectsEnabled);
}

function resizeGameCanvas() {
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

 

    const availableHeight = window.innerHeight;
    const availableWidth = window.innerWidth; // padding lateral
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

    const fxLayer = getGameEffectsLayer();
    if (fxLayer) {
        fxLayer.style.width = renderWidth + 'px';
        fxLayer.style.height = renderHeight + 'px';
        fxLayer.style.left = ((containerWidth - renderWidth) / 2) + 'px';
        fxLayer.style.top = '0px';
    }

    if (window.cloneDanceResizeEffects) {
        window.cloneDanceResizeEffects(renderWidth, renderHeight);
    }
}

// Resize canvas when video metadata loads or window resizes
window.addEventListener('resize', () => {
    resizeGameCanvas();
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
        await getGameConfig();
        console.log("Loading JSON...");
        const jsonText = await jsonFile.text();
        referenceData = JSON.parse(jsonText);

        console.log("Setting up reference video...");
        videoElement = document.getElementById('referenceVideo');
        videoElement.src = URL.createObjectURL(videoFile);
        videoElement.loop = false;
        videoElement.onended = handleSongEnded;

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
            modelComplexity: GameConfig.MEDIAPIPE_MODEL_COMPLEXITY,
            smoothLandmarks: GameConfig.MEDIAPIPE_SMOOTH_LANDMARKS,
            minDetectionConfidence: GameConfig.MEDIAPIPE_MIN_DETECTION_CONFIDENCE,
            minTrackingConfidence: GameConfig.MEDIAPIPE_MIN_TRACKING_CONFIDENCE
        });

        pose.onResults(onPoseResults);

        canvas = document.getElementById('playerCanvas');

        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                resizeGameCanvas();

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
        hideStatsScreen();
        syncEffectsState();
        if (window.cloneDanceResizeEffects) {
            window.cloneDanceResizeEffects();
        }

        // Call resizeGameCanvas multiple times to ensure proper sizing
        setTimeout(() => {
            resizeGameCanvas();
        }, 100);

        setTimeout(() => {
            resizeGameCanvas();
        }, 300);

        setTimeout(() => {
            resizeGameCanvas();
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
    for (const [leftIdx, rightIdx] of GameConfig.KEYPOINTS_MIRROR_SWAP) {
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

    if (currentPlayerPose && currentPlayerPose.length > 0) {
        const referencePose = getCurrentReferencePose();

        // Only compare if both poses are valid
        if (referencePose && referencePose.landmarks && referencePose.landmarks.length > 0 && isPlaying) {
            const comparison = comparePoses(currentPlayerPose, referencePose);
            if(debugEnabled)
                drawSkeletonOnVideo(currentPlayerPose, comparison);
        } else {
            const neutralComparison = {
                position: { matches: {} },
                angles: { matches: {} }
            };
            if(debugEnabled)
                drawSkeletonOnVideo(currentPlayerPose, neutralComparison);
        }
    }
}

/**
 * Start calibration process
 */
function startCalibration() {
    isCountdownActive = false;
    hideCountdownOverlay();
    hideStatsScreen();
    setGameControlsDisabled(false);
    isCalibrated = false;
    isPlaying = false;
    calibrationFrames = 0;
    positionSmoothHistory = {};
    angleSmoothHistory = {};
    resetNoPoseState();

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
    document.getElementById('calibrationStatus').textContent = 'Loading pose... Don\'t skip yet';
    document.getElementById('calibrationProgress').style.width = '0%';
    syncEffectsState();
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
    resizeGameCanvas();
    syncEffectsState();

    // Auto-start game after calibration
    setTimeout(() => {
        startGameAfterCalibration();
    }, 100);
}

/**
 * Start game automatically after successful calibration
 */
function startGameAfterCalibration() {
    console.log("Starting song with countdown");
    startSongWithCountdown();
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
        videoElement.currentTime = 0;
        videoElement.play();
        if (window.playerVideoElement) {
            window.playerVideoElement.currentTime = 0;
            window.playerVideoElement.play();
        }
        lastScoreTimeSec = getGameTimeSec();
        isPlaying = true;
        document.getElementById('playPauseBtn').textContent = 'Pause';
        syncEffectsState();
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

    if (minDiff > GameConfig.POSE_TIME_TOLERANCE_SEC) return null;
    return closest;
}

/**
 * Calculate normalization factors from calibration
 */
function calculateNormalization(playerLandmarks, referenceLandmarks) {
    if (!GameConfig.NORMALIZE_BY_TORSO) {
        scaleFactorX = 1;
        scaleFactorY = 1;
        offsetX = 0;
        offsetY = 0;
        return;
    }

    const playerTorso = getTorsoSize(playerLandmarks);
    const refTorso = getTorsoSize(convertReferenceLandmarks(referenceLandmarks));

    // Usar el promedio de ambos factores para mantener proporciones
    const avgScale = (refTorso.width / playerTorso.width + refTorso.height / playerTorso.height) / 2;
    scaleFactorX = avgScale;
    scaleFactorY = avgScale;

    const playerCenter = getTorsoCenter(playerLandmarks);
    const refCenter = getTorsoCenter(convertReferenceLandmarks(referenceLandmarks));

    // CORREGIDO: el offset es simplemente la diferencia entre centros
    //offsetX = refCenter.x - playerCenter.x;
    //offsetY = refCenter.y - playerCenter.y;
    offsetX = refCenter.x - (playerCenter.x * scaleFactorX);
    offsetY = refCenter.y - (playerCenter.y * scaleFactorY);

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

    const width = Math.max(Math.abs(rightShoulder.x - leftShoulder.x), GameConfig.MIN_TORSO_SIZE);
    const height = Math.max(
        Math.abs((leftHip.y + rightHip.y) / 2 - (leftShoulder.y + rightShoulder.y) / 2),
        GameConfig.MIN_TORSO_SIZE
    );

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
        //x: (lm.x + offsetX) * scaleFactorX,
        x: lm.x * scaleFactorX + offsetX,
        //y: (lm.y + offsetY) * scaleFactorY,
        y: lm.y * scaleFactorY + offsetY,
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
 * Compare poses with positions and angles
 */
function comparePoses(playerLandmarks, referencePose) {
    const normalizedPlayer = normalizePose(playerLandmarks);
    const refLandmarks = convertReferenceLandmarks(referencePose.landmarks);
    const playerAngles = calculateAngles(normalizedPlayer);
    const refAngles = referencePose.angles || {};
    const playerDetectedAngles = countDetectedAngles(playerAngles);
    const referenceDetectedAngles = countDetectedAngles(refAngles);

    // Compare positions

    let positionResult;
    if (GameConfig.POSITION_WEIGHT > 0.0 || debugEnabled) {
        positionResult = comparePositions(normalizedPlayer, refLandmarks);
    }
    else {        
        positionResult = { score: 0, accuracy: 0, matches: {} };
    }
    

    // Calculate and compare angles
    let angleResult;
    if (GameConfig.ANGLE_WEIGHT > 0.0) {
        angleResult = compareAngles(playerAngles, refAngles);
    } else {
        angleResult = { score: 0, accuracy: 0, matches: {} };
    }


    // Weighted overall accuracy (normalized by weights)
    const weightSum = GameConfig.POSITION_WEIGHT + GameConfig.ANGLE_WEIGHT;
    let overall_score = 0;
    if (weightSum > 0) {
        overall_score = (
            GameConfig.POSITION_WEIGHT * positionResult.accuracy +
            GameConfig.ANGLE_WEIGHT * angleResult.accuracy
        ) / weightSum;
    } else {
        overall_score = angleResult.accuracy || 0;
    }

    // Update game score if playing
    if (isPlaying) {
        const nowTimeSec = getGameTimeSec();
        const scoreControl = updateNoPoseState(referenceDetectedAngles, playerDetectedAngles, nowTimeSec);
        updateScore(angleResult.accuracy, nowTimeSec, { freezeScoring: scoreControl.freezeScoring });
    }

    if (debugEnabled)
        updateAngleDebugOverlay(angleResult);

    if (angleResult) {
        const usedAngle = updateEffectsInputFromAngleResult(angleResult, refLandmarks);
        if (!usedAngle) {
            updateEffectsInputFromPose(refLandmarks);
        }

    }

    return {
        overall_score: overall_score,
        position: positionResult,
        angles: angleResult
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

function countDetectedAngles(angles) {
    if (!angles) return 0;

    let detected = 0;
    for (const angleName of Object.keys(GameConfig.ANGLE_JOINTS || {})) {
        if (Number.isFinite(angles[angleName])) {
            detected++;
        }
    }

    return detected;
}

function resetNoPoseState() {
    referenceLowAnglesSinceSec = null;
    playerLowAnglesSinceSec = null;
    noPoseWarningMessage = '';
}

function updateNoPoseState(referenceDetectedAngles, playerDetectedAngles, nowTimeSec) {
    const minReferenceAngles = GameConfig.MIN_REFERENCE_DETECTED_ANGLES_FOR_SCORING ?? 1;
    const minPlayerAngles = GameConfig.MIN_PLAYER_DETECTED_ANGLES_FOR_SCORING ?? 1;
    const referenceWarningDelaySec = GameConfig.REFERENCE_NO_POSE_WARNING_DELAY_SEC ?? 2;
    const playerWarningDelaySec = GameConfig.PLAYER_NO_POSE_WARNING_DELAY_SEC ?? 2;

    const referenceInsufficient = referenceDetectedAngles < minReferenceAngles;
    const playerInsufficient = playerDetectedAngles < minPlayerAngles;

    if (referenceInsufficient) {
        if (referenceLowAnglesSinceSec === null && Number.isFinite(nowTimeSec)) {
            referenceLowAnglesSinceSec = nowTimeSec;
        }
    } else {
        referenceLowAnglesSinceSec = null;
    }

    if (playerInsufficient) {
        if (playerLowAnglesSinceSec === null && Number.isFinite(nowTimeSec)) {
            playerLowAnglesSinceSec = nowTimeSec;
        }
    } else {
        playerLowAnglesSinceSec = null;
    }

    const warnings = [];
    if (
        referenceInsufficient &&
        referenceLowAnglesSinceSec !== null &&
        Number.isFinite(nowTimeSec) &&
        nowTimeSec - referenceLowAnglesSinceSec >= referenceWarningDelaySec
    ) {
        warnings.push('TOO FEW POSES IN REFERENCE VIDEO)');
    }
    if (
        playerInsufficient &&
        playerLowAnglesSinceSec !== null &&
        Number.isFinite(nowTimeSec) &&
        nowTimeSec - playerLowAnglesSinceSec >= playerWarningDelaySec
    ) {
        warnings.push('TOO FEW POSES IN YOUR VIDEO');
    }

    noPoseWarningMessage = warnings.join(' | ');

    return {
        referenceInsufficient,
        playerInsufficient,
        freezeScoring: referenceInsufficient || playerInsufficient
    };
}

/**
 * Compute angle between three points
 */
function computeAngle(p1, vertex, p2) {
    const v1 = {
        x: p1.x - vertex.x,
        y: p1.y - vertex.y
    };
    const v2 = {
        x: p2.x - vertex.x,
        y: p2.y - vertex.y
    };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    const cosAngle = dot / (mag1 * mag2 + 1e-8);
    const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    return angleRad * (180 / Math.PI);
}

/**
 * Compare angles
 */
function compareAngles(playerAngles, refAngles) {
    const matches = {};
    const similarities = {};
    const diffs = {};
    let count = 0;
    let matchedCount = 0;

    const similarityThreshold = GameConfig.ANGLE_MATCH_SIMILARITY ?? 0.9;
    const similarityRange = GameConfig.ANGLE_SIMILARITY_RANGE ?? 180;
    const allowedMisses = GameConfig.ANGLE_ALLOWED_MISSES ?? 2;

    for (const [angleName, refAngle] of Object.entries(refAngles)) {
        if (refAngle === null || refAngle === undefined) {
            continue;
        }

        const playerAngle = playerAngles[angleName];

        if (playerAngle === null || playerAngle === undefined) {
            matches[angleName] = false;
            similarities[angleName] = 0;
            diffs[angleName] = null;
            count++;
            continue;
        }

        let smoothedPlayerAngle = playerAngle;
        if (angleSmoothHistory[angleName] !== undefined) {
            smoothedPlayerAngle = GameConfig.ANGLE_SMOOTHING * playerAngle +
                (1 - GameConfig.ANGLE_SMOOTHING) * angleSmoothHistory[angleName];
        }
        angleSmoothHistory[angleName] = smoothedPlayerAngle;

        const angleDiff = Math.abs(smoothedPlayerAngle - refAngle);
        const similarity = Math.max(0, 1 - (angleDiff / similarityRange));
        const isMatch = similarity >= similarityThreshold;

        matches[angleName] = isMatch;
        similarities[angleName] = similarity;
        diffs[angleName] = angleDiff;

        if (isMatch) matchedCount++;
        count++;
    }

    if (count === 0) {
        return {
            score: 0,
            accuracy: 0,
            matches: {},
            similarities: {},
            diffs: {},
            matchedCount: 0,
            totalAngles: 0,
            allowedMisses
        };
    }

    const effectiveTotal = Math.max(1, count - allowedMisses);
    let accuracy = matchedCount / effectiveTotal;
    accuracy = Math.max(0, Math.min(1, accuracy));

    return {
        score: accuracy,
        accuracy,
        matches,
        similarities,
        diffs,
        matchedCount,
        totalAngles: count,
        allowedMisses
    };
}

function getGameTimeSec() {
    if (videoElement && Number.isFinite(videoElement.currentTime)) {
        return videoElement.currentTime;
    }
    return performance.now() / 1000;
}

function ensureAngleDebugOverlay() {
    if (angleDebugEl) return angleDebugEl;

    const container = document.querySelector('.video-container') || document.body;
    angleDebugEl = document.createElement('div');
    angleDebugEl.id = 'angleDebugOverlay';
    angleDebugEl.style.position = 'absolute';
    angleDebugEl.style.top = '20px';
    angleDebugEl.style.left = '20px';
    angleDebugEl.style.zIndex = '15';
    angleDebugEl.style.pointerEvents = 'none';
    angleDebugEl.style.background = 'rgba(0, 0, 0, 0.6)';
    angleDebugEl.style.padding = '12px 16px';
    angleDebugEl.style.border = '2px solid #00d4ff';
    angleDebugEl.style.borderRadius = '8px';
    angleDebugEl.style.color = '#ffffff';
    angleDebugEl.style.fontFamily = 'Orbitron, sans-serif';
    angleDebugEl.style.textShadow = '0 0 12px rgba(0, 212, 255, 0.6)';
    angleDebugEl.style.maxWidth = '70%';

    container.appendChild(angleDebugEl);
    return angleDebugEl;
}

function updateAngleDebugOverlay(angleResult) {

    if (!debugEnabled) {
        if (angleDebugEl) angleDebugEl.style.display = 'none';
        return;
    }

    if (!angleResult) {
        return;
    }

    const updateIntervalMs = GameConfig.ANGLE_DEBUG_UPDATE_INTERVAL_MS ?? 200;
    const nowMs = performance.now();
    if (nowMs - lastAngleDebugUpdateMs < updateIntervalMs) {
        return;
    }
    lastAngleDebugUpdateMs = nowMs;

    const overlay = ensureAngleDebugOverlay();
    overlay.style.display = 'block';

    const fontSizePx = GameConfig.ANGLE_DEBUG_FONT_SIZE_PX ?? 28;
    overlay.style.fontSize = fontSizePx + 'px';

    const matchNames = [];
    const missNames = [];
    const matches = angleResult && angleResult.matches ? angleResult.matches : {};

    for (const [name, isMatch] of Object.entries(matches)) {
        const similarity = angleResult.similarities && angleResult.similarities[name] !== undefined
            ? Math.round(angleResult.similarities[name] * 100)
            : null;
        const label = similarity === null ? name : `${name} ${similarity}%`;

        if (isMatch === true) {
            matchNames.push(label);
        } else {
            missNames.push(label);
        }
    }

    const accuracyPct = Math.round((angleResult.accuracy || 0) * 100);
    const matchText = matchNames.length ? matchNames.join(', ') : '-';
    const missText = missNames.length ? missNames.join(', ') : '-';

    overlay.innerHTML = `
        <div style="font-size: ${Math.round(fontSizePx * 1.1)}px; color: #00ff88; margin-bottom: 6px;">
            Accuracy ${accuracyPct}%
        </div>
        <div style="color: #00ff88;">MATCH: ${matchText}</div>
        <div style="color: #ff0080;">MISS: ${missText}</div>
    `;
}

function updateComboIndicator() {
    const indicator = document.getElementById('comboIndicator');
    const comboVal = document.getElementById('comboValue');
    if (!indicator || !comboVal) return;
    comboVal.textContent = combo;
    indicator.classList.toggle('active', combo > 0);
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
function updateScore(angleAccuracy, nowTimeSec, options = {}) {
    const accuracyThreshold = GameConfig.SCORE_ACCURACY_THRESHOLD ?? 0.7;
    const pointsPerSecond = GameConfig.SCORE_POINTS_PER_SECOND ?? 100;
    const comboSeconds = GameConfig.COMBO_SECONDS ?? 2;
    const maxCombo = GameConfig.MAX_COMBO ?? 5;
    const freezeScoring = options.freezeScoring === true;

    if (freezeScoring) {
        if (Number.isFinite(nowTimeSec)) {
            lastScoreTimeSec = nowTimeSec;
        }
        updateUI();
        syncEffectsState();
        return;
    }

    currentAccuracy = Number.isFinite(angleAccuracy) ? angleAccuracy : 0;

    if (!Number.isFinite(nowTimeSec)) {
        updateUI();
        return;
    }

    if (lastScoreTimeSec === null || nowTimeSec < lastScoreTimeSec) {
        lastScoreTimeSec = nowTimeSec;
        updateUI();
        return;
    }

    let delta = nowTimeSec - lastScoreTimeSec;
    lastScoreTimeSec = nowTimeSec;

    if (delta <= 0) {
        updateUI();
        return;
    }
    
    statsAverageAccuracyAccum += currentAccuracy * delta;
    statsTrackedTimeSec += delta;

    if (currentAccuracy >= accuracyThreshold) {
        goodTimeAccumSec += delta;
        goodStreakSec += delta;

        while (goodTimeAccumSec >= 1) {
            score += pointsPerSecond;
            goodTimeAccumSec -= 1;
        }

        const newCombo = Math.min(maxCombo, Math.floor(goodStreakSec / comboSeconds));
        if (newCombo !== combo) {
            combo = newCombo;
            updateComboIndicator();
        } else if (combo > 0) {
            updateComboIndicator();
        }
        statsMaxCombo = Math.max(statsMaxCombo, combo);
    } else {
        goodTimeAccumSec = 0;
        goodStreakSec = 0;
        combo = 0;
        updateComboIndicator();
    }

    updateUI();
    syncEffectsState();
}

/**
 * Update UI elements
 */
function updateUI() {
    document.getElementById('score').textContent = Math.floor(score);
    document.getElementById('combo').textContent = combo;

    const accuracy = Math.max(0, Math.min(1, currentAccuracy)) * 100;
    document.getElementById('accuracy').textContent = accuracy.toFixed(0) + '%';
    const accuracyWarningEl = document.getElementById('accuracyWarning');
    if (accuracyWarningEl) {
        accuracyWarningEl.textContent = noPoseWarningMessage;
    }

    
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
    if (isCountdownActive) {
        return;
    }

    isPlaying = !isPlaying;
    const btn = document.getElementById('playPauseBtn');

    if (isPlaying) {
        const duration = videoElement.duration;
        if (
            videoElement.ended ||
            (Number.isFinite(duration) && duration > 0 && videoElement.currentTime >= duration)
        ) {
            isPlaying = false;
            startGameAfterCalibration();
            return;
        }

        hideStatsScreen();
        resetNoPoseState();
        videoElement.muted = false;
        videoElement.volume = 1.0;
        videoElement.play();
        lastScoreTimeSec = getGameTimeSec();

        if (window.playerVideoElement) {
            window.playerVideoElement.play();
        }

        btn.textContent = 'Pause';
    } else {
        videoElement.pause();
        lastScoreTimeSec = null;
        resetNoPoseState();

        if (window.playerVideoElement) {
            window.playerVideoElement.pause();
        }

        btn.textContent = 'Play';
        updateUI();
    }

    syncEffectsState();
}

/**
 * Reset game
 */
function resetGame() {
    isCountdownActive = false;
    hideCountdownOverlay();
    hideStatsScreen();
    setGameControlsDisabled(false);
    score = 0;
    combo = 0;
    totalFrames = 0;
    matchedFrames = 0;
    currentAccuracy = 0;
    lastScoreTimeSec = null;
    goodTimeAccumSec = 0;
    goodStreakSec = 0;
    positionSmoothHistory = {};
    angleSmoothHistory = {};
    statsMaxCombo = 0;
    statsAverageAccuracyAccum = 0;
    statsTrackedTimeSec = 0;
    resetNoPoseState();

    if (videoElement) {
        videoElement.pause();
        videoElement.currentTime = 0;
    }
    isPlaying = false;

    if (window.playerVideoElement) {
        window.playerVideoElement.currentTime = 0;
        window.playerVideoElement.pause();
    }

    document.getElementById('playPauseBtn').textContent = 'Play';
    updateComboIndicator();
    if (angleDebugEl) {
        angleDebugEl.textContent = '';
    }
    updateUI();
    syncEffectsState();
}

function retrySong() {
    if (!isCalibrated) return;
    hideStatsScreen();
    startGameAfterCalibration();
}

function backToStart() {
    window.location.reload();
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

/**
 * Quick pose comparison for finding best match 
 */
function comparePosesQuick(playerLandmarks, referencePose) {
    // Early validation
    if (!playerLandmarks || !referencePose || !referencePose.landmarks) {
        return { overall_score: 0 };
    }

    const normalizedPlayer = normalizePose(playerLandmarks);
    const refLandmarks = convertReferenceLandmarks(referencePose.landmarks);

    // Quick position score
    let posScore = 0;
    let posCount = 0;
    const activeLandmarks = GameConfig.ACTIVE_LANDMARKS;
    const posThreshold = GameConfig.POSITION_THRESHOLD;
    const posThresholdSq = posThreshold * posThreshold; 

    for (let i = 0; i < activeLandmarks.length; i++) {
        const idx = activeLandmarks[i];
        const player = normalizedPlayer[idx];
        const ref = refLandmarks[idx];

        if (!player || !ref || player.visibility < 0.5 || ref.visibility < 0.5) continue;

        const dx = player.x - ref.x;
        const dy = player.y - ref.y;
        const distSq = dx * dx + dy * dy; 

        if (distSq < posThresholdSq) {
            posScore += 1;
        }
        posCount++;
    }

    if (posCount === 0) return { overall_score: 0 };

    const positionScore = posScore / posCount;

    // If no angle weight, return
    if (GameConfig.ANGLE_WEIGHT === 0) {
        return { overall_score: positionScore };
    }

    // Quick angle score
    let angleScore = 0;
    let angleCount = 0;
    const angleJointNames = Object.keys(GameConfig.ANGLE_JOINTS);
    const angleThreshold = GameConfig.ANGLE_THRESHOLD;

    const playerAngles = calculateAngles(normalizedPlayer);
    const refAngles = referencePose.angles || {};

    for (let i = 0; i < angleJointNames.length; i++) {
        const angleName = angleJointNames[i];
        const playerAngle = playerAngles[angleName];
        const refAngle = refAngles[angleName];

        if (playerAngle != null && refAngle != null) {
            const diff = Math.abs(playerAngle - refAngle);
            if (diff < angleThreshold) {
                angleScore += 1;
            }
            angleCount++;
        }
    }

    const angleScoreNorm = angleCount > 0 ? angleScore / angleCount : 0;

    // Weighted overall score
    const overall_score = (
        GameConfig.POSITION_WEIGHT * positionScore +
        GameConfig.ANGLE_WEIGHT * angleScoreNorm
    ) / (GameConfig.POSITION_WEIGHT + GameConfig.ANGLE_WEIGHT);

    return { overall_score };
}

function getCurrentReferencePose() {
    if (!referenceData || !videoElement) return null;

    // Early exit
    if (!currentPlayerPose || !currentPlayerPose.length) {
        const currentTime = videoElement.currentTime;
        return getReferencePoseAtTime(currentTime);
    }

    const currentTime = videoElement.currentTime;

    // Get poses within time window
    const windowSize = GameConfig.POSE_TIME_WINDOW || 0.3;
    const candidatePoses = getReferencePosesInWindow(currentTime, windowSize);

    if (candidatePoses.length === 0) {
        return getReferencePoseAtTime(currentTime);
    }

    if (candidatePoses.length === 1) {
        return candidatePoses[0];
    }

    // Find best matching pose in window
    let bestPose = null;
    let bestScore = -1;
    const earlyExitThreshold = 0.95; 

    for (const refPose of candidatePoses) {
        // Skip if no landmarks on reference pose
        if (!refPose.landmarks || refPose.landmarks.length === 0) continue;

        const comparison = comparePosesQuick(currentPlayerPose, refPose);

        if (comparison.overall_score > bestScore) {
            bestScore = comparison.overall_score;
            bestPose = refPose;

            // Early exit
            if (bestScore >= earlyExitThreshold) {
                break;
            }
        }
    }

    return bestPose || candidatePoses[0];
}


/**
 * Get reference poses within time window using binary search 
 */
let lastSearchIndex = 0; // Cache 

function getReferencePosesInWindow(time, windowSize) {
    if (!referenceData) return [];

    const poses = referenceData.poses;
    if (!poses || poses.length === 0) return [];

    const windowStart = time - windowSize;
    const windowEnd = time + windowSize;

    // Binary search to find first pose in the window
    let left = 0;
    let right = poses.length - 1;
    let startIdx = poses.length;

    // Optimization: start from last position if close in time
    if (lastSearchIndex > 0 && lastSearchIndex < poses.length) {
        const lastTime = poses[lastSearchIndex].timestamp;
        if (Math.abs(lastTime - time) < windowSize * 2) {
            left = Math.max(0, lastSearchIndex - 10);
            right = Math.min(poses.length - 1, lastSearchIndex + 10);
        }
    }

    // Find first pose >= windowStart
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (poses[mid].timestamp >= windowStart) {
            startIdx = mid;
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }

    // Collect poses in window
    const posesInWindow = [];
    for (let i = startIdx; i < poses.length; i++) {
        const pose = poses[i];
        if (pose.timestamp > windowEnd) break;
        posesInWindow.push(pose);
    }

    // Update cache
    if (posesInWindow.length > 0) {
        lastSearchIndex = startIdx;
    }

    return posesInWindow;
}

