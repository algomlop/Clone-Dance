"""
Video processor for Clone Dance.
Extracts continuous pose data from choreography videos.
"""

import argparse
import json
import logging
from pathlib import Path
from datetime import datetime
import sys

from pose_extractor import PoseExtractor
from config import Config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)


class ChoreographyProcessor:
    """
    Process choreography videos into continuous pose data.
    """
    
    def __init__(self, model_complexity: str = None):
        """
        Args:
            model_complexity: 'lite', 'full', or 'heavy'
        """
        self.model_complexity = model_complexity or Config.MODEL_COMPLEXITY
        
        try:
            self.extractor = PoseExtractor(model_complexity=self.model_complexity)
        except FileNotFoundError as e:
            logger.error("Model not found:")
            logger.error(str(e))
            sys.exit(1)
    
    def process_video(self,
                     video_path: str,
                     name: str,
                     source_url: str = "",
                     output_dir: str = None,
                     skip_frames: int = None) -> str:
        """
        Process video into continuous choreography data.
        
        Args:
            video_path: Path to video file
            name: Choreography name
            source_url: Original video URL
            output_dir: Output directory (default: Config.OUTPUT_DIR)
            skip_frames: Skip N frames (default: Config.SKIP_FRAMES)
        
        Returns:
            Path to generated JSON file
        """
        if output_dir is None:
            output_dir = Config.OUTPUT_DIR
        
        if skip_frames is None:
            skip_frames = Config.SKIP_FRAMES
        
        logger.info("="*70)
        logger.info(f"PROCESSING: {name}")
        logger.info(f"   Model: {self.model_complexity}")
        logger.info(f"   Skip frames: {skip_frames}")
        logger.info("="*70)
        
        # Extract poses
        logger.info("\nExtracting poses...")
        extraction_data = self.extractor.extract_from_video(
            video_path,
            skip_frames=skip_frames
        )
        
        poses = extraction_data['poses']
        metadata = extraction_data['metadata']
        
        if not poses:
            logger.error("No poses extracted")
            sys.exit(1)
        
        # Calculate statistics
        stats = self._calculate_stats(poses, metadata)
        
        # Build choreography object
        choreography = {
            'metadata': {
                'name': name,
                'source_url': source_url,
                'duration': metadata['duration'],
                'fps': metadata['fps'],
                'resolution': metadata['resolution'],
                'total_frames': metadata['total_frames'],
                'processed_at': datetime.now().isoformat(),
                'processing_params': {
                    'model_complexity': self.model_complexity,
                    'skip_frames': skip_frames,
                    'active_landmarks': Config.ACTIVE_LANDMARKS,
                    'mirror_mode': Config.MIRROR_REFERENCE
                }
            },
            'poses': poses,
            'stats': stats
        }
        
        # Save
        output_path = self._save_choreography(choreography, name, output_dir)
        self._print_summary(choreography, output_path)
        
        return output_path
    
    def _calculate_stats(self, poses: list, metadata: dict) -> dict:
        """Calculate statistics"""
        total_poses = len(poses)
        duration = metadata['duration']
        fps_effective = total_poses / duration if duration > 0 else 0
        

        
        return {
            'total_poses': total_poses,
            'fps_effective': round(fps_effective, 2),
            'duration': duration
        }
    
    def _save_choreography(self, choreography: dict, name: str, 
                          output_dir: str) -> str:
        """Save choreography JSON"""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Clean filename
        filename = name.lower().replace(' ', '_').replace('-', '_')
        filename = ''.join(c for c in filename if c.isalnum() or c == '_')
        filename = f"{filename}.json"
        
        full_path = output_path / filename
        
        with open(full_path, 'w', encoding='utf-8') as f:
            json.dump(choreography, f, indent=2, ensure_ascii=False)
        
        return str(full_path)
    
    def _print_summary(self, choreography: dict, output_path: str):
        """Print processing summary"""
        metadata = choreography['metadata']
        stats = choreography['stats']
        
        logger.info("\n" + "="*70)
        logger.info("PROCESSING COMPLETED")
        logger.info("="*70)
        logger.info(f"\nName: {metadata['name']}")
        logger.info(f"Duration: {metadata['duration']:.1f}s")
        logger.info(f"Total poses: {stats['total_poses']}")
        logger.info(f"Effective FPS: {stats['fps_effective']:.1f}")
        logger.info(f"\nSaved to: {output_path}")
        logger.info("="*70 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description='Clone Dance - Video Processor',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('--video', required=True, help='Video file (MP4)')
    parser.add_argument('--name', required=True, help='Choreography name')
    parser.add_argument('--url', default='', help='Source URL')
    parser.add_argument('--output-dir', default=None, help='Output directory (default: config.json)')
    parser.add_argument('--model-complexity', choices=['lite', 'full', 'heavy'], 
                       default=None, help='Model complexity (default: config.json)')
    parser.add_argument('--skip-frames', type=int, default=None,
                       help='Skip N frames (default: config.json)')
    parser.add_argument('--config', default='config.json', help='Config file path')
    
    args = parser.parse_args()
    
    # Load config
    Config.load(args.config)
    
    if not Path(args.video).exists():
        logger.error(f"Video not found: {args.video}")
        sys.exit(1)
    
    try:
        processor = ChoreographyProcessor(
            model_complexity=args.model_complexity
        )
        
        output_path = processor.process_video(
            video_path=args.video,
            name=args.name,
            source_url=args.url,
            output_dir=args.output_dir,
            skip_frames=args.skip_frames
        )
        
        logger.info(f"Success! {output_path}\n")
        
    except KeyboardInterrupt:
        logger.info("\nInterrupted")
        sys.exit(1)
    except Exception as e:
        logger.error(f"\nError: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
