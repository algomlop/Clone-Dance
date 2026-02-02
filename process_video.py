#!/usr/bin/env python3
"""
Procesador de coreografías MEJORADO 

MODOS:
- 'keyframes': Detecta solo momentos clave (original)
- 'continuous': Exporta todas las poses continuamente (NUEVO)

Uso:
    # Modo key poses (original)
    python process_video.py --video dance.mp4 --name "Baile" --mode keyframes
    
    # Modo continuo (nuevo)
    python process_video.py --video dance.mp4 --name "Baile" --mode continuous
"""

import argparse
import json
import logging
from pathlib import Path
from datetime import datetime
import sys
import numpy as np

from pose_extractor import PoseExtractor
from pose_classifier import PoseClassifier, PoseNormalizer

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)


class ChoreographyProcessor:
    """
    Procesador mejorado con dos modos:
    - keyframes: Solo poses clave
    - continuous: Todas las poses frame por frame
    """
    
    def __init__(self,
                 model_complexity: str = 'lite',  # ← CAMBIO: lite por defecto
                 use_knn: bool = False,
                 confidence_threshold: float = 0.7,
                 use_temporal_filter: bool = True):
        """
        Args:
            model_complexity: 'lite', 'full', 'heavy'
            use_knn: Activar k-NN
            confidence_threshold: Umbral de confianza
            use_temporal_filter: Activar filtro temporal (recomendado para continuous)
        """
        # Extractor
        try:
            self.extractor = PoseExtractor(
                model_complexity=model_complexity
            )
        except FileNotFoundError as e:
            logger.error("❌ Modelo no encontrado:")
            logger.error(str(e))
            sys.exit(1)
        
        # Clasificador 
        self.classifier = PoseClassifier(
            use_knn=use_knn,
            confidence_threshold=confidence_threshold,
            use_temporal_filter=use_temporal_filter,
            temporal_alpha=0.3
        )
        
        self.model_complexity = model_complexity
        self.use_knn = use_knn
    
    def process_video(self,
                     video_path: str,
                     name: str,
                     mode: str = 'keyframes',
                     source_url: str = "",
                     output_dir: str = "choreographies",
                     skip_frames: int = 0,
                     training_data: str = None,
                     **kwargs) -> str:
        """
        Procesa video en modo keyframes o continuous.
        
        Args:
            video_path: Ruta al video
            name: Nombre de la coreografía
            mode: 'keyframes' o 'continuous'
            source_url: URL original
            output_dir: Directorio de salida
            skip_frames: Saltar frames
            training_data: Archivo JSON de entrenamiento
            **kwargs: Parámetros específicos del modo
        
        Returns:
            Ruta al JSON generado
        """
        logger.info("="*70)
        logger.info(f"🎬 PROCESANDO: {name}")
        logger.info(f"   Modo: {mode.upper()}")
        logger.info(f"   Modelo: {self.model_complexity}")
        logger.info("="*70)
        
        # Cargar datos de entrenamiento si se especificaron
        if training_data and self.use_knn:
            logger.info(f"\n📚 Cargando entrenamiento: {training_data}")
            try:
                self.classifier.load_training_data(training_data)
            except Exception as e:
                logger.warning(f"⚠️  Error cargando entrenamiento: {e}")
        
        # PASO 1: Extraer poses
        logger.info("\n📹 PASO 1: Extrayendo poses...")
        extraction_data = self.extractor.extract_from_video(
            video_path,
            skip_frames=skip_frames
        )
        
        all_poses = extraction_data['poses']
        metadata = extraction_data['metadata']
        
        if not all_poses:
            logger.error("❌ No se pudieron extraer poses")
            sys.exit(1)
        
        # PASO 2: Procesar según el modo
        if mode == 'keyframes':
            # Filtramos para no pasar 'sample_rate' a una función que no lo acepta
            keyframe_args = {k: v for k, v in kwargs.items() if k != 'sample_rate'}
            result = self._process_keyframes(all_poses, metadata, **keyframe_args)
        elif mode == 'continuous':
            keyframe_args = {k: v for k, v in kwargs.items() if k != 'sample_rate' and k != 'movement_threshold' and k != 'min_time_gap'}
            result = self._process_continuous(all_poses, metadata, **keyframe_args)
        else:
            raise ValueError(f"Modo inválido: {mode}. Usa 'keyframes' o 'continuous'")
        
        # PASO 3: Guardar 
        logger.info("\n💾 PASO 3: Guardando...")
        
        choreography = {
            'metadata': {
                'name': name,
                'source_url': source_url,
                'mode': mode,
                'duration': metadata['duration'],
                'fps': metadata['fps'],
                'resolution': metadata['resolution'],
                'total_frames': metadata['total_frames'],
                'processed_at': datetime.now().isoformat(),
                'processing_params': {
                    'model_complexity': self.model_complexity,
                    'use_knn': self.use_knn,
                    'use_temporal_filter': self.classifier.use_temporal_filter,
                    'skip_frames': skip_frames
                }
            },
            **result
        }
        
        output_path = self._save_choreography(choreography, name, mode, output_dir)
        self._print_summary(choreography, output_path)
        
        return output_path
    
    def _process_keyframes(self, all_poses: list, metadata: dict, 
                          movement_threshold: float = 0.15,
                          min_time_gap: float = 1.0) -> dict:
        """
        Modo KEYFRAMES: Detecta solo poses clave.
        """
        logger.info("\n⭐ PASO 2: Detectando poses clave...")
        
        # Calcular movimiento entre frames
        movements = self._calculate_movements(all_poses)
        
        # Encontrar picos
        peaks = self._find_movement_peaks(movements, movement_threshold)
        
        # Filtrar por tiempo
        filtered_peaks = self._filter_by_time(peaks, all_poses, movements, min_time_gap)
        
        logger.info(f"   Picos encontrados: {len(peaks)}")
        logger.info(f"   Después de filtrado: {len(filtered_peaks)}")
        
        # Clasificar cada pose clave
        key_poses = []
        pose_type_counts = {}
        
        # Reiniciar filtro temporal
        self.classifier.reset_filter()
        
        for peak_idx in filtered_peaks:
            pose = all_poses[peak_idx]
            
            # Clasificar (sin filtro temporal para key poses)
            pose_type, confidence = self.classifier.classify(
                pose['landmarks'],
                use_filter=False
            )
            
            pose_type_counts[pose_type] = pose_type_counts.get(pose_type, 0) + 1
            
            key_poses.append({
                'timestamp': pose['timestamp'],
                'frame': pose['frame'],
                'landmarks': pose['landmarks'],
                'pose_type': pose_type,
                'confidence': round(confidence, 3),
                'movement_intensity': round(movements[peak_idx], 3)
            })
        
        # Calcular estadísticas
        stats = self._calculate_stats(key_poses, metadata['duration'])
        
        logger.info(f"✅ {len(key_poses)} poses clave detectadas")
        
        return {
            'key_poses': key_poses,
            'stats': stats
        }
    
    def _process_continuous(self, all_poses: list, metadata: dict,
                           sample_rate: int = 1) -> dict:
        """
        Modo CONTINUOUS: Exporta todas las poses SIN clasificar.
        Solo landmarks puros para comparación en tiempo real.
        
        Args:
            sample_rate: Exportar 1 de cada N poses (1 = todas)
        """
        logger.info("\n🎞️ PASO 2: Procesando modo continuo...")
        logger.info("   ⚡ Modo RAW: Sin clasificación para máximo rendimiento")
        
        continuous_poses = []
        
        for i, pose in enumerate(all_poses):
            # Aplicar sample rate
            if i % sample_rate != 0:
                continue
            
            # NO clasificar - solo guardar landmarks puros
            continuous_poses.append({
                'timestamp': pose['timestamp'],
                'frame': pose['frame'],
                'landmarks': pose['landmarks']
                # Sin pose_type, sin confidence - solo datos crudos
            })
            
            if (i + 1) % 100 == 0:
                progress = ((i + 1) / len(all_poses)) * 100
                logger.info(f"   Progreso: {progress:.1f}%")
        
        # Estadísticas simples
        stats = {
            'total_poses': len(continuous_poses),
            'sample_rate': sample_rate,
            'duration': metadata['duration'],
            'fps_effective': len(continuous_poses) / metadata['duration'] if metadata['duration'] > 0 else 0
        }
        
        logger.info(f"✅ {len(continuous_poses)} poses exportadas (RAW)")
        
        return {
            'continuous_poses': continuous_poses,
            'stats': stats
        }
    
    def _calculate_movements(self, poses: list) -> list:
        """Calcula movimiento entre frames consecutivos"""
        movements = [0.0]
        
        for i in range(1, len(poses)):
            movement = self._pose_distance(
                poses[i]['landmarks'],
                poses[i-1]['landmarks']
            )
            movements.append(movement)
        
        return movements
    
    def _pose_distance(self, landmarks1: list, landmarks2: list) -> float:
        """Distancia entre dos poses"""
        key_joints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
        
        total_distance = 0.0
        count = 0
        
        for idx in key_joints:
            lm1 = landmarks1[idx]
            lm2 = landmarks2[idx]
            
            if lm1['visibility'] > 0.5 and lm2['visibility'] > 0.5:
                dist = np.sqrt(
                    (lm1['x'] - lm2['x'])**2 +
                    (lm1['y'] - lm2['y'])**2 +
                    (lm1['z'] - lm2['z'])**2
                )
                total_distance += dist
                count += 1
        
        return total_distance / count if count > 0 else 0.0
    
    def _find_movement_peaks(self, movements: list, threshold: float) -> list:
        """Encuentra picos de movimiento"""
        peaks = []
        
        for i in range(1, len(movements) - 1):
            is_peak = (
                movements[i] > movements[i-1] and
                movements[i] > movements[i+1] and
                movements[i] > threshold
            )
            
            if is_peak:
                peaks.append(i)
        
        return peaks
    
    def _filter_by_time(self, peaks: list, all_poses: list, 
                       movements: list, min_gap: float) -> list:
        """Filtra picos muy cercanos temporalmente"""
        if not peaks:
            return []
        
        filtered = [peaks[0]]
        
        for peak_idx in peaks[1:]:
            last_kept = filtered[-1]
            time_diff = all_poses[peak_idx]['timestamp'] - all_poses[last_kept]['timestamp']
            
            if time_diff >= min_gap:
                filtered.append(peak_idx)
            elif movements[peak_idx] > movements[last_kept]:
                filtered[-1] = peak_idx
        
        return filtered
    
    def _calculate_stats(self, key_poses: list, duration: float) -> dict:
        """Calcula estadísticas de poses clave"""
        if not key_poses:
            return {}
        
        pose_types = {}
        for kp in key_poses:
            pose_type = kp['pose_type']
            pose_types[pose_type] = pose_types.get(pose_type, 0) + 1
        
        # Calcular dificultad
        difficulty_dist = {'easy': 0, 'medium': 0, 'hard': 0}
        for kp in key_poses:
            pose_type = kp['pose_type']
            difficulty = PoseClassifier.POSE_TEMPLATES.get(pose_type, {}).get('difficulty', 'easy')
            difficulty_dist[difficulty] += 1
        
        timestamps = [kp['timestamp'] for kp in key_poses]
        time_gaps = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps) - 1)]
        avg_time_gap = np.mean(time_gaps) if time_gaps else 0
        
        return {
            'total_key_poses': len(key_poses),
            'avg_time_gap': round(avg_time_gap, 2),
            'pose_types_distribution': pose_types,
            'difficulty_distribution': difficulty_dist,
            'duration': duration
        }
    
    def _save_choreography(self, choreography: dict, name: str, 
                          mode: str, output_dir: str) -> str:
        """Guarda JSON"""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        filename = name.lower().replace(' ', '_').replace('-', '_')
        filename = ''.join(c for c in filename if c.isalnum() or c == '_')
        filename = f"{filename}_{mode}.json"
        
        full_path = output_path / filename
        
        with open(full_path, 'w', encoding='utf-8') as f:
            json.dump(choreography, f, indent=2, ensure_ascii=False)
        
        return str(full_path)
    
    def _print_summary(self, choreography: dict, output_path: str):
        """Imprime resumen"""
        metadata = choreography['metadata']
        mode = metadata['mode']
        
        logger.info("\n" + "="*70)
        logger.info("✅ PROCESAMIENTO COMPLETADO")
        logger.info("="*70)
        logger.info(f"\n📊 Modo: {mode.upper()}")
        logger.info(f"   Nombre: {metadata['name']}")
        logger.info(f"   Duración: {metadata['duration']:.1f}s")
        
        if mode == 'keyframes':
            stats = choreography['stats']
            logger.info(f"\n⭐ Poses clave: {stats['total_key_poses']}")
            logger.info(f"   Intervalo: {stats['avg_time_gap']:.1f}s")
        else:  # continuous
            stats = choreography['stats']
            logger.info(f"\n🎞️ Poses continuas: {stats['total_poses']}")
            logger.info(f"   FPS efectivo: {stats['fps_effective']:.1f}")
            logger.info(f"   Sample rate: 1/{stats['sample_rate']}")
        
        logger.info(f"\n💾 Guardado en: {output_path}")
        logger.info("="*70 + "\n")


