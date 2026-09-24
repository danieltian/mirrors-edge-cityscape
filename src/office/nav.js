// Walkable grid for one floor level: cells are blocked where any collider
// intersects the body height band (inflated by the camera radius). A* finds
// paths through doorways; string pulling straightens them.

export class NavGrid {
  constructor(bounds, { cell = 0.5, band, colliders, walkable, inflate = 0.45 }) {
    this.x0 = bounds.x0;
    this.z0 = bounds.z0;
    this.cell = cell;
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / cell);
    this.nz = Math.ceil((bounds.z1 - bounds.z0) / cell);
    this.blocked = new Uint8Array(this.nx * this.nz);
    this.y = band[0];
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.center(i, j);
        if (!walkable(x, z)) this.blocked[j * this.nx + i] = 1;
      }
    }
    for (const c of colliders) {
      if (c.y1 <= band[0] || c.y0 >= band[1]) continue;
      const i0 = Math.max(0, Math.floor((c.x0 - inflate - this.x0) / cell));
      const i1 = Math.min(this.nx - 1, Math.floor((c.x1 + inflate - this.x0) / cell));
      const j0 = Math.max(0, Math.floor((c.z0 - inflate - this.z0) / cell));
      const j1 = Math.min(this.nz - 1, Math.floor((c.z1 + inflate - this.z0) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.blocked[j * this.nx + i] = 1;
    }
    this.free = [];
    for (let k = 0; k < this.blocked.length; k++) if (!this.blocked[k]) this.free.push(k);
    this.label();
  }

  // Connected components (4-neighbour), so impossible paths fail at once.
  label() {
    const { nx, nz } = this;
    this.comp = new Int32Array(this.blocked.length).fill(-1);
    this.compSize = [];
    const stack = [];
    for (const start of this.free) {
      if (this.comp[start] >= 0) continue;
      const id = this.compSize.length;
      let n = 0;
      stack.push(start);
      this.comp[start] = id;
      while (stack.length) {
        const k = stack.pop();
        n++;
        const i = k % nx;
        const j = (k - i) / nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          const nk = nj * nx + ni;
          if (this.blocked[nk] || this.comp[nk] >= 0) continue;
          this.comp[nk] = id;
          stack.push(nk);
        }
      }
      this.compSize.push(n);
    }
    this.main = this.compSize.indexOf(Math.max(0, ...this.compSize));
  }

  connected(ax, az, bx, bz) {
    const a = this.cellOf(ax, az);
    const b = this.cellOf(bx, bz);
    return a >= 0 && b >= 0 && !this.blocked[a] && !this.blocked[b] && this.comp[a] === this.comp[b];
  }

  // Random free cell inside a rectangle (in the main connected area if possible).
  randomIn(rng, r, margin = 0.6, tries = 40) {
    for (let t = 0; t < tries; t++) {
      const x = rng.range(r.x0 + margin, r.x1 - margin);
      const z = rng.range(r.z0 + margin, r.z1 - margin);
      const k = this.cellOf(x, z);
      if (k >= 0 && !this.blocked[k] && (this.comp[k] === this.main || t > tries / 2)) return this.center(k % this.nx, Math.floor(k / this.nx));
    }
    return null;
  }

  center(i, j) {
    return [this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell];
  }

  cellOf(x, z) {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  isFree(x, z) {
    const k = this.cellOf(x, z);
    return k >= 0 && !this.blocked[k];
  }

  randomFree(rng) {
    if (!this.free.length) return null;
    for (let t = 0; t < 20; t++) {
      const k = this.free[Math.floor(rng.next() * this.free.length)];
      if (this.comp[k] === this.main || t === 19) return this.center(k % this.nx, Math.floor(k / this.nx));
    }
    return null;
  }

  // Straight-line visibility across free cells.
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / (this.cell * 0.4)));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      if (!this.isFree(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  findPath(ax, az, bx, bz) {
    const start = this.cellOf(ax, az);
    const goal = this.cellOf(bx, bz);
    if (start < 0 || goal < 0 || this.blocked[start] || this.blocked[goal] || this.comp[start] !== this.comp[goal]) return null;
    const { nx } = this;
    const N = this.blocked.length;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    const gx = goal % nx;
    const gz = Math.floor(goal / nx);
    const h = (k) => {
      const dx = Math.abs((k % nx) - gx);
      const dz = Math.abs(Math.floor(k / nx) - gz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    g[start] = 0;
    heap.push(start, h(start));
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
    ];
    while (heap.size) {
      const k = heap.pop();
      if (k === goal) break;
      if (closed[k]) continue;
      closed[k] = 1;
      const i = k % nx;
      const j = Math.floor(k / nx);
      for (const [di, dj, cost] of dirs) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= this.nz) continue;
        const nk = nj * nx + ni;
        if (this.blocked[nk] || closed[nk]) continue;
        if (di && dj && (this.blocked[j * nx + ni] || this.blocked[nj * nx + i])) continue; // no corner cutting
        const ng = g[k] + cost;
        if (ng < g[nk]) {
          g[nk] = ng;
          came[nk] = k;
          heap.push(nk, ng + h(nk));
        }
      }
    }
    if (came[goal] < 0 && goal !== start) return null;
    const cells = [];
    for (let k = goal; k >= 0; k = came[k]) {
      cells.push(k);
      if (k === start) break;
    }
    cells.reverse();
    const pts = cells.map((k) => this.center(k % nx, Math.floor(k / nx)));
    return this.smooth(pts);
  }

  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.los(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}

class MinHeap {
  constructor() {
    this.k = [];
    this.p = [];
  }
  get size() {
    return this.k.length;
  }
  push(key, pri) {
    const { k, p } = this;
    k.push(key);
    p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[par], k[i]] = [k[i], k[par]];
      [p[par], p[i]] = [p[i], p[par]];
      i = par;
    }
  }
  pop() {
    const { k, p } = this;
    const top = k[0];
    const lk = k.pop();
    const lp = p.pop();
    if (k.length) {
      k[0] = lk;
      p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
