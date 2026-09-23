// World-scale constants (metres). The whole city is generated inside a square
// of side 2 * half centred on the origin.
export const WORLD = {
  half: 3200,
  cell: 5, // terrain + heightfield resolution
  waterY: -1.6,
  wallBottom: -9,
  chunk: 800, // instancing chunk size (enables per-chunk frustum culling)
};

// Visual defaults. Everything here is live-tweakable from the settings panel.
export const LOOK = {
  exposure: 0.8,
  toneMapping: 'Neutral',

  sunElevation: 34, // degrees
  sunAzimuth: 212, // degrees, 0 = +z, clockwise from above
  sunIntensity: 4.4,
  sunColor: '#fffaf4',

  skyLight: '#3d93dc', // hemisphere "sky" colour (drives the blue shadows)
  groundLight: '#5f9ad0', // hemisphere "ground" colour (bounce)
  hemiIntensity: 2.0,

  zenith: '#a9d1ec',
  horizon: '#e4f0f5',
  skyIntensity: 2.4,

  fogColor: '#dcebf2',
  fogDensity: 0.0001, // at ground level
  fogFalloff: 0.0008, // height falloff
  fogStart: 400, // metres of clear air before fog accumulates
  farHaze: 0.00012, // extra uniform haze beyond 3.5 km (distant hills)

  aoIntensity: 3.0,
  aoRadiusScale: 1,
  aoColor: '#0f4c86',
  aoQuality: 'Medium',
  aoHalfRes: true,

  bloomIntensity: 0.35,
  bloomThreshold: 1.15,
  bloomSmoothing: 0.25,

  shadowTint: '#3597d6',
  shadowTintAmount: 0.3,
  saturation: 1.05,
  contrast: 1.0,
  highlightNeutral: 0.6, // pull sunlit whites toward neutral white
  vignette: 0.14,

  baseDarken: 0.2, // extra darkening at building bases (fake GI)
  baseHeight: 40,

  waterColor: '#c6dce4',
  waterReflect: 0.55,

  accents: true,
};
