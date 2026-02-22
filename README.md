# Clone Dance
### The Dance Game: online, cross-platform and open-source

Create reference choreographies using videos and play along with your webcam or smartphone camera. This game uses MediaPipe to compare choreographies, giving you a score.

**Status: Alpha version. In standby, thinking how to resolve to have high-quality reference videos. You can open an issue if you have any clue.**

Demo:

[![Demo](https://img.youtube.com/vi/MMOTEbvUGqo/0.jpg)](https://www.youtube.com/watch?v=MMOTEbvUGqo)

Copyright / takedown notice — If this repository on GitHub contains material you own, please contact me directly or open an issue with your claim. I will cooperate and remove the content immediately upon request.


## Usage

### Create a choreography (video to JSON)
```bash
pip install -r requirements.txt
python process_video.py --video FILE.mp4 --name "NAME"
```

### Visualize the choreography (check it's OK)

Open in Chrome Desktop (only tested here):
https://algomlop.github.io/Clone-Dance/visualizer.html

OR

1. Start the HTTP server:
```bash
   python -m http.server
```

2. Open in Chrome Desktop (only tested here):
```
   http://localhost:8000/visualizer.html
```

### Play the game

Open in Chrome Desktop (only tested here):
https://algomlop.github.io/Clone-Dance/clone_dance.html

OR

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
- [ ] Improve visual and sound effects
- [ ] Fine-tuning of the detection and scoring strategy (position vs angle). I think it's better only angles. Skip or simplify calibration if only angles are used.
- [ ] Fine-tuning of the difficulty levels
- [ ] Test in more devices (smartphones and other browsers)
- [ ] Preview next pose
- [ ] Local multiplayer (now is limited to one person in the reference and the live video)
- [ ] Choreography (JSON) editor




Made with love and AI

