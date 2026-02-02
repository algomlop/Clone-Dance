"""
Clasificador de poses.
- Usa sklearn KNeighborsClassifier (no reinventar la rueda)
- Filtro temporal con EMA (Exponential Moving Average)
- Normalización centralizada
- Manejo robusto de errores
"""

import numpy as np
from typing import Dict, List, Tuple, Optional
from sklearn.neighbors import KNeighborsClassifier
from collections import defaultdict
import logging
import json

logger = logging.getLogger(__name__)


class PoseNormalizer:
    """
    Normalización centralizada de poses.
    Evita duplicación de código.
    """
    
    # Pares de articulaciones para embeddings (según Google)
    JOINT_PAIRS = [
        # Brazos
        (11, 13), (13, 15), (12, 14), (14, 16),
        (11, 15), (12, 16),
        # Piernas
        (23, 25), (25, 27), (24, 26), (26, 28),
        (23, 27), (24, 28),
        # Torso
        (11, 12), (23, 24), (11, 23), (12, 24),
        # Cross-body
        (15, 16), (27, 28), (11, 24), (12, 23),
        # Verticales
        (15, 23), (16, 24), (15, 27), (16, 28),
    ]
    
    @staticmethod
    def normalize_landmarks(landmarks: List[Dict]) -> List[Dict]:
        """
        Normaliza landmarks respecto al tamaño del torso.
        
        Returns:
            Lista de landmarks normalizados o None si falla
        """
        if len(landmarks) != 33:
            logger.warning(f"Landmarks inválidos: {len(landmarks)} en vez de 33")
            return None
        
        try:
            # Puntos de referencia del torso
            left_shoulder = landmarks[11]
            right_shoulder = landmarks[12]
            left_hip = landmarks[23]
            right_hip = landmarks[24]
            
            # Centro del torso
            torso_center_x = (left_shoulder['x'] + right_shoulder['x'] + 
                             left_hip['x'] + right_hip['x']) / 4
            torso_center_y = (left_shoulder['y'] + right_shoulder['y'] + 
                             left_hip['y'] + right_hip['y']) / 4
            
            # Tamaño del torso
            shoulder_mid_y = (left_shoulder['y'] + right_shoulder['y']) / 2
            hip_mid_y = (left_hip['y'] + right_hip['y']) / 2
            torso_size = abs(hip_mid_y - shoulder_mid_y)
            
            # Evitar división por cero
            if torso_size < 0.01:
                torso_size = 0.01
            
            # Normalizar todos los landmarks
            normalized = []
            for lm in landmarks:
                normalized.append({
                    'x': (lm['x'] - torso_center_x) / torso_size,
                    'y': (lm['y'] - torso_center_y) / torso_size,
                    'z': lm['z'] / torso_size,
                    'visibility': lm['visibility']
                })
            
            return normalized
            
        except Exception as e:
            logger.error(f"Error normalizando landmarks: {e}")
            return None
    
    @staticmethod
    def landmarks_to_embedding(normalized_landmarks: List[Dict]) -> Optional[np.ndarray]:
        """
        Convierte landmarks a embedding (vector de distancias).
        
        Returns:
            Array numpy con distancias o None si falla
        """
        if not normalized_landmarks or len(normalized_landmarks) != 33:
            return None
        
        try:
            embedding = []
            
            for pair in PoseNormalizer.JOINT_PAIRS:
                lm1 = normalized_landmarks[pair[0]]
                lm2 = normalized_landmarks[pair[1]]
                
                # Solo calcular si ambos son visibles
                if lm1['visibility'] > 0.5 and lm2['visibility'] > 0.5:
                    distance = np.sqrt(
                        (lm1['x'] - lm2['x'])**2 +
                        (lm1['y'] - lm2['y'])**2 +
                        (lm1['z'] - lm2['z'])**2
                    )
                    embedding.append(distance)
                else:
                    # Valor centinela para articulaciones no visibles
                    embedding.append(-1.0)
            
            return np.array(embedding, dtype=np.float32)
            
        except Exception as e:
            logger.error(f"Error creando embedding: {e}")
            return None


