# White City

A procedural, all-white cityscape in the spirit of the Mirror's Edge title screen: clean untextured towers, soft blue shade, white haze, and a calm river that mirrors the skyline. It also has an **Office** world with generated Mirror's Edge style interiors. Built with Three.js.

```bash
npm install
npm run dev
```

Add `?seed=1234` to the URL to reproduce a specific city, or `?world=office&seed=1234` for an office. The current world and seed are always written back to the URL.

## Controls

| Key | Action |
| --- | --- |
| O | Switch between the **City** and **Office** worlds |
| Space | Toggle **Drift** (automatic camera) / **Explore** |
| R | Jump to a random viewpoint |
| I | Toggle perspective / isometric |
| T | Tour: cycle viewpoints automatically |
| C | Colour accents on/off |
| M | Music on/off (Shift+M: next tune) |
| N | Generate a new city / office |
| G | Settings panel |
| H | Hide the control dock |
| F | Fullscreen |

**Explore, perspective:** drag to look, right-drag to pan, scroll to zoom, WASD to fly, Q/E to go down/up, Shift for speed.
**Explore, isometric:** drag to pan, right-drag to rotate, scroll to zoom, WASD to move, Q/E to rotate 90°.

Dragging, scrolling or pressing a movement key while drifting switches to Explore.

## Office world

Every office is a whole storey of a tower, generated from a seed: typically 30–50 spaces on a 52–68 m by 34–38 m floor plate, sitting 25–80 m above the street among other towers.
- **Plan:** perimeter rooms along both facades, a corridor inside each, and a middle zone with the lift and washroom core and back-to-back rooms. Cross corridors near the end facades close the loop.
- **Atrium:** a double or triple height lobby cuts through one side. Its mezzanine (sometimes L-shaped) has an open steel stair and looks into glass-fronted rooms on the floor above.
- **Spaces:** private offices, open-plan desk areas, meeting rooms, lounges, break rooms with kitchens, print rooms, store rooms, the lift lobby and the reception.
- **Walls:** glass partitions with frosted bands and glass doors, solid walls with doors, colonnades and arcades onto the atrium, curtain walls with deep mullions (sometimes with sunshades) outside.
- **Colour:** one bold accent colour (lime, yellow, orange, blue, magenta, red or teal) against white, grey tile and concrete. Monochrome offices are soaked in their colour.
- **Furnishing:**
  - seating: tub and box sofas, steel-framed armchairs, leather meeting chairs, beam seating
  - tables and desks: wood boardroom tables, executive desks with twin screens and lamps, back-to-back desk rows with dividers
  - display cases with city models, kitchens and café tables, shelving
  - wall pieces: wall TVs, abstract paintings, painted monograms of the (fictional) firm, a pylon sign at reception
  - overhead and planting: ring, disc and square pendants, serpentine ceiling soffits, bamboo and other planters
- **Textures:** all drawn in code, with normal and roughness maps:
  - porcelain and dark tile, quarter-turned carpet tiles
  - mineral and perforated ceiling tiles, painted plaster and panelled walls
  - board-marked concrete with tie holes, walnut veneer, leather, brushed steel
  - the skyline's window facades
- **Lighting:**
  - sun through the glazing, and a planar reflection on the polished ground floor
  - wall-washing downlights
  - a low-resolution bounce map, a cheap stand-in for baked GI: rooms are brighter near their windows, and accent carpets and walls tint the light around them

In Drift the camera tours the floor, always heading somewhere it hasn't shown yet:
- walks between rooms along A* paths
- corner views that frame a room's focal point
- glimpses through glass partitions
- corridor dollies, views from the mezzanine and cranes up the atrium

After 8–11 shots it moves on to a freshly generated office. Explore uses collision against the walls and furniture. Isometric shows the whole floor as a cut-away dollhouse.

## Music

The soundtrack is generated, not recorded: ambient electronic in the spirit of the game's menu music. Each tune is composed on the fly and synthesised live with Web Audio, so there are no audio files and no copyrighted material.

`src/audio/composer.js` writes each tune:
- a minor key (Aeolian, Dorian or Phrygian) and a tempo of 98–118 BPM
- a slow chord loop with open, cold voicings, sometimes over a sustained bass note
- a 16th-note synth sequence
- a short, sparse electric-piano motif that repeats with small variations
- an arrangement that builds from an intro, grows into the main groove, drops to a breakdown, returns and fades out

`src/audio/music.js` plays each tune with:
- stereo pads
- the sequence through a sweeping resonant filter
- a pulsing sub-bass
- a soft deep kick with side-chain pumping
- crisp hats, sparse claps, digital ticks and noise risers
- a mellow FM electric piano soaked in ping-pong delay and reverb

A new tune starts when one ends, after about two minutes.

Browsers don't allow audio before you interact with the page, so a small "Click anywhere for music" hint shows until your first click, tap or keypress. **M** toggles the music, **Shift+M** skips to a new tune, and the choice is remembered. Under Settings → Music you can see what's playing, change the volume, or set a **Custom track URL**: a direct link to an audio file you have the rights to, played in a loop instead. YouTube and SoundCloud page links won't work there, since those services only allow playback through their own visible players.

## Deploying (GitHub Pages)

The build uses relative paths (`base: './'`), so `dist/` works from any sub-path or static host.

1. Create an empty repository on GitHub. Pages is free for public repositories.
2. Push this repo to it:
   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. In the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

The workflow in `.github/workflows/deploy.yml` builds and publishes every push to `main`. You can also start it by hand from the Actions tab. The site appears at `https://<you>.github.io/<repo>/`.

To check the production build locally, run `npm run build && npm run preview`. For any other static host (Netlify, Cloudflare Pages, itch.io and so on), upload the contents of `dist/`.

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

**Office** (`src/office/`)
- `plan.js`: the floor plan, made of axis-aligned rooms on each level that tile the plate exactly.
- `generator.js`: walls from shared room edges, door and opening policy, glazing, floors, ceilings and the mezzanines. Everything is boxes, so collisions, rays and navigation use a simple list of colliders.
- `decor.js`: furnishing and ceiling fixtures for each kind of space, plus focal points for the camera.
- `furniture.js`, `textures.js`: the furniture and fixture library, and the canvas-drawn textures (albedo, normal and roughness).
- `builder.js`: merges everything into meshes per material and floor chunk, with world-scale UVs.
- `lightmap.js`: the bounce-light maps.
- `mirror.js`: the planar floor reflection.
- `nav.js`: walkable grids with connected areas, A* and path smoothing.
- `shots.js`: the office viewpoint planner.
- `index.js`: materials and shader hooks, a collider grid for fast ray casts and collision, and the cut-away.
- `world.js`: the adapter the camera director uses (`src/city/world.js` is the city's equivalent).

**Camera** (`src/camera/`)
- `shots.js`: random viewpoints of several kinds: aerial, rooftop edge, river cruise, down an avenue, landmark orbit and harbour skyline. Each candidate is scored by marching 46 rays through the heightfield. It rejects walls in the face, low clearance and frames without city, and rewards depth, some water, landmarks and side lighting.
- `director.js`: switches between Drift and Explore, runs a white-flash cut between shots, and handles a dolly-zoom morph between perspective and true orthographic isometric.

The resolution steps down automatically if the GPU can't hold about 38 fps.
