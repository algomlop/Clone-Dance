# Clone Dance
### The cross-platform and opensource dance game

**Status: Pre-alpha version**


## Usage

### Create a choreography (video to JSON)
```bash
pip install -r requirements.txt
python process_video.py --video FILE.mp4 --name "NAME"
```

### Visualize the choreography (check it's OK)

1. Start the HTTP server:
```bash
   python -m http.server
```

2. Open in Chrome Desktop (only tested here):
```
   http://localhost:8000/visualizer.html
```

### Play the game (not enjoyable yet)

1. Start the HTTP server:
```bash
   python -m http.server
```

2. Open in Chrome Desktop (only tested here):
```
   http://localhost:8000/clone_hero.html
```

## TODO

- [ ] Make an enjoyable game
- [ ] Add visual effects
- [ ] Fine-tune the detection and scoring strategy (position vs angle). Skip calibration if only angles.
- [ ] Finish this TODO list

