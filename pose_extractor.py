"""
Pose extractor using MediaPipe Pose Landmarker.
Extracts poses with position and angles data.
"""

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import json
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from collections import deque
import logging

from config import Config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PoseExtractor:
    """
    Extracts poses from video with:
    - Position data (x, y, z, visibility)
    - Joint angles
    """
    
    def __init__(self, 
                 model_path: Optional[str] = None,
                 model_complexity: str = None):
        """
        Initialize pose extractor.
        
        Args:
            model_path: Path to .task model file
            model_complexity: 'lite', 'full', or 'heavy'
        """
        Config.ensure_loaded()
        self.model_complexity = model_complexity or Config.MODEL_COMPLEXITY
        
        if model_path is None:
            model_path = Config.MODEL_PATH or f'pose_landmarker_{self.model_complexity}.task'
        
        model_path = self._ensure_model_exists(model_path, self.model_complexity)
        
        base_options = python.BaseOptions(model_asset_path=model_path)
        
        self.options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=Config.MIN_DETECTION_CONFIDENCE,
            min_pose_presence_confidence=Config.MIN_PRESENCE_CONFIDENCE,
            min_tracking_confidence=Config.MIN_TRACKING_CONFIDENCE,
            output_segmentation_masks=False
        )
        
        self.detector = vision.PoseLandmarker.create_from_options(self.options)
        
        
        logger.info(f"PoseLandmarkerExtractor initialized with model: {self.model_complexity}")
    
    def _ensure_model_exists(self, model_path: str, complexity: str) -> str:
        """Check if model exists, provide download instructions if not"""
        if Path(model_path).exists():
            return model_path
        
        default_name = f'pose_landmarker_{complexity}.task'
        if Path(default_name).exists():
            return default_name
        
        logger.error(f"Model not found: {model_path}")
        logger.info(f"Download the model with:")
        
        urls = {
            'lite': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
            'full': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
            'heavy': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task'
        }
        
        logger.info(f"wget {urls[complexity]}")
        
        raise FileNotFoundError(
            f"Model not found. Please download:\nwget {urls[complexity]}"
        )
    
    def extract_from_video(self, video_path: str, skip_frames: int = None) -> Dict:
        """
        Extract all poses from a video with position and angles
        
        Args:
            video_path: Path to video file
            skip_frames: Skip N frames (None = use Config.SKIP_FRAMES)
        
        Returns:
            Dict with metadata and pose list
        """
        if not Path(video_path).exists():
            raise FileNotFoundError(f"Video not found: {video_path}")
        
        if skip_frames is None:
            skip_frames = Config.SKIP_FRAMES
        
        cap = cv2.VideoCapture(video_path)
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = total_frames / fps if fps > 0 else 0
        
        metadata = {
            'fps': fps,
            'total_frames': total_frames,
            'duration': duration,
            'resolution': (width, height),
            'model_complexity': self.model_complexity,
            'active_landmarks': Config.ACTIVE_LANDMARKS,
            'mirror_mode': Config.MIRROR_REFERENCE
        }
        
        logger.info(f"Processing video: {video_path}")
        logger.info(f"   FPS: {fps:.1f}, Frames: {total_frames}, Duration: {duration:.1f}s")
        
        poses = []
        frame_count = 0
        processed_count = 0
        failed_count = 0
        
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Skip frames if specified
            if skip_frames > 0 and frame_count % (skip_frames + 1) != 0:
                frame_count += 1
                continue
            
            # Apply FPS limit if specified
            if Config.TARGET_FPS is not None:
                target_interval = 1.0 / Config.TARGET_FPS
                actual_interval = 1.0 / fps
                if frame_count * actual_interval % target_interval < actual_interval:
                    frame_count += 1
                    continue
            
            # Process frame
            pose_data = self._process_frame(frame, frame_count, fps)
            
            if pose_data:
                poses.append(pose_data)
                processed_count += 1
            else:
                failed_count += 1
            
            frame_count += 1
            
            if frame_count % 100 == 0:
                progress = (frame_count / total_frames) * 100
                logger.info(f"   Progress: {progress:.1f}% ({frame_count}/{total_frames})")
        
        cap.release()
        
        logger.info(f"Extraction completed:")
        logger.info(f"   Processed: {processed_count}, Failed: {failed_count}")
        logger.info(f"   Success rate: {(processed_count/frame_count)*100:.1f}%")
        
        return {
            'metadata': metadata,
            'poses': poses
        }
    
    def _process_frame(self, frame, frame_number: int, fps: float) -> Optional[Dict]:
        """Process individual frame and extract landmarks with angles"""
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Mirror if configured
        if Config.MIRROR_REFERENCE:
            frame_rgb = cv2.flip(frame_rgb, 1)
        
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=frame_rgb
        )
        
        timestamp_ms = int(frame_number / fps * 1000) if fps > 0 else frame_number * 33
        
        detection_result = self.detector.detect_for_video(mp_image, timestamp_ms)
        
        if not detection_result.pose_landmarks or len(detection_result.pose_landmarks) == 0:
            return None
        
        pose_landmarks = detection_result.pose_landmarks[0]
        timestamp = frame_number / fps if fps > 0 else 0
        
        # Serialize landmarks (only active ones)
        landmarks = self._serialize_landmarks(pose_landmarks)
        
        # Calculate angles
        angles = self._calculate_angles(landmarks)
        

        
        return {
            'timestamp': round(timestamp, 3),
            'frame': frame_number,
            'landmarks': landmarks,
            'angles': angles
        }
    
    def _serialize_landmarks(self, pose_landmarks) -> List[Dict]:
        """Convert MediaPipe landmarks to JSON format (only active landmarks)"""
        landmarks = []
        
        # Explicitly filter to only active landmarks to avoid issues with missing points
        for i in Config.ACTIVE_LANDMARKS:
            if i < len(pose_landmarks):
                landmark = pose_landmarks[i]
                landmarks.append({
                    'id': i,
                    'x': round(landmark.x, 4),
                    'y': round(landmark.y, 4),
                    'z': round(landmark.z, 4),
                    'visibility': round(landmark.visibility, 4)
                })
        
        return landmarks
    
    def _calculate_angles(self, landmarks: List[Dict]) -> Dict[str, float]:
        """Calculate joint angles"""
        angles = {}
        
        # Create lookup dict by ID
        landmark_dict = {lm['id']: lm for lm in landmarks}
        
        for angle_name, (p1_id, vertex_id, p2_id) in Config.ANGLE_JOINTS.items():
            if all(id in landmark_dict for id in [p1_id, vertex_id, p2_id]):
                p1 = landmark_dict[p1_id]
                vertex = landmark_dict[vertex_id]
                p2 = landmark_dict[p2_id]
                
                # Only calculate if all points are visible
                if all(pt['visibility'] > 0.5 for pt in [p1, vertex, p2]):
                    angle = self._compute_angle(
                        (p1['x'], p1['y'], p1['z']),
                        (vertex['x'], vertex['y'], vertex['z']),
                        (p2['x'], p2['y'], p2['z'])
                    )
                    angles[angle_name] = round(angle, 2)
                else:
                    angles[angle_name] = None
            else:
                angles[angle_name] = None
        
        return angles
    
    def _compute_angle(self, p1: Tuple[float, float, float], 
                    vertex: Tuple[float, float, float],
                    p2: Tuple[float, float, float]) -> float:
        """Compute angle at vertex between p1-vertex-p2 (2D for camera view). Ignoring depth (z) for angle calculation."""
        v1 = np.array([p1[0] - vertex[0], p1[1] - vertex[1]])
        v2 = np.array([p2[0] - vertex[0], p2[1] - vertex[1]])
        
        # Angle using dot product
        cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-8)
        cos_angle = np.clip(cos_angle, -1.0, 1.0)
        angle_rad = np.arccos(cos_angle)
        angle_deg = np.degrees(angle_rad)
        
        return angle_deg
    
    
    def extract_from_frame(self, frame, timestamp_ms: int = 0) -> Optional[Dict]:
        """
        Extract pose from a single frame (for real-time use).
        
        Args:
            frame: OpenCV frame (BGR)
            timestamp_ms: Timestamp in milliseconds
        
        Returns:
            Dict with landmarks and angles or None
        """
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        if Config.MIRROR_REFERENCE:
            frame_rgb = cv2.flip(frame_rgb, 1)
        
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=frame_rgb
        )
        
        detection_result = self.detector.detect_for_video(mp_image, timestamp_ms)
        
        if detection_result.pose_landmarks and len(detection_result.pose_landmarks) > 0:
            pose_landmarks = detection_result.pose_landmarks[0]
            landmarks = self._serialize_landmarks(pose_landmarks)
            angles = self._calculate_angles(landmarks)

            
            return {
                'landmarks': landmarks,
                'angles': angles
            }
        
        return None
    
    def __del__(self):
        """Cleanup"""
        if hasattr(self, 'detector'):
            self.detector.close()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python pose_extractor.py <video.mp4>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    try:
        Config.load()
        extractor = PoseExtractor()
        data = extractor.extract_from_video(video_path)
        
        output_path = "test_extraction.json"
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"\nExtraction completed. See: {output_path}")
        
    except FileNotFoundError as e:
        print(f"\nError: {e}")
        sys.exit(1)
