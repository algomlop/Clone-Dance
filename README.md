# Clone Dance
### The cross-platform and open-source dance game

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
   http://localhost:8000/clone_dance.html
```

## TODO

- [ ] Make an enjoyable game
- [ ] Add visual effects
- [ ] Fine-tune the detection and scoring strategy (position vs angle). I think it's better only angles. Skip calibration if only angles.
- [ ] Add difficulty levels
- [ ] Add speed control
- [ ] Test in more devices (smartphones and other browsers)
- [ ] Preview next pose
- [ ] Local multiplayer (now is limited to one person in the reference and the live video)
- [ ] From JD 2, the videos have camera movements and zooms. I don't know if these videos could be used.
- [ ] Choreography (JSON) editor
- [ ] Finish this TODO list


Made with love and AI

