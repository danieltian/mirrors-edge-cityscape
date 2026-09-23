# White City

A procedural, all-white cityscape in the spirit of the Mirror's Edge title screen: clean untextured towers, soft blue shade, white haze, and a calm river that mirrors the skyline. Built with Three.js.

```bash
npm install
npm run dev
```

Add `?seed=1234` to the URL to reproduce a specific city. The current seed is always written back to the URL.

## Controls

| Key | Action |
| --- | --- |
| Space | Toggle **Drift** (automatic camera) / **Explore** |
| R | Jump to a random viewpoint |
| I | Toggle perspective / isometric |
| T | Tour: cycle viewpoints automatically |
| C | Colour accents on/off |
| N | Generate a new city |
| G | Settings panel |
| H | Hide the control dock |
| F | Fullscreen |

**Explore, perspective:** drag to look, right-drag to pan, scroll to zoom, WASD to fly, Q/E to go down/up, Shift for speed.
**Explore, isometric:** drag to pan, right-drag to rotate, scroll to zoom, WASD to move, Q/E to rotate 90°.

Dragging, scrolling or pressing a movement key while drifting switches to Explore.

## How it works

**City generation** (`src/city/`). Everything derives from one seed.
- `terrain.js`: a signed land/water field on a 5 m grid. It combines a noisy island, a meandering river, lagoons, coastal bays, and piers and slips at a few port zones. The land mesh is built with marching squares, giving flat tops and vertical quay walls.
- `layout.js`: Voronoi districts, each with its own rotated street grid (often aligned to the river), cut into blocks and lots. Building heights follow a density field with two or three downtown peaks.
- `buildings.js`: turns each lot into stacks of unit primitives: setbacks, podium towers, banded and octagonal towers, cylinders, slanted slabs, twin towers, courtyards, industrial sheds and construction sites with tower cranes. Rooftop clutter includes penthouses, AC units, vents, water tanks, parapets and a few antennas.
- `prims.js`: all primitives go into chunked `InstancedMesh`es (about 200 draw calls for about 1M triangles) with per-instance colour. Accents swap per-instance colours, with no rebuild needed.
- `landmarks.js`: the needle tower, a slanted supertall, and faceted hills out in the haze.
- `heightfield.js`: a 2.5D max-height grid used for camera collision and for ray-marching viewpoint candidates.

**Rendering** (`src/render/`)
- A matte white `MeshStandardMaterial`, a sun with a shadow map re-fitted to the view every frame, and a strong blue hemisphere light. The blue shade comes from that light.
- Planar-reflection water that works with both perspective and orthographic cameras.
- Post-processing: N8AO ambient occlusion with a blue tint, then analytic height fog and distance haze from the depth buffer, bloom, Neutral tone mapping, a grade that pulls shadows toward azure and highlights toward neutral white, a light vignette, and SMAA.

**Camera** (`src/camera/`)
- `shots.js`: random viewpoints of several kinds: aerial, rooftop edge, river cruise, down an avenue, landmark orbit and harbour skyline. Each candidate is scored by marching 46 rays through the heightfield. It rejects walls in the face, low clearance and frames without city, and rewards depth, some water, landmarks and side lighting.
- `director.js`: switches between Drift and Explore, runs a white-flash cut between shots, and handles a dolly-zoom morph between perspective and true orthographic isometric.

The resolution steps down automatically if the GPU can't hold about 38 fps.
