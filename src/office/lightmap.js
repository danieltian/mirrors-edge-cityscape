import * as THREE from 'three';

// Soft, low-resolution "bounce" maps over the floor plan, one for the ground
// floor and one for the levels above. R = how bright the indirect light is
// (rooms are brighter near their windows, the atrium brighter still),
// G = how strongly big accent surfaces nearby (carpets, painted walls) tint
// it. Material shaders scale their ambient lighting with it: a cheap
// stand-in for the colour bleeding of baked global illumination.

const RES = 0.3;

export function bounceMaps(o) {
  const fp = o.footprint;
  const nx = Math.ceil((fp.x1 - fp.x0) / RES);
  const nz = Math.ceil((fp.z1 - fp.z0) / RES);
  const maps = [0, 1].map((lv) => build(o, lv, nx, nz));
  return {
    textures: maps,
    min: new THREE.Vector2(fp.x0, fp.z0),
    size: new THREE.Vector2(nx * RES, nz * RES),
    dispose() {
      for (const t of maps) t.dispose();
    },
  };
}

function roomTint(r, mono) {
  let k = 0;
  if (r.floor === 'carpet') k += mono ? 0.3 : 0.16;
  let walls = 0;
  for (const e of ['N', 'S', 'W', 'E']) if (r.finish[e] === 'wallAccent' || r.finish[e] === 'wallAccent2') walls++;
  k += walls * (mono ? 0.07 : 0.03);
  if (mono) k += 0.12;
  if (r.type === 'atrium') k *= 0.6;
  return Math.min(mono ? 0.5 : 0.22, k);
}

function build(o, level, nx, nz) {
  const fp = o.footprint;
  const rooms = o.rooms.filter((r) => (level === 0 ? r.level === 0 : r.level >= 1 || r.type === 'atrium'));
  const owner = new Int32Array(nx * nz).fill(-1);
  const bright = new Float32Array(nx * nz).fill(1);
  const tint = new Float32Array(nx * nz);
  const windows = rooms.map((r) => {
    const out = [];
    for (const e of ['N', 'S', 'W', 'E']) {
      for (const sp of r.spans[e]) {
        if (sp.kind !== 'window' && !(sp.kind === 'glass' && r.type !== 'atrium' && level === 0)) continue;
        out.push({ e, a0: sp.a0, a1: sp.a1, c: e === 'N' ? r.z0 : e === 'S' ? r.z1 : e === 'W' ? r.x0 : r.x1, weight: sp.kind === 'window' ? 1 : 0.3 });
      }
    }
    return out;
  });
  const accentWalls = rooms.map((r) => ['N', 'S', 'W', 'E'].filter((e) => r.finish[e] === 'wallAccent' || r.finish[e] === 'wallAccent2'));
  const base = rooms.map((r) => roomTint(r, o.mono));
  for (let j = 0; j < nz; j++) {
    const z = fp.z0 + (j + 0.5) * RES;
    for (let i = 0; i < nx; i++) {
      const x = fp.x0 + (i + 0.5) * RES;
      const k = j * nx + i;
      const ri = rooms.findIndex((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1);
      if (ri < 0) continue;
      owner[k] = ri;
      const r = rooms[ri];
      // Daylight falls off away from the glazing.
      let day = 0;
      for (const w of windows[ri]) {
        const horiz = w.e === 'N' || w.e === 'S';
        const a = horiz ? x : z;
        const along = a < w.a0 ? w.a0 - a : a > w.a1 ? a - w.a1 : 0;
        const d = Math.hypot(Math.abs((horiz ? z : x) - w.c), along);
        day = Math.max(day, w.weight * Math.exp(-d / 4.5));
      }
      bright[k] = r.type === 'atrium' ? 0.95 + day * 0.15 : r.type === 'corridor' ? 0.8 + day * 0.3 : 0.76 + day * 0.34;
      // Accent walls tint the light near them.
      let t = base[ri];
      for (const e of accentWalls[ri]) {
        const d = e === 'N' ? z - r.z0 : e === 'S' ? r.z1 - z : e === 'W' ? x - r.x0 : r.x1 - x;
        t += Math.max(0, 1 - d / 1.8) * (o.mono ? 0.2 : 0.12);
      }
      tint[k] = Math.min(o.mono ? 0.6 : 0.3, t);
    }
  }
  // Blur within each room so values fade smoothly toward walls and doors.
  const tmpB = new Float32Array(nx * nz);
  const tmpT = new Float32Array(nx * nz);
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const own = owner[k];
        let sb = 0;
        let st = 0;
        let n = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
            const kk = jj * nx + ii;
            if (owner[kk] !== own) continue;
            sb += bright[kk];
            st += tint[kk];
            n++;
          }
        }
        tmpB[k] = sb / n;
        tmpT[k] = st / n;
      }
    }
    bright.set(tmpB);
    tint.set(tmpT);
  }
  const data = new Uint8Array(nx * nz * 4);
  for (let k = 0; k < nx * nz; k++) {
    data[k * 4] = Math.min(255, Math.round(bright[k] * 127.5));
    data[k * 4 + 1] = Math.round(tint[k] * 255);
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
