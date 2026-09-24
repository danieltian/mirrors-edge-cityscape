// Dev-only console helpers (loaded when import.meta.env.DEV). Useful for
// tuning the look numerically and for stepping frames while the tab is hidden.
//   await __dbg.stats()        -> dark / mid / bright colour buckets
//   __dbg.shot('rooftop')      -> jump to a shot of a given kind
//   __dbg.step(n)              -> render n frames manually

export function installDebug(app) {
  const grab = async () => {
    app.step(1 / 60);
    const img = new Image();
    img.src = app.renderer.domElement.toDataURL('image/png');
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    return g;
  };

  const region = (g, x0, y0, x1, y1) => {
    const W = g.canvas.width;
    const H = g.canvas.height;
    const d = g.getImageData(Math.floor(x0 * W), Math.floor(y0 * H), Math.max(1, Math.floor((x1 - x0) * W)), Math.max(1, Math.floor((y1 - y0) * H))).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      gg += d[i + 1];
      b += d[i + 2];
      n++;
    }
    return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)];
  };

  const buckets = (g, y0 = 0.45, y1 = 0.95) => {
    const W = g.canvas.width;
    const H = g.canvas.height;
    const d = g.getImageData(0, 0, W, H).data;
    const B = { dark: [0, 0, 0, 0], mid: [0, 0, 0, 0], bright: [0, 0, 0, 0] };
    for (let y = Math.floor(H * y0); y < H * y1; y += 3) {
      for (let x = 0; x < W; x += 3) {
        const i = (y * W + x) * 4;
        const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const s = B[l < 150 ? 'dark' : l < 215 ? 'mid' : 'bright'];
        s[0] += d[i];
        s[1] += d[i + 1];
        s[2] += d[i + 2];
        s[3]++;
      }
    }
    const tot = B.dark[3] + B.mid[3] + B.bright[3];
    return Object.fromEntries(
      Object.entries(B).map(([k, s]) => [k, s[3] ? [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3]), `${Math.round((100 * s[3]) / tot)}%`] : null]),
    );
  };

  window.__dbg = {
    step(n = 1) {
      for (let i = 0; i < n; i++) app.step(1 / 60);
    },
    async stats() {
      const g = await grab();
      return { ...buckets(g), sky: region(g, 0, 0, 0.2, 0.08) };
    },
    shot(kind) {
      const d = app.director;
      const s = kind === 'hero' ? d.planner.hero() : d.planner.random(kind ? [kind] : undefined);
      d.applyShot(s);
      this.step(3);
      return { kind: s.kind, pos: d.camera.position.toArray().map(Math.round), fov: Math.round(d.camera.fov) };
    },
    // Render a frame and upload it as a JPEG to a local helper server
    // (e.g. a tiny python http.server that writes POST bodies to disk).
    async save(name = 'shot.jpg', width = 960, port = 5199) {
      app.step(1 / 60);
      const src = app.renderer.domElement;
      const cv = document.createElement('canvas');
      cv.width = width;
      cv.height = Math.round((width * src.height) / src.width);
      cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
      await fetch(`http://127.0.0.1:${port}/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
      return `${name} ${cv.width}x${cv.height}`;
    },
    // Corner view of a room of the given type (office only).
    room(type, i = 0) {
      const d = app.director;
      const P = d.planner;
      const rooms = app.office.rooms.filter((r) => r.type === type && r.level === 0);
      const room = rooms[i % Math.max(1, rooms.length)];
      if (!room) return null;
      let best = null;
      let bestScore = -Infinity;
      for (let k = 0; k < 40; k++) {
        const s = P.vista(room);
        if (!s) continue;
        const sc = P.score(P.evaluate(s.pos, s.target, s.fov), s.prefs);
        if (sc > bestScore) {
          bestScore = sc;
          best = s;
        }
      }
      if (!best) return null;
      d.applyShot({ ...best, motion: best.motion() });
      this.step(3);
      return { type, n: rooms.length, pos: d.camera.position.toArray().map(Math.round) };
    },
    clean() {
      document.getElementById('loading').style.display = 'none';
      document.querySelector('.dock').style.visibility = 'hidden';
      this.step(3);
    },
  };
}