class TemporalFilter:
    """
    Filtro temporal usando EMA (Exponential Moving Average).
    Suaviza las clasificaciones entre frames para evitar "parpadeo".
    """
    
    def __init__(self, alpha: float = 0.3):
        """
        Args:
            alpha: Factor de suavizado (0-1)
                - 0.1: Muy suave (lento a cambiar)
                - 0.3: Balanceado (recomendado)
                - 0.5: Rápido a cambiar
        """
        self.alpha = alpha
        self.pose_probabilities = defaultdict(float)
        self.frame_count = 0
    
    def update(self, pose_type: str, confidence: float) -> Tuple[str, float]:
        """
        Actualiza el filtro con una nueva clasificación.
        
        Returns:
            (pose_type_suavizado, confidence_suavizada)
        """
        # Actualizar probabilidad de la pose actual con EMA
        self.pose_probabilities[pose_type] = (
            self.alpha * confidence +
            (1 - self.alpha) * self.pose_probabilities[pose_type]
        )
        
        # Decaer otras probabilidades
        for other_pose in list(self.pose_probabilities.keys()):
            if other_pose != pose_type:
                self.pose_probabilities[other_pose] *= (1 - self.alpha)
        
        # Retornar la pose con mayor probabilidad suavizada
        best_pose = max(self.pose_probabilities.items(), key=lambda x: x[1])
        
        self.frame_count += 1
        
        return best_pose[0], best_pose[1]
    
    def reset(self):
        """Reinicia el filtro"""
        self.pose_probabilities.clear()
        self.frame_count = 0


