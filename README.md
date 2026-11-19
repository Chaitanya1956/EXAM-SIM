# EXAM//SIM — Milestone 1

Browser-based VR examination simulation built with Three.js + WebXR.
Runs in any modern browser on desktop and on Meta Quest 3S.

## Project layout

```
EXAM-SIM/
├── index.html                  Main page
├── style.css                   All styles
├── README.md
├── js/
│   ├── main.js                 Boot sequence & render loop
│   ├── scene.js                Three.js scene, lighting, GLB loader
│   ├── controls.js             First-person WASD + mouse-look
│   ├── vr.js                   WebXR session + controller visuals
│   └── clock.js                Analogue clock hand animator
└── assets/
    └── models/
        ├── examination-hall.glb        ← your Blender export goes here
        ├── scene-documentation.txt
        └── blender/
            └── examination_hall.py
```

## Quick start (local)

**Option A — npx (no install)**
```bash
cd /Users/chaitanyagaur/Desktop/EXAM-SIM
npx serve .
```
Open `http://localhost:3000` in your browser.

**Option B — Python**
```bash
cd /Users/chaitanyagaur/Desktop/EXAM-SIM
python3 -m http.server 8080
```
Open `http://localhost:8080`.

**Option C — VS Code Live Server**
Right-click `index.html` → "Open with Live Server".

> **Important**: the GLB **must** be served over HTTP.
> Opening `index.html` directly as a `file://` URL will fail with a CORS error.

## Desktop controls

| Key / input | Action |
|---|---|
| Click canvas | Capture mouse (enter first-person mode) |
| W A S D | Move forward / left / back / right |
| Mouse | Look around |
| Shift | Sprint |
| ESC | Release mouse |
| Reset Position button | Snap back to the primary desk |

## VR (Meta Quest 3S)

1. Connect the Quest to the same Wi-Fi as your dev machine.
2. Start a local HTTPS server.  The easiest option:
   ```bash
   npx serve . --ssl-cert cert.pem --ssl-key key.pem
   ```
   Or use VS Code's **Live Preview** extension with HTTPS enabled.  
   Alternatively tunnel with [ngrok](https://ngrok.com/):
   ```bash
   ngrok http 3000
   ```
3. Open the `https://` URL in the **Meta Quest Browser**.
4. Tap **Enter VR**.

> WebXR requires a secure origin (`https://` or `localhost`).

## GitHub Pages deployment

```bash
# From the repo root
git init
git add .
git commit -m "EXAM//SIM Milestone 1"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Then go to **Settings → Pages → Source: main / root** and save.
The site will be live at `https://<you>.github.io/<repo>/`.

> GitHub Pages serves HTTPS automatically, so the VR button will work
> from the Quest Browser as soon as the page is published.

## Object names (key identifiers in the GLB)

| Name | Description |
|---|---|
| `PRIMARY_DESK` | The student's desk (front-centre) |
| `PRIMARY_CHAIR` | The student's chair |
| `EXAM_PAPER` | A4 exam sheet on the desk |
| `EXAM_PEN` | Pen beside the paper |
| `EXAM_CLOCK` | Parent empty for the wall clock |
| `EXAM_CLOCK_HOUR_HAND` | Hour hand (animated in real time) |
| `EXAM_CLOCK_MINUTE_HAND` | Minute hand |
| `EXAM_CLOCK_SECOND_HAND` | Second hand |
| `CLASSROOM_DOOR` | Door leaf (pivots at hinge about its Y axis) |
| `BLACKBOARD` | Front wall blackboard |
| `VR_START` | Recommended XR start-position marker |

## Coordinates

- Room: 9 m wide (X) × 12 m deep (Z) × 3.5 m high (Y).
- Three.js world: `hall.position.z = 2.40` offsets the hall so the
  student chair is at the world origin.
- Standing eye-height: ~1.15 m.  Student faces **−Z** (toward the board).

## Upcoming milestones

- Milestone 2: Interactive exam paper overlay (HTML/JS questions over `EXAM_PAPER`)
- Milestone 3: Timer system driven by `EXAM_CLOCK`
- Milestone 4: Answer recording & analytics dashboard
