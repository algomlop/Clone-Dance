"""
Clone Dance - Configuration File
Central configuration for all tunable parameters
"""

import json
from pathlib import Path
from typing import Dict, Any


class Config:
    """
    Centralized configuration for the dance game.
    All parameters are tunable for testing and development.
    """
    
    # ===== MEDIAPIPE MODEL =====
    MODEL_COMPLEXITY = 'heavy'  # 'lite', 'full', or 'heavy'
    MODEL_PATH = None  # None = auto-download, or specify path
    MIN_DETECTION_CONFIDENCE = 0.8
    MIN_TRACKING_CONFIDENCE = 0.8
    MIN_PRESENCE_CONFIDENCE = 0.8
    
    # ===== VIDEO PROCESSING =====
    SKIP_FRAMES = 0  # Process every Nth frame (0 = process all)
    TARGET_FPS = None  # None = no limit, or specify FPS for processing
    
    # ===== LANDMARK SELECTION =====
    # Only use selected body parts for scoring
    # MediaPipe indices: 0-32 (33 total landmarks)
    
    # Head landmarks
    HEAD_LANDMARKS = [0]  # Nose
    
    # Arm landmarks (shoulders to wrists)
    ARM_LANDMARKS = [
        11, 12,  # Shoulders
        13, 14,  # Elbows
        15, 16   # Wrists
    ]
    
    # Leg landmarks (hips to feet)
    LEG_LANDMARKS = [
        23, 24,  # Hips
        25, 26,  # Knees
        27, 28,  # Ankles
        29, 30, 31, 32  # Feet (heel, foot_index for each foot)
    ]
    
    # Combined active landmarks for scoring
    ACTIVE_LANDMARKS = HEAD_LANDMARKS + ARM_LANDMARKS + LEG_LANDMARKS
    # Results in: [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
    
    # ===== ANGLE CALCULATION =====
    # Define joint angles to track
    # Format: (point1, vertex, point2) where vertex is the joint
    ANGLE_JOINTS = {
        'left_shoulder': (13, 11, 23),   # Elbow-Shoulder-Hip
        'right_shoulder': (14, 12, 24),
        'left_elbow': (11, 13, 15),      # Shoulder-Elbow-Wrist
        'right_elbow': (12, 14, 16),
        'left_knee': (23, 25, 27),       # Hip-Knee-Ankle
        'right_knee': (24, 26, 28),
    }
    
    # ===== ACCELERATION CALCULATION =====
    # Number of previous frames to store for velocity/acceleration calculation
    ACCELERATION_HISTORY_FRAMES = 3
    
    # Key points for acceleration tracking
    ACCELERATION_POINTS = {
        'left_hand': 15,   # Left wrist
        'right_hand': 16,  # Right wrist
        'left_foot': 27,   # Left ankle
        'right_foot': 28,  # Right ankle
    }
    
    # ===== TEMPORAL SMOOTHING =====
    # Exponential Moving Average (EMA) alpha for smoothing
    # 0.0 = heavy smoothing (slow), 1.0 = no smoothing (instant)
    SMOOTHING_ALPHA = 0.3
    
    # Smoothing applied to different metrics
    POSITION_SMOOTHING = 0.3
    ANGLE_SMOOTHING = 0.4
    ACCELERATION_SMOOTHING = 0.2
    
    # ===== SCORING WEIGHTS =====
    # How much each metric contributes to the final score (must sum to 1.0)
    POSITION_WEIGHT = 0.5      # Weight for position matching
    ANGLE_WEIGHT = 0.3         # Weight for angle matching
    ACCELERATION_WEIGHT = 0.2  # Weight for acceleration matching
    
    # ===== MATCHING THRESHOLDS =====
    # Position threshold (normalized coordinate distance)
    POSITION_THRESHOLD = 0.15
    
    # Angle threshold (degrees)
    ANGLE_THRESHOLD = 20.0
    
    # Acceleration threshold (normalized units)
    ACCELERATION_THRESHOLD = 0.5
    
    # ===== MIRROR MODE =====
    # Mirror the reference video to compensate for webcam mirror effect
    MIRROR_REFERENCE = True
    
    # ===== SCORING PARAMETERS =====
    # Minimum accuracy to maintain combo
    COMBO_THRESHOLD = 0.6
    
    # Combo multiplier (score increase per combo level)
    COMBO_MULTIPLIER = 0.1
    
    # Base points per matched frame
    BASE_POINTS = 10
    
    # ===== CALIBRATION =====
    # Calibration duration (seconds)
    CALIBRATION_DURATION = 3.0
    
    # Minimum calibration quality score (0-1)
    MIN_CALIBRATION_QUALITY = 0.7
    
    # ===== VISUALIZATION =====
    # Default skeleton color (hex)
    SKELETON_COLOR = '#00ff88'
    
    # Line thickness for skeleton drawing
    LINE_THICKNESS = 3
    
    # Skeleton opacity (0-1)
    SKELETON_OPACITY = 1.0
    
    # Show labels
    SHOW_LABELS = True
    
    # ===== VIDEO OUTPUT =====
    OUTPUT_DIR = 'choreographies'
    
    # ===== NORMALIZATION =====
    # Normalize poses relative to torso size
    NORMALIZE_BY_TORSO = True
    
    # Minimum torso size to prevent division errors
    MIN_TORSO_SIZE = 0.01
    
    
    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Convert config to dictionary"""
        config_dict = {}
        for key in dir(cls):
            # Skip private attributes, methods, and special attributes
            if key.startswith('_'):
                continue
            
            value = getattr(cls, key)
            
            # Skip callable items (methods, classmethods, etc.)
            if callable(value):
                continue
            
            # Skip modules and classes
            if isinstance(value, type):
                continue
                
            config_dict[key] = value
        
        return config_dict
    
    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]):
        """Update config from dictionary"""
        for key, value in config_dict.items():
            if hasattr(cls, key):
                setattr(cls, key, value)
    
    @classmethod
    def save(cls, filepath: str = 'config.json'):
        """Save configuration to JSON file"""
        with open(filepath, 'w') as f:
            json.dump(cls.to_dict(), f, indent=2)
    
    @classmethod
    def load(cls, filepath: str = 'config.json'):
        """Load configuration from JSON file"""
        if Path(filepath).exists():
            with open(filepath, 'r') as f:
                config_dict = json.load(f)
                cls.from_dict(config_dict)
        else:
            # Save default config if file doesn't exist
            cls.save(filepath)
    
    @classmethod
    def print_config(cls):
        """Print current configuration"""
        print("="*60)
        print("CLONE DANCE - CONFIGURATION")
        print("="*60)
        for key, value in sorted(cls.to_dict().items()):
            print(f"{key:30} = {value}")
        print("="*60)


if __name__ == "__main__":
    # Test config
    Config.print_config()
    Config.save('config.json')
    print("\nConfiguration saved to config.json")