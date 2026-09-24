# White City

A procedural, all-white cityscape in the spirit of the Mirror's Edge title screen: clean untextured towers, soft blue shade, white haze, and a calm river that mirrors the skyline. It also has two generated interior worlds in the same style: an **Office** floor and a **Mall**. Built with Three.js.

```bash
npm install
npm run dev
```

Add `?seed=1234` to the URL to reproduce a specific city, or `?world=office&seed=1234` / `?world=mall&seed=1234` for an office or a mall. The current world and seed are always written back to the URL.

## Controls

| Key | Action |
| --- | --- |
| 1 / 2 / 3 | Switch to the **City**, **Office** or **Mall** world (O cycles through them) |
| Space | Toggle **Drift** (automatic tour, a new view every 8 s) / **Explore** |
| R | Jump to a random viewpoint |
| I | Toggle perspective / isometric |
| C | Colour accents on/off |
| M | Music on/off (Shift+M: next tune) |
| N | New seed: generate a new city / office / mall |
| G | Settings panel |
| H | Hide the control dock |
| F | Fullscreen |

**Explore, perspective:** drag to look, right-drag to pan, scroll to zoom, WASD to fly, Q/E to go down/up, Shift for speed.
**Explore, isometric:** drag to pan, right-drag to rotate, scroll to zoom, WASD to move, Q/E to rotate 90°.

Every dock button shows its shortcut. The mouse and movement keys only steer in Explore; clicking while drifting (for example to start the music) leaves the tour running. How long Drift holds each view is in Settings → Camera.

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

Outside the windows is a whole city (shared with the mall, `src/render/skyline.js`): a street grid of blocks on raised pavements, filled with podium towers, stepped towers, twin towers, slabs and low-rise blocks with parapets, rooftop plant and masts, plus parks and paved squares with trees. The tallest cluster sits around a downtown centre, and the floor is 24–80 m up, so some roofs are below the windows and some towers rise above them.

## Mall world

A shopping mall in the spirit of the game's New Eden Mall, generated from a seed. No two come out alike:
- **The void:** three to five levels rise to the skylight around a void that can be chamfered, rounded, square-cornered, stadium-ended, lozenge-shaped, or swell into a rotunda at one end. It changes on every level: ends step outward, rotundas widen, and balconies (angular or curved) jut into the void or recess from it.
- **Galleries:** the fascias come in five styles:
  - accent with a black stripe (the classic)
  - accent with twin lines
  - white with an accent band
  - black with an accent band
  - a slim edge

  Railings are glass, bars or solid painted parapets. Columns are round or square: banded, tiled, plain, or in the accent colour.
- **Escalators:** a switchback stack or a straight cascade of escalator pairs crosses the void between bridges, in the accent colour, white or dark steel, sometimes with glass balustrades. Many malls have a glass lift.
- **Skylight:** a space frame, a barrel vault, a pitched glass ridge or a grid of deep beams.
- **Hanging in the void:** blue glass tubes, clusters of glowing spheres, stacked rings, a mobile of coloured discs, or nothing, plus a varying number of banners.
- **The court:** one or two centrepieces: a sofa lounge on a rug, a tiered fountain, a café, a grove of white trees, a round information desk, or a sculpture on a stage. The floor tint varies; some malls have a band of darker tile tracing the void, a field under it, or stripes.
- **Shops:** the mix of shutters, lit glass fronts and billboard bays and the unit widths vary from mall to mall, under signs for invented brands.
- **Colour:** mostly amber like the game, but also tangerine, lemon, coral, lime, aqua, scarlet, violet, green or sky blue, each with its own banner colour.
- **Light:** sun comes only through the skylight, so the void is bright and the galleries fall into warm shade the further they are from it. The accent colour tints the shadows.
- **Outside** (`src/mall/exterior.js`), each part chosen separately:
  - entrance: a glazed box with diagonal struts, a cantilevered canopy on posts or tie rods, a glass barrel vault, a giant portal frame, a glass drum with a roof disc, a space-frame canopy on branching tree columns, or a colonnaded loggia between wing walls
  - facade: stone with string courses, bold accent bands, white fins, a panel grid with accent squares, or ribbon glazing on the upper floors, in one of seven stone tints, with 0–2 giant billboards
  - plaza: a framed square, a raised terrace with grand steps down to the street, a sunken court with a fountain or tree, reflecting pools with jets, a grid of white trees, a drop-off loop with a bus shelter, or lawns with sculptures; its size, paving pattern (grid, bands, a central runway), lamps and banner poles vary too
  - either side: a colonnaded block with shops, an office tower over a glazed lobby, a car park, or an open street edge lined with trees
  - beyond: the same street-grid city as the office, with the tallest towers rising behind the mall

