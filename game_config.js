/**
 * Clone Dance - JavaScript Configuration
 * Mirrors the Python config.py settings for the web game
 */

const GameConfig = {
    // Landmark selection (MediaPipe indices 0-32)
    ACTIVE_LANDMARKS: [
        0,  // Head (nose)
        11, 12, 13, 14, 15, 16,  // Arms (shoulders, elbows, wrists)
        23, 24, 25, 26, 27, 28, 29, 30, 31, 32  // Legs and feet
    ],
    
    // Angle joints for tracking
    // Format: [point1, vertex, point2]
    ANGLE_JOINTS: {
        'left_shoulder': [13, 11, 23],
        'right_shoulder': [14, 12, 24],
        'left_elbow': [11, 13, 15],
        'right_elbow': [12, 14, 16],
        'left_knee': [23, 25, 27],
        'right_knee': [24, 26, 28]
    },
    
    // Acceleration tracking points
    ACCELERATION_POINTS: {
        'left_hand': 15,
        'right_hand': 16,
        'left_foot': 27,
        'right_foot': 28
    },
    
    // Acceleration history frames
    ACCELERATION_HISTORY_FRAMES: 3,
    
    // Temporal smoothing (EMA alpha)
    SMOOTHING_ALPHA: 0.3,
    POSITION_SMOOTHING: 0.3,
    ANGLE_SMOOTHING: 0.4,
    ACCELERATION_SMOOTHING: 0.2,
    
    // Scoring weights (must sum to 1.0)
    POSITION_WEIGHT: 0.5,
    ANGLE_WEIGHT: 0.3,
    ACCELERATION_WEIGHT: 0.2,
    
    // Matching thresholds
    POSITION_THRESHOLD: 0.15,
    ANGLE_THRESHOLD: 20.0,  // degrees
    ACCELERATION_THRESHOLD: 0.5,
    
    // Mirror mode
    MIRROR_REFERENCE: true,
    
    // Scoring parameters
    COMBO_THRESHOLD: 0.6,
    COMBO_MULTIPLIER: 0.1,
    BASE_POINTS: 10,
    
    // Calibration
    CALIBRATION_DURATION: 3.0,
    MIN_CALIBRATION_QUALITY: 0.7,
    CALIBRATION_FRAMES: 90,  // 3 seconds at 30fps
    
    // Visualization
    SKELETON_COLOR: '#00ff88',
    LINE_THICKNESS: 3,
    SKELETON_OPACITY: 1.0,
    
    // Normalization
    NORMALIZE_BY_TORSO: true,
    MIN_TORSO_SIZE: 0.01,
    
    // Pose connections for drawing skeleton
    POSE_CONNECTIONS: [
        [11, 12],  // Shoulders
        [11, 13], [13, 15],  // Left arm
        [12, 14], [14, 16],  // Right arm
        [11, 23], [12, 24],  // Torso
        [23, 24],  // Hips
        [23, 25], [25, 27],  // Left leg
        [24, 26], [26, 28],  // Right leg
        [27, 29], [27, 31],  // Left foot
        [28, 30], [28, 32]   // Right foot
    ],
    
    // Key joints for scoring (active landmarks)
    SCORING_JOINTS: [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
};

// Make config globally available
window.GameConfig = GameConfig;