class PoseClassifier:
    """
    Clasificador de poses
    
    Mejoras:
    - Usa sklearn KNeighborsClassifier (no reinventar rueda)
    - Filtro temporal para suavizar (EMA)
    - Heurísticas rápidas como pre-filtro
    - Normalización centralizada
    """
    
    # Templates de poses conocidas
    POSE_TEMPLATES = {
        "brazos_arriba": {"name": "Brazos arriba", "icon": "🙌", "difficulty": "easy"},
        "brazos_extendidos_lateral": {"name": "Brazos en cruz", "icon": "🤸", "difficulty": "easy"},
        "brazos_adelante": {"name": "Brazos adelante", "icon": "🧘", "difficulty": "easy"},
        "agachado": {"name": "Agachado", "icon": "🦆", "difficulty": "medium"},
        "pierna_levantada_derecha": {"name": "Pierna derecha", "icon": "🦵", "difficulty": "medium"},
        "pierna_levantada_izquierda": {"name": "Pierna izquierda", "icon": "🦵", "difficulty": "medium"},
        "salto": {"name": "Salto", "icon": "🤾", "difficulty": "hard"},
        "giro_derecha": {"name": "Giro derecha", "icon": "🔄", "difficulty": "medium"},
        "giro_izquierda": {"name": "Giro izquierda", "icon": "🔄", "difficulty": "medium"},
        "manos_caderas": {"name": "Manos caderas", "icon": "🙍", "difficulty": "easy"},
        "brazo_derecho_arriba": {"name": "Brazo derecho", "icon": "🙋", "difficulty": "easy"},
        "brazo_izquierdo_arriba": {"name": "Brazo izquierdo", "icon": "🙋", "difficulty": "easy"},
        "neutral": {"name": "Neutral", "icon": "🧍", "difficulty": "easy"}
    }
    
    def __init__(self, 
                 use_knn: bool = False,
                 k_neighbors: int = 5,
                 confidence_threshold: float = 0.7,
                 use_temporal_filter: bool = True,
                 temporal_alpha: float = 0.3):
        """
        Args:
            use_knn: Activar clasificador k-NN
            k_neighbors: Número de vecinos para k-NN
            confidence_threshold: Umbral de confianza mínimo
            use_temporal_filter: Activar filtro temporal
            temporal_alpha: Factor de suavizado temporal (0-1)
        """
        self.use_knn = use_knn
        self.k = k_neighbors
        self.confidence_threshold = confidence_threshold
        self.use_temporal_filter = use_temporal_filter
        
        # Clasificador sklearn (será entrenado si use_knn=True)
        self.knn_classifier = None
        self.training_labels = []  # Para referencia
        
        # Filtro temporal
        self.temporal_filter = TemporalFilter(alpha=temporal_alpha) if use_temporal_filter else None
        
        logger.info(f"PoseClassifier inicializado:")
        logger.info(f"  k-NN: {'Sí' if use_knn else 'No'}")
        logger.info(f"  Filtro temporal: {'Sí' if use_temporal_filter else 'No'}")
        logger.info(f"  k: {k_neighbors}, threshold: {confidence_threshold}")
    
    def train_knn(self, training_samples: List[Tuple[List[Dict], str]]):
        """
        Entrena el clasificador k-NN con muestras.
        
        Args:
            training_samples: Lista de (landmarks, label)
        """
        if not training_samples:
            logger.warning("No hay muestras de entrenamiento")
            return
        
        X = []  # Embeddings
        y = []  # Labels
        
        for landmarks, label in training_samples:
            normalized = PoseNormalizer.normalize_landmarks(landmarks)
            if normalized is None:
                continue
            
            embedding = PoseNormalizer.landmarks_to_embedding(normalized)
            if embedding is None:
                continue
            
            X.append(embedding)
            y.append(label)
        
        if len(X) == 0:
            logger.error("No se pudieron procesar muestras de entrenamiento")
            return
        
        # Entrenar clasificador sklearn
        self.knn_classifier = KNeighborsClassifier(
            n_neighbors=self.k,
            weights='distance',  # Peso por distancia (mejor que uniforme)
            metric='euclidean'
        )
        
        self.knn_classifier.fit(X, y)
        self.training_labels = list(set(y))
        
        logger.info(f"✅ k-NN entrenado con {len(X)} muestras")
        logger.info(f"   Clases: {self.training_labels}")
    
    def load_training_data(self, training_file: str):
        """Carga y entrena desde archivo JSON"""
        try:
            with open(training_file, 'r') as f:
                data = json.load(f)
            
            samples = [(s['landmarks'], s['label']) for s in data['samples']]
            self.train_knn(samples)
            
        except Exception as e:
            logger.error(f"Error cargando datos de entrenamiento: {e}")
    
    def classify(self, landmarks: List[Dict], use_filter: bool = True) -> Tuple[str, float]:
        """
        Clasifica una pose.
        
        Args:
            landmarks: 33 landmarks
            use_filter: Aplicar filtro temporal (solo para video continuo)
        
        Returns:
            (pose_type, confidence)
        """
        # Paso 1: Heurísticas rápidas (poses MUY obvias)
        quick_result = self._quick_check(landmarks)
        if quick_result['confidence'] >= 0.9:
            pose_type, conf = quick_result['label'], quick_result['confidence']
            
            # Aplicar filtro temporal si está habilitado
            if use_filter and self.temporal_filter:
                return self.temporal_filter.update(pose_type, conf)
            return pose_type, conf
        
        # Paso 2: k-NN (si está entrenado)
        if self.use_knn and self.knn_classifier is not None:
            knn_result = self._classify_knn(landmarks)
            if knn_result['confidence'] >= self.confidence_threshold:
                pose_type, conf = knn_result['label'], knn_result['confidence']
                
                if use_filter and self.temporal_filter:
                    return self.temporal_filter.update(pose_type, conf)
                return pose_type, conf
        
        # Paso 3: Heurísticas completas (fallback)
        heuristic_result = self._classify_heuristics(landmarks)
        pose_type, conf = heuristic_result['label'], heuristic_result['confidence']
        
        if use_filter and self.temporal_filter:
            return self.temporal_filter.update(pose_type, conf)
        return pose_type, conf
    
    def _classify_knn(self, landmarks: List[Dict]) -> Dict:
        """Clasifica usando sklearn k-NN"""
        try:
            # Normalizar y crear embedding
            normalized = PoseNormalizer.normalize_landmarks(landmarks)
            if normalized is None:
                return {'label': 'neutral', 'confidence': 0.0}
            
            embedding = PoseNormalizer.landmarks_to_embedding(normalized)
            if embedding is None:
                return {'label': 'neutral', 'confidence': 0.0}
            
            # Predecir con sklearn
            # predict_proba da probabilidades para cada clase
            probas = self.knn_classifier.predict_proba([embedding])[0]
            
            # Obtener clase con mayor probabilidad
            best_idx = np.argmax(probas)
            best_label = self.knn_classifier.classes_[best_idx]
            confidence = probas[best_idx]
            
            return {'label': best_label, 'confidence': float(confidence)}
            
        except Exception as e:
            logger.error(f"Error en k-NN: {e}")
            return {'label': 'neutral', 'confidence': 0.0}
    
    def _quick_check(self, landmarks: List[Dict]) -> Dict:
        """Verificación ultra-rápida de poses obvias"""
        try:
            # Brazos completamente arriba
            if (landmarks[15]['y'] < landmarks[11]['y'] - 0.35 and
                landmarks[16]['y'] < landmarks[12]['y'] - 0.35 and
                landmarks[15]['visibility'] > 0.7 and
                landmarks[16]['visibility'] > 0.7):
                return {'label': 'brazos_arriba', 'confidence': 0.95}
            
            # Agachado muy pronunciado
            if (landmarks[25]['y'] > landmarks[23]['y'] + 0.45 and
                landmarks[26]['y'] > landmarks[24]['y'] + 0.45 and
                landmarks[25]['visibility'] > 0.7 and
                landmarks[26]['visibility'] > 0.7):
                return {'label': 'agachado', 'confidence': 0.95}
            
            return {'label': None, 'confidence': 0.0}
            
        except (KeyError, IndexError):
            return {'label': None, 'confidence': 0.0}
    
    def _classify_heuristics(self, landmarks: List[Dict]) -> Dict:
        """Clasificación completa con heurísticas (fallback)"""
        try:
            normalized = PoseNormalizer.normalize_landmarks(landmarks)
            if normalized is None:
                return {'label': 'neutral', 'confidence': 0.5}
            
            # Probar cada template
            checks = [
                ('salto', self._check_salto),
                ('agachado', self._check_agachado),
                ('brazos_arriba', self._check_brazos_arriba),
                ('brazos_extendidos_lateral', self._check_brazos_cruz),
            ]
            
            for pose_type, check_func in checks:
                confidence = check_func(normalized)
                if confidence >= self.confidence_threshold:
                    return {'label': pose_type, 'confidence': confidence}
            
            return {'label': 'neutral', 'confidence': 0.5}
            
        except Exception as e:
            logger.error(f"Error en heurísticas: {e}")
            return {'label': 'neutral', 'confidence': 0.5}
    
    # Funciones de verificación (simplificadas)
    
    def _check_brazos_arriba(self, landmarks: List[Dict]) -> float:
        left_up = landmarks[15]['y'] < landmarks[11]['y'] - 0.3
        right_up = landmarks[16]['y'] < landmarks[12]['y'] - 0.3
        visible = landmarks[15]['visibility'] > 0.5 and landmarks[16]['visibility'] > 0.5
        return 0.85 if (left_up and right_up and visible) else 0.0
    
    def _check_brazos_cruz(self, landmarks: List[Dict]) -> float:
        left_level = abs(landmarks[15]['y'] - landmarks[11]['y']) < 0.2
        right_level = abs(landmarks[16]['y'] - landmarks[12]['y']) < 0.2
        wrist_spread = abs(landmarks[15]['x'] - landmarks[16]['x'])
        shoulder_spread = abs(landmarks[11]['x'] - landmarks[12]['x'])
        return 0.85 if (left_level and right_level and wrist_spread > shoulder_spread * 2.0) else 0.0
    
    def _check_agachado(self, landmarks: List[Dict]) -> float:
        left_bent = landmarks[25]['y'] > landmarks[23]['y'] + 0.3
        right_bent = landmarks[26]['y'] > landmarks[24]['y'] + 0.3
        return 0.85 if (left_bent and right_bent) else 0.0
    
    def _check_salto(self, landmarks: List[Dict]) -> float:
        avg_ankle = (landmarks[27]['y'] + landmarks[28]['y']) / 2
        avg_hip = (landmarks[23]['y'] + landmarks[24]['y']) / 2
        return 0.80 if (avg_hip - avg_ankle < 0.5) else 0.0
    
    def reset_filter(self):
        """Reinicia el filtro temporal (usar al empezar nuevo video)"""
        if self.temporal_filter:
            self.temporal_filter.reset()


if __name__ == "__main__":
    print("✅ PoseClassifier cargado")
    print("   - sklearn KNeighborsClassifier")
    print("   - Filtro temporal EMA")
    print("   - Normalización centralizada")