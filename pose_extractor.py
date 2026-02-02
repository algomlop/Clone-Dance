"""
Extractor de poses usando MediaPipe Pose Landmarker (nueva API).
Reemplaza la implementación anterior con la API moderna y más precisa.
"""

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
import json
from pathlib import Path
from typing import List, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PoseExtractor:
    """
    Extractor de poses usando MediaPipe Pose Landmarker (nueva API).
    
    Ventajas vs API antigua:
    - Modelos más precisos (especialmente Heavy)
    - Mejor rendimiento
    - API moderna y mantenida
    - Soporte para múltiples personas
    """
    
    def __init__(self, 
                 model_path: Optional[str] = None,
                 model_complexity: str = 'heavy'):
        

        """
        Inicializa el extractor con Pose Landmarker.
        
        Args:
            model_path: Ruta al archivo .task del modelo
            model_complexity: 'lite', 'full', o 'heavy'
                - lite: Más rápido, menos preciso
                - full: Balanceado (recomendado para tiempo real)
                - heavy: Más lento, más preciso (recomendado para offline)
        """
        self.model_complexity = model_complexity
        
        # Si no nos dan una ruta específica, construimos el nombre según la complejidad
        if model_path is None:
            model_path = f'pose_landmarker_{model_complexity}.task'
        
        # Verificar si el modelo existe
        model_path = self._ensure_model_exists(model_path, model_complexity)
        
        base_options = python.BaseOptions(model_asset_path=model_path)
        
        # Opciones para procesamiento de video
        self.options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,  # Solo una persona
            min_pose_detection_confidence=0.5,  # ↑ Evita parpadeo
            min_pose_presence_confidence=0.5,   # ↑ Más estricto  
            min_tracking_confidence=0.7,        # ↑ Tracking fuerte
            output_segmentation_masks=False  # No necesitamos máscaras
        )
        
        self.detector = vision.PoseLandmarker.create_from_options(self.options)
        
        logger.info(f"✅ PoseLandmarkerExtractor inicializado con modelo: {model_complexity}")
    
    def _ensure_model_exists(self, model_path: str, complexity: str) -> str:
        # 1. Si la ruta que nos llega existe, la usamos
        if Path(model_path).exists():
            return model_path
        
        # 2. Si no, intentamos buscar el nombre estándar por si acaso
        default_name = f'pose_landmarker_{complexity}.task'
        if Path(default_name).exists():
            return default_name
        
        # 3. Si nada funciona, error
        logger.error(f"❌ No se encontró el modelo: {model_path}")
        logger.info(f"📥 Descarga el modelo con:")
        
        urls = {
            'lite': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
            'full': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
            'heavy': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task'
        }
        
        logger.info(f"wget {urls[complexity]}")
        
        raise FileNotFoundError(
            f"Modelo no encontrado. Por favor descarga:\n"
            f"wget {urls[complexity]}"
        )
    
    def extract_from_video(self, video_path: str, skip_frames: int = 0) -> Dict:
        """
        Extrae todas las poses de un video.
        
        Args:
            video_path: Ruta al archivo de video
            skip_frames: Saltar N frames (0 = procesar todos)
        
        Returns:
            Dict con metadata y lista de poses
        """
        if not Path(video_path).exists():
            raise FileNotFoundError(f"Video no encontrado: {video_path}")
        
        cap = cv2.VideoCapture(video_path)
        
        # Obtener metadata del video
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
            'model_complexity': self.model_complexity
        }
        
        logger.info(f"📹 Procesando video: {video_path}")
        logger.info(f"   FPS: {fps:.1f}, Frames: {total_frames}, Duración: {duration:.1f}s")
        
        poses = []
        frame_count = 0
        processed_count = 0
        failed_count = 0
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            # Saltar frames si se especifica
            if skip_frames > 0 and frame_count % (skip_frames + 1) != 0:
                frame_count += 1
                continue
            
            # Procesar frame
            pose_data = self._process_frame(frame, frame_count, fps)
            
            if pose_data:
                poses.append(pose_data)
                processed_count += 1
            else:
                failed_count += 1
            
            frame_count += 1
            
            # Log progreso cada 100 frames
            if frame_count % 100 == 0:
                progress = (frame_count / total_frames) * 100
                logger.info(f"   Progreso: {progress:.1f}% ({frame_count}/{total_frames})")
        
        cap.release()
        
        logger.info(f"✅ Extracción completada:")
        logger.info(f"   Procesados: {processed_count}, Fallos: {failed_count}")
        logger.info(f"   Tasa éxito: {(processed_count/frame_count)*100:.1f}%")
        
        return {
            'metadata': metadata,
            'poses': poses
        }
    
    def _process_frame(self, frame, frame_number: int, fps: float) -> Optional[Dict]:
        """Procesa un frame individual y extrae landmarks"""
        # Convertir frame a RGB (MediaPipe requiere RGB)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Crear MediaPipe Image desde numpy array
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=frame_rgb
        )
        
        # Calcular timestamp en milisegundos (requerido por Pose Landmarker)
        timestamp_ms = int(frame_number / fps * 1000) if fps > 0 else frame_number * 33
        
        # Detectar poses
        detection_result = self.detector.detect_for_video(mp_image, timestamp_ms)
        
        # Verificar si se detectó alguna pose
        if not detection_result.pose_landmarks or len(detection_result.pose_landmarks) == 0:
            return None
        
        # Tomar la primera pose (solo detectamos una persona)
        pose_landmarks = detection_result.pose_landmarks[0]
        
        # Calcular timestamp real
        timestamp = frame_number / fps if fps > 0 else 0
        
        # Serializar landmarks
        landmarks = self._serialize_landmarks(pose_landmarks)
        
        return {
            'timestamp': round(timestamp, 3),
            'frame': frame_number,
            'landmarks': landmarks
        }
    
    def _serialize_landmarks(self, pose_landmarks) -> List[Dict]:
        """Convierte landmarks de MediaPipe a formato JSON"""
        landmarks = []
        
        for landmark in pose_landmarks:
            landmarks.append({
                'x': round(landmark.x, 4),
                'y': round(landmark.y, 4),
                'z': round(landmark.z, 4),
                'visibility': round(landmark.visibility, 4)
            })
        
        return landmarks
    
    def extract_from_frame(self, frame, timestamp_ms: int = 0) -> Optional[List[Dict]]:
        """
        Extrae pose de un frame individual (para tiempo real).
        
        Args:
            frame: Frame de OpenCV (BGR)
            timestamp_ms: Timestamp en milisegundos
        
        Returns:
            Lista de landmarks o None
        """
        # Convertir BGR a RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Crear MediaPipe Image
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=frame_rgb
        )
        
        # Detectar
        detection_result = self.detector.detect_for_video(mp_image, timestamp_ms)
        
        if detection_result.pose_landmarks and len(detection_result.pose_landmarks) > 0:
            return self._serialize_landmarks(detection_result.pose_landmarks[0])
        
        return None
    
    def __del__(self):
        """Cleanup"""
        if hasattr(self, 'detector'):
            self.detector.close()


# Constantes: índices de landmarks (33 puntos)
class LandmarkIndex:
    """Índices de los 33 landmarks de MediaPipe Pose"""
    
    NOSE = 0
    LEFT_EYE_INNER = 1
    LEFT_EYE = 2
    LEFT_EYE_OUTER = 3
    RIGHT_EYE_INNER = 4
    RIGHT_EYE = 5
    RIGHT_EYE_OUTER = 6
    LEFT_EAR = 7
    RIGHT_EAR = 8
    MOUTH_LEFT = 9
    MOUTH_RIGHT = 10
    
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    
    LEFT_PINKY = 17
    RIGHT_PINKY = 18
    LEFT_INDEX = 19
    RIGHT_INDEX = 20
    LEFT_THUMB = 21
    RIGHT_THUMB = 22
    
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Uso: python pose_extractor.py <video.mp4>")
        sys.exit(1)
    
    video_path = sys.argv[1]
    
    try:
        extractor = PoseExtractor(model_complexity='heavy')
        data = extractor.extract_from_video(video_path)
        
        output_path = "test_landmarker_extraction.json"
        with open(output_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"\n✅ Extracción completada. Ver: {output_path}")
        
    except FileNotFoundError as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)