In Drift the camera rides the escalators, leans over the railings, walks the galleries, looks up from the court at the balconies and skylight, looks along the void from a bridge and crosses the plaza to the entrance. After 8–10 shots it moves on to a new mall. Isometric cuts the building open above the first gallery.

## Music

The soundtrack is generated, not recorded: ambient electronic in the spirit of Solar Fields' Mirror's Edge score. Each tune is composed on the fly and synthesised live with Web Audio, so there are no audio files and no copyrighted material.

`src/audio/composer.js` writes each tune in a minor key (Aeolian, Dorian or Phrygian) with open, cold chord voicings, in one of five styles:
- **Menu** (98–118 BPM): like the title screen. A soft four-on-the-floor with side-chain pumping, a 16th-note sequence through a sweeping resonant filter, a pulsing sub and a sparse electric-piano motif.
- **Run** (136–146 BPM, after "Pirandello Kruger"): fast but felt half-time. A breakbeat with the snare on the three, shuffling 16th hats and open hats, and a rolling off-beat bass. A glassy arpeggio cycles 3, 5, 6 or 7 steps against the bar so it drifts across the beat, soaked in delay. A slow FM bell melody sits over it, with glitchy stutters, risers and reverse swells, and the tune builds, breaks down and returns over several minutes. It often sits in B♭ minor like the original.
- **Drift** (70–84 BPM, beatless): long glassy or choir pads, a sub drone, sparkles, a sparse bell, sometimes a soft heartbeat kick.
- **Glass** (118–128 BPM): minimal and IDM-like. A plucked 5- or 7-step arpeggio, rim shots and clicks, a syncopated sub and a formant "choir" pad.
- **Breaks** (84–96 BPM): downtempo. A swung breakbeat, a deep sub, electric-piano chord stabs and a bell melody in the lift.

Arrangements have intros, builds, breaks and outros, with a second chord progression for the middle sections. `src/audio/music.js` plays them on a small synth rig: saw, warm, choir and glass pads; plucks; FM bells and electric piano; rolling and sub basses; kick, snare, hats, rim, clap and ticks; stutters, sparkles, risers and swells. Everything shares a ping-pong delay and a long reverb. A new tune starts when one ends, after about two to three minutes.

Browsers don't allow audio before you interact with the page, so a small "Click anywhere for music" hint shows until your first click, tap or keypress. **M** toggles the music, **Shift+M** skips to a new tune, and the choice is remembered. Under Settings → Music you can see what's playing, pick a style (or leave it on Any), change the volume, or set a **Custom track URL**: a direct link to an audio file you have the rights to, played in a loop instead. YouTube and SoundCloud page links won't work there, since those services only allow playback through their own visible players.

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
- `world.js`: the adapter the camera director uses (`src/city/world.js` is the city's equivalent; the mall reuses this one).

**Mall** (`src/mall/`)
- `plan.js`: the layout: void shape and its outline on each level, gallery ring, escalator layout and bridges, lift, shop units, entrance and plaza.
- `generator.js`: picks each mall's style, then builds floors and soffits cut around the void, fascias, railings, columns, escalators, shopfronts and interiors, the facade, entrance box, plaza and decor.
- `props.js`: mall pieces (fascia styles, escalators, the four skylights, banners and chandeliers, white trees, fountains, kiosks, lightboxes, billboards and more).
- `textures.js`: roller shutters, mosaic, paving, brand signs, banners, adverts, posters and the mall's name.
- `shots.js`: the mall viewpoint planner.
- `index.js`: materials, bounce light, walkable grids for each level and the plaza, collision and the cut-away.

**Camera** (`src/camera/`)
- `shots.js`: random viewpoints of several kinds: aerial, rooftop edge, river cruise, down an avenue, landmark orbit and harbour skyline. Each candidate is scored by marching 46 rays through the heightfield. It rejects walls in the face, low clearance and frames without city, and rewards depth, some water, landmarks and side lighting.
- `director.js`: switches between Drift and Explore, runs a white-flash cut between shots, and handles a dolly-zoom morph between perspective and true orthographic isometric.

The resolution steps down automatically if the GPU can't hold about 38 fps.
