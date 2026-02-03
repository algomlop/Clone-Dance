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

// Position history for acceleration calculation
let positionHistory = [];

// Smoothing histories
let positionSmoothHistory = {};
let angleSmoothHistory = {};
let accelerationSmoothHistory = {};

// Event listeners
document.getElementById('startBtn').addEventListener('click', initGame);
document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);
document.getElementById('resetBtn').addEventListener('click', resetGame);
document.getElementById('recalibrateBtn').addEventListener('click', startCalibration);
document.getElementById('skipCalibrationBtn').addEventListener('click', skipCalibration);

// Input mode toggle
document.getElementById('inputMode').addEventListener('change', (e) => {
    const playerVideoFile = document.getElementById('playerVideoFile');
    if (e.target.value === 'video') {
        playerVideoFile.style.display = 'block';
    } else {
        playerVideoFile.style.display = 'none';
    }
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

                
                resolve();
            };
        });

 

        ctx = canvas.getContext('2d');
        calibrationCanvas = document.getElementById('calibrationCanvas');
        calibrationCtx = calibrationCanvas.getContext('2d');

   

        //canvas.width = videoElement.videoWidth;
        //canvas.height = videoElement.videoHeight;
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
                    await pose.send({image: videoEl});
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
                    await pose.send({image: videoEl});
                }
                requestAnimationFrame(processFrame);
            };
            processFrame();
            
            console.log("Player video ready.");
        }

        document.getElementById('loading').classList.remove('active');
        document.getElementById('setupScreen').classList.add('hidden');
        document.getElementById('gameScreen').classList.remove('hidden');
        
        startCalibration();
        
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Error starting game: ' + error.message);
        document.getElementById('loading').classList.remove('active');
        document.getElementById('startBtn').disabled = false;
    }
}

/**
 * Handle pose detection results from MediaPipe
 */
function onPoseResults(results) {
    if (results.poseLandmarks) {
        currentPlayerPose = results.poseLandmarks;
        
        if (!isCalibrated) {
            handleCalibration(results.poseLandmarks);
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
    
    videoElement.currentTime = 0;
    videoElement.pause();
    
    document.getElementById('calibrationScreen').classList.add('active');
    document.getElementById('calibrationStatus').textContent = 'Detecting initial pose...';
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
}

/**
 * Handle calibration frame by frame
 */
function handleCalibration(playerLandmarks) {
    calibrationCtx.clearRect(0, 0, calibrationCanvas.width, calibrationCanvas.height);
    
    const referencePose = getFirstReferencePose();
    
    if (!referencePose) {
        document.getElementById('calibrationStatus').textContent = 'Error: No reference pose found';
        return;
    }
    
    // Draw reference skeleton (semi-transparent)
    drawCalibrationSkeleton(referencePose.landmarks, 'rgba(0, 212, 255, 0.5)');
    
    // Draw player skeleton
    drawCalibrationSkeleton(playerLandmarks, '#00ff88');
    
    // Calculate match
    const comparison = comparePoses(playerLandmarks, referencePose);
    const matchPercentage = (comparison.overall_score * 100).toFixed(0);
    
    //document.getElementById('matchPercentage').textContent = matchPercentage + '%';
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
        }
    } else {
        calibrationFrames = 0;
        document.getElementById('calibrationStatus').textContent = 'Insufficient match. Adjust your pose...';
    }
}

/**
 * Calculate normalization factors from calibration
 */
function calculateNormalization(playerLandmarks, referenceLandmarks) {
    const playerTorso = getTorsoSize(playerLandmarks);
    const refTorso = getTorsoSize(convertReferenceLandmarks(referenceLandmarks));
    
    scaleFactorX = refTorso.width / playerTorso.width;
    scaleFactorY = refTorso.height / playerTorso.height;
    
    const playerCenter = getTorsoCenter(playerLandmarks);
    const refCenter = getTorsoCenter(convertReferenceLandmarks(referenceLandmarks));
    
    offsetX = refCenter.x - (playerCenter.x * scaleFactorX);
    offsetY = refCenter.y - (playerCenter.y * scaleFactorY);
    
    console.log('Calibration:', { scaleFactorX, scaleFactorY, offsetX, offsetY });
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
        x: lm.x * scaleFactorX + offsetX,
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
    const poses = referenceData.poses;
    return poses && poses.length > 0 ? poses[0] : null;
}

/**
 * Get current reference pose based on video time
 */
function getCurrentReferencePose() {
    if (!referenceData || !videoElement) return null;
    
    const currentTime = videoElement.currentTime;
    const poses = referenceData.poses;
    
    if (!poses || poses.length === 0) return null;
    
    let closest = poses[0];
    let minDiff = Math.abs(currentTime - closest.timestamp);
    
    for (const pose of poses) {
        const diff = Math.abs(currentTime - pose.timestamp);
        if (diff < minDiff) {
            minDiff = diff;
            closest = pose;
        }
    }
    
    if (minDiff > 0.2) return null;
    return closest;
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
function drawCalibrationSkeleton(landmarks, color) {
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