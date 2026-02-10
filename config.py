"""
Clone Dance - Configuration File
Loads configuration from config.json for all modules.
"""

import json
from pathlib import Path
from typing import Any, Dict, Optional


class Config:
    """
    Centralized configuration loader.
    Values come from config.json (sections: common, game, visualizer).
    """

    _config: Optional[Dict[str, Any]] = None
    _path: Optional[Path] = None

    @classmethod
    def load(cls, filepath: str = 'config.json') -> Dict[str, Any]:
        """Load configuration from JSON file."""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Config not found: {filepath}")

        with path.open('r', encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, dict):
            raise ValueError("Config file must be a JSON object")

        if 'common' not in data or 'game' not in data or 'visualizer' not in data:
            raise ValueError("Config file must include common, game, and visualizer sections")

        cls._config = data
        cls._path = path

        # Expose common section as class attributes for existing callers
        for key, value in data.get('common', {}).items():
            setattr(cls, key, value)

        return data

    @classmethod
    def ensure_loaded(cls, filepath: str = 'config.json') -> None:
        """Ensure configuration is loaded once."""
        if cls._config is None:
            cls.load(filepath)

    @classmethod
    def get_section(cls, section: str) -> Dict[str, Any]:
        """Return a section dict from the loaded config."""
        cls.ensure_loaded()
        section_data = cls._config.get(section)
        if not isinstance(section_data, dict):
            raise KeyError(f"Missing config section: {section}")
        return section_data

    @classmethod
    def get(cls, section: str, key: str, default: Any = None) -> Any:
        """Get a key from a section with optional default."""
        section_data = cls.get_section(section)
        if key in section_data:
            return section_data[key]
        return default

    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Return the full config dictionary."""
        cls.ensure_loaded()
        return cls._config

    @classmethod
    def save(cls, filepath: Optional[str] = None) -> None:
        """Save current config back to JSON."""
        if cls._config is None:
            raise RuntimeError("Config not loaded")

        path = Path(filepath) if filepath else (cls._path or Path('config.json'))
        with path.open('w', encoding='utf-8') as f:
            json.dump(cls._config, f, indent=2, ensure_ascii=False)

    @classmethod
    def print_config(cls) -> None:
        """Print current configuration."""
        cls.ensure_loaded()
        print("=" * 60)
        print("CLONE DANCE - CONFIGURATION")
        print("=" * 60)
        for section, values in cls._config.items():
            print(f"[{section}]")
            if isinstance(values, dict):
                for key, value in sorted(values.items()):
                    print(f"  {key:30} = {value}")
            else:
                print(f"  {values}")
        print("=" * 60)


if __name__ == "__main__":
    try:
        Config.load()
        Config.print_config()
    except Exception as exc:
        print(f"Error loading config: {exc}")
