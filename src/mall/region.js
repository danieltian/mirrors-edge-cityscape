// Free-space bookkeeping inside an arbitrary walkable region.
export class Region {
  constructor(test, bounds) {
    this.test = test;
    this.bounds = bounds;
    this.used = [];
  }
  reserve(x0, z0, x1, z1) {
    this.used.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  }
  free(x0, z0, x1, z1, pad = 0.4) {
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) if (!this.test(x, z)) return false;
    for (const u of this.used) if (x0 < u[2] + pad && x1 > u[0] - pad && z0 < u[3] + pad && z1 > u[1] - pad) return false;
    return true;
  }
  take(x0, z0, x1, z1, pad) {
    if (!this.free(x0, z0, x1, z1, pad)) return false;
    this.reserve(x0, z0, x1, z1);
    return true;
  }
  spot(rng, w, d, tries = 40, pad) {
    const r = this.bounds;
    for (let i = 0; i < tries; i++) {
      const x = rng.range(r.x0 + w / 2, r.x1 - w / 2);
      const z = rng.range(r.z0 + d / 2, r.z1 - d / 2);
      if (this.take(x - w / 2, z - d / 2, x + w / 2, z + d / 2, pad)) return { x, z };
    }
    return null;
  }
}
