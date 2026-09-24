import * as THREE from 'three';

// The city seen from inside the office and the mall: a street grid of
// blocks on raised pavements, filled with podium towers, stepped towers,
// slabs and low-rise blocks with rooftop plant, plus the odd park. Pure data
// from planSkyline() (so it can be tested headless); buildSkyline() turns it
// into three instanced meshes.
//
// site:     { x0, z0, x1, z1 } the plot the office / mall stands on (kept clear)
// groundY:  street level
// radius:   how far out the city goes
// downtown: centre of the tallest cluster
// tints:    facade colours to pick from

export function planSkyline(rng, { site, groundY = 0, radius = 1100, downtown = { x: 0, z: 0 }, tints = ['#f3f3f1'], rise = 1, sitePad = false }) {
  const facades = []; // boxes with windows
  const plain = []; // pavements, parapets, rooftop plant, masts
  const trees = [];
  const G = groundY;

  // Street lines along one axis: the site's own block first, then blocks
  // alternating with streets outward in both directions.
  const lines = (lo, hi) => {
    const out = [[lo, hi]];
    for (const dir of [1, -1]) {
      let a = dir > 0 ? hi : lo;
      while (Math.abs(a) < radius) {
        a += dir * rng.range(15, 24); // street
        const w = rng.chance(0.12) ? rng.range(110, 150) : rng.range(46, 92); // block (sometimes a superblock)
        out.push(dir > 0 ? [a, a + w] : [a - w, a]);
        a += dir * w;
      }
    }
    return out;
  };
  const m = rng.range(8, 16);
  const X = lines(site.x0 - m, site.x1 + m);
  const Z = lines(site.z0 - m, site.z1 + m);

  const tint = () => rng.pick(tints);
  const box = (list, x0, y0, z0, x1, y1, z1, color) => {
    if (x1 - x0 < 0.2 || y1 - y0 < 0.05 || z1 - z0 < 0.2) return;
    list.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, y0, h: y1 - y0, tint: color });
  };

  // Rooftop plant: boxes, a lift overrun, sometimes a mast.
  const roof = (x0, z0, x1, z1, y, big) => {
    const w = x1 - x0;
    const d = z1 - z0;
    box(plain, x0, y, z0, x1, y + 1.1, z0 + 0.35, '#f4f4f2');
    box(plain, x0, y, z1 - 0.35, x1, y + 1.1, z1, '#f4f4f2');
    box(plain, x0, y, z0, x0 + 0.35, y + 1.1, z1, '#f4f4f2');
    box(plain, x1 - 0.35, y, z0, x1, y + 1.1, z1, '#f4f4f2');
    const n = big ? rng.int(1, 3) : rng.int(2, 6);
    for (let i = 0; i < n; i++) {
      const bw = big ? rng.range(0.25, 0.45) * w : rng.range(1.6, 4);
      const bd = big ? rng.range(0.25, 0.45) * d : rng.range(1.2, 3);
      const bh = big ? rng.range(3, 7) : rng.range(1.2, 2.6);
      if (bw > w - 2 || bd > d - 2) continue;
      const cx = rng.range(x0 + 1 + bw / 2, x1 - 1 - bw / 2);
      const cz = rng.range(z0 + 1 + bd / 2, z1 - 1 - bd / 2);
      box(plain, cx - bw / 2, y, cz - bd / 2, cx + bw / 2, y + bh, cz + bd / 2, rng.pick(['#f6f6f4', '#e8eaec', '#dfe2e5']));
    }
    if (big && rng.chance(0.3)) {
      const cx = (x0 + x1) / 2 + rng.range(-0.2, 0.2) * w;
      const cz = (z0 + z1) / 2 + rng.range(-0.2, 0.2) * d;
      const s = rng.range(0.5, 0.9);
      box(plain, cx - s, y, cz - s, cx + s, y + rng.range(10, 30), cz + s, '#e9ebed');
    }
  };

  // One building on a lot. dist = distance from the site (for detail).
  const building = (x0, z0, x1, z1, dist) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const dc = Math.hypot((x0 + x1) / 2 - downtown.x, (z0 + z1) / 2 - downtown.z);
    const core = Math.exp(-dc / 420);
    const tall = rng.next() ** 1.6 * (40 + core * 210) * rise;
    const h = rng.range(12, 34) + tall;
    const c = tint();
    const near = dist < 450;
    if (h < 38 || Math.min(w, d) < 14) {
      // Low-rise block filling the lot.
      box(facades, x0, G, z0, x1, G + h, z1, c);
      if (near) roof(x0, z0, x1, z1, G + h, false);
      return;
    }
    const type = rng.weighted([
      ['podium', 3],
      ['stepped', 2],
      ['plain', 2],
      ['slab', 1],
      ['twin', w > 40 || d > 40 ? 1 : 0],
    ]);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    if (type === 'plain') {
      box(facades, x0, G, z0, x1, G + h, z1, c);
      if (near) roof(x0, z0, x1, z1, G + h, true);
    } else if (type === 'podium' || type === 'twin') {
      const ph = rng.range(8, 20);
      box(facades, x0, G, z0, x1, G + ph, z1, rng.chance(0.5) ? c : tint());
      if (near) roof(x0, z0, x1, z1, G + ph, false);
      const k = rng.range(0.5, 0.75);
      if (type === 'twin') {
        const alongX = w >= d;
        for (const s of [-1, 1]) {
          const tw = alongX ? w * 0.36 : w * k;
          const td = alongX ? d * k : d * 0.36;
          const tx = alongX ? cx + s * w * 0.24 : cx;
          const tz = alongX ? cz : cz + s * d * 0.24;
          const th = h * rng.range(0.85, 1.1);
          box(facades, tx - tw / 2, G + ph, tz - td / 2, tx + tw / 2, G + th, tz + td / 2, c);
          if (near) roof(tx - tw / 2, tz - td / 2, tx + tw / 2, tz + td / 2, G + th, true);
        }
      } else {
        const tw = w * k;
        const td = d * rng.range(0.5, 0.75);
        const tx = cx + rng.range(-0.5, 0.5) * (w - tw);
        const tz = cz + rng.range(-0.5, 0.5) * (d - td);
        box(facades, tx - tw / 2, G + ph, tz - td / 2, tx + tw / 2, G + h, tz + td / 2, c);
        if (near) roof(tx - tw / 2, tz - td / 2, tx + tw / 2, tz + td / 2, G + h, true);
      }
    } else if (type === 'stepped') {
      let [a0, b0, a1, b1] = [x0, z0, x1, z1];
      let y = G;
      const tiers = rng.int(2, 4);
      for (let t = 0; t < tiers; t++) {
        const top = t === tiers - 1 ? G + h : y + (G + h - y) * rng.range(0.35, 0.6);
        box(facades, a0, y, b0, a1, top, b1, c);
        if (near && t === tiers - 1) roof(a0, b0, a1, b1, top, true);
        y = top;
        const iw = (a1 - a0) * rng.range(0.07, 0.16);
        const id = (b1 - b0) * rng.range(0.07, 0.16);
        a0 += iw;
        a1 -= iw;
        b0 += id;
        b1 -= id;
      }
    } else {
      // Slab: thin and long across the lot.
      const alongX = w >= d;
      const t = rng.range(12, 18);
      const sx0 = alongX ? x0 + 1.5 : cx - t / 2;
      const sx1 = alongX ? x1 - 1.5 : cx + t / 2;
      const sz0 = alongX ? cz - t / 2 : z0 + 1.5;
      const sz1 = alongX ? cz + t / 2 : z1 - 1.5;
      box(facades, sx0, G, sz0, sx1, G + h * 0.8, sz1, c);
      if (near) roof(sx0, sz0, sx1, sz1, G + h * 0.8, true);
      box(facades, x0, G, z0, x1, G + 6, z1, tint());
    }
  };

  // Split a block into lots (finer near the site).
  const lots = (x0, z0, x1, z1, target, out) => {
    const w = x1 - x0;
    const d = z1 - z0;
    if (Math.max(w, d) < target * 1.4) {
      out.push([x0, z0, x1, z1]);
      return;
    }
    const gap = rng.chance(0.4) ? rng.range(3, 7) : 0;
    if (w >= d) {
      const s = x0 + w * rng.range(0.35, 0.65);
      lots(x0, z0, s - gap / 2, z1, target, out);
      lots(s + gap / 2, z0, x1, z1, target, out);
    } else {
      const s = z0 + d * rng.range(0.35, 0.65);
      lots(x0, z0, x1, s - gap / 2, target, out);
      lots(x0, s + gap / 2, x1, z1, target, out);
    }
  };

  const tree = (x, z, r) => trees.push({ x, z, y: G, r, tint: rng.pick(['#cfdcb8', '#bcd0a4', '#dfe6d2']) });

  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < Z.length; j++) {
      const [x0, x1] = X[i];
      const [z0, z1] = Z[j];
      if (i === 0 && j === 0) {
        // The site's own block: only a pavement round it, if asked.
        if (sitePad) box(plain, x0, G, z0, x1, G + 0.18, z1, '#eceeef');
        continue;
      }
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const dist = Math.hypot(cx, cz);
      if (dist - Math.hypot(x1 - x0, z1 - z0) / 2 > radius) continue;
      // Pavement pad (streets are the ground between pads).
      box(plain, x0, G, z0, x1, G + 0.18, z1, '#eceeef');
      const kind = rng.weighted([
        ['built', 12],
        ['park', dist < 700 ? 1 : 0.4],
        ['square', 0.5],
      ]);
      const inset = 2.5;
      if (kind === 'park') {
        box(plain, x0 + inset, G + 0.18, z0 + inset, x1 - inset, G + 0.3, z1 - inset, '#d5dfc6');
        const n = Math.round(((x1 - x0) * (z1 - z0)) / 90);
        for (let k = 0; k < n; k++) tree(rng.range(x0 + 5, x1 - 5), rng.range(z0 + 5, z1 - 5), rng.range(2.2, 4.2));
        continue;
      }
      if (kind === 'square') {
        // A paved square with one pavilion and a ring of trees.
        const pw = (x1 - x0) * 0.3;
        const pd = (z1 - z0) * 0.3;
        box(facades, cx - pw / 2, G + 0.18, cz - pd / 2, cx + pw / 2, G + rng.range(5, 9), cz + pd / 2, tint());
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          tree(cx + Math.cos(a) * (x1 - x0) * 0.38, cz + Math.sin(a) * (z1 - z0) * 0.38, rng.range(2, 3));
        }
        continue;
      }
      const target = dist < 350 ? rng.range(24, 40) : dist < 700 ? rng.range(40, 70) : 200;
      const L = [];
      lots(x0 + inset, z0 + inset, x1 - inset, z1 - inset, target, L);
      for (const [a0, b0, a1, b1] of L) building(a0 + rng.range(0, 2), b0 + rng.range(0, 2), a1 - rng.range(0, 2), b1 - rng.range(0, 2), dist);
      // Street trees along the near blocks.
      if (dist < 320 && rng.chance(0.6)) {
        for (let x = x0 + 4; x < x1 - 2; x += rng.range(8, 11)) {
          tree(x, z0 + 1.2, rng.range(1.6, 2.4));
          tree(x, z1 - 1.2, rng.range(1.6, 2.4));
        }
      }
    }
  }
  return { facades, plain, trees, groundY: G, radius };
}

// Instanced meshes for a planned skyline. Materials are shared with the
// caller (facade) or owned here (plain, trees; disposed with the group).
export function buildSkyline(sky, facadeMat) {
  const group = new THREE.Group();
  group.name = 'skyline';
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const blob = new THREE.IcosahedronGeometry(1, 1).scale(1, 1.15, 1).translate(0, 1.05, 0);
  const plainMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 });
  const treeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const inst = (geo, mat, list, place) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => {
      place(b);
      mesh.setMatrixAt(i, m4.compose(v, q, s));
      mesh.setColorAt(i, col.set(b.tint));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.group = 'backdrop';
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  const boxAt = (b) => {
    v.set(b.x, b.y0, b.z);
    s.set(b.w, b.h, b.d);
  };
  inst(unit, facadeMat, sky.facades, boxAt);
  inst(unit, plainMat, sky.plain, boxAt);
  inst(blob, treeMat, sky.trees, (t) => {
    v.set(t.x, t.y, t.z);
    s.set(t.r, t.r, t.r);
  });
  group.userData.dispose = () => {
    unit.dispose();
    blob.dispose();
    plainMat.dispose();
    treeMat.dispose();
    for (const c of group.children) c.dispose?.();
  };
  return group;
}