def main():
    print(f"El nivel real del logger es: {logging.getLevelName(logger.getEffectiveLevel())}")
    parser = argparse.ArgumentParser(
        description='Procesador - Keyframes o Continuous',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('--video', required=True, help='Video MP4')
    parser.add_argument('--name', required=True, help='Nombre')
    parser.add_argument(
        '--mode',
        choices=['keyframes', 'continuous'],
        default='keyframes',
        help='Modo: keyframes (poses clave) o continuous (todas las poses)'
    )
    parser.add_argument('--url', default='', help='URL original')
    parser.add_argument('--output-dir', default='choreographies')
    parser.add_argument('--model-complexity', choices=['lite', 'full', 'heavy'], default='lite')  # ← lite por defecto
    parser.add_argument('--skip-frames', type=int, default=0)
    parser.add_argument('--use-knn', action='store_true')
    parser.add_argument('--training-data', help='JSON de entrenamiento')
    
    # Parámetros para modo keyframes
    parser.add_argument('--movement-threshold', type=float, default=0.15)
    parser.add_argument('--min-time-gap', type=float, default=1.0)
    parser.add_argument('--confidence-threshold', type=float, default=0.7)
    
    # Parámetros para modo continuous
    parser.add_argument('--sample-rate', type=int, default=1, 
                       help='Para continuous: exportar 1 de cada N poses')
    parser.add_argument('--no-temporal-filter', action='store_true',
                       help='Desactivar filtro temporal')
    
    args = parser.parse_args()
    
    if not Path(args.video).exists():
        logger.error(f"❌ Video no encontrado: {args.video}")
        sys.exit(1)
    
    try:
        processor = ChoreographyProcessor(
            model_complexity=args.model_complexity,
            use_knn=args.use_knn,
            confidence_threshold=args.confidence_threshold,
            use_temporal_filter=not args.no_temporal_filter
        )
        
        output_path = processor.process_video(
            video_path=args.video,
            name=args.name,
            mode=args.mode,
            source_url=args.url,
            output_dir=args.output_dir,
            skip_frames=args.skip_frames,
            training_data=args.training_data,
            movement_threshold=args.movement_threshold,
            min_time_gap=args.min_time_gap,
            sample_rate=args.sample_rate
        )
        
        logger.info(f"✅ ¡Éxito! {output_path}\n")
        
    except KeyboardInterrupt:
        logger.info("\n⚠️  Interrumpido")
        sys.exit(1)
    except Exception as e:
        logger.error(f"\n❌ Error: